function humanizeToolName(name = "tool") {
  return String(name).replace(/__/g, " · ").replace(/_/g, " ");
}

function formatStepDuration(durationMs = 0) {
  const milliseconds = Math.max(0, Number(durationMs) || 0);
  if (milliseconds < 1000) return milliseconds < 1 ? "<1ms" : `${Math.round(milliseconds)}ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function normalizeTokenUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = Math.max(0, Number(usage.input_tokens ?? usage.inputTokens) || 0);
  const outputTokens = Math.max(0, Number(usage.output_tokens ?? usage.outputTokens) || 0);
  const reportedTotal = Number(usage.total_tokens ?? usage.totalTokens);
  const totalTokens = Number.isFinite(reportedTotal) && reportedTotal >= 0
    ? reportedTotal
    : inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function formatTokenCount(value = 0) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString("en-US");
}

function sessionActivities(events = [], now = Date.now()) {
  const items = [];
  let sequence = 0;
  let complete = false;
  const timestampFor = (event) => {
    const timestamp = Number(event?.timestamp);
    return Number.isFinite(timestamp) ? timestamp : now;
  };

  const add = (label, status, event, key) => {
    const startedAt = timestampFor(event);
    const item = {
      id: `${startedAt}-${sequence += 1}`,
      key,
      label,
      status,
      startedAt,
      endedAt: status === "running" ? null : startedAt,
      durationMs: status === "running" ? Math.max(0, now - startedAt) : 0,
    };
    items.push(item);
    return item;
  };
  const findRunning = (predicate) => [...items].reverse().find((item) =>
    item.status === "running" && predicate(item)
  );
  const setUsage = (item, usage) => {
    if (item) item.usage = normalizeTokenUsage(usage);
    return item;
  };
  const finish = (predicate, event, status = "completed", label) => {
    const item = findRunning(predicate);
    if (!item) return null;
    item.status = status;
    item.endedAt = timestampFor(event);
    item.durationMs = Math.max(0, item.endedAt - item.startedAt);
    if (label) item.label = label;
    return item;
  };
  const finishAll = (event, status = "completed") => {
    for (const item of items) {
      if (item.status !== "running") continue;
      item.status = status;
      item.endedAt = timestampFor(event);
      item.durationMs = Math.max(0, item.endedAt - item.startedAt);
    }
  };

  for (const event of events) {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const type = detail.type;

    if (event.title === "Prompt sent") {
      add("Send prompt", "running", event, "prompt");
    } else if (type === "composer_start") {
      finish((item) => item.key === "prompt", event);
      add("Refine the prompt", "running", event, "composer");
    } else if (type === "composer_complete") {
      setUsage(
        finish((item) => item.key === "composer", event, "completed", "Prompt refined"),
        detail.usage,
      );
    } else if (type === "start") {
      finish((item) => item.key === "prompt", event);
      finish((item) => item.key === "composer", event);
      add("Start agent run", "completed", event, "run");
    } else if (type === "turn_start") {
      add(`Model turn ${detail.turn}`, "running", event, `turn:${detail.turn}`);
    } else if (type === "turn") {
      setUsage(
        finish((item) => item.key === `turn:${detail.turn}`, event),
        detail.serverResponse?.usage || detail.usage,
      );
    } else if (type === "tool_start") {
      const item = add(`Run ${humanizeToolName(detail.name)}`, "running", event, `tool:${detail.name}`);
      if (detail.name === "run_command") item.command = String(detail.args?.command || "");
    } else if (type === "tool_result") {
      const failed = detail.output?.ok === false;
      const label = `${humanizeToolName(detail.name)} ${failed ? "failed" : "completed"}`;
      const item = finish(
        (candidate) => candidate.key === `tool:${detail.name}`,
        event,
        failed ? "failed" : "completed",
        label,
      ) || add(label, failed ? "failed" : "completed", event, `tool:${detail.name}`);
      if (detail.name === "run_command") {
        item.command ||= String(detail.args?.command || "");
        item.response = detail.output;
      }
    } else if (type === "tool_blocked") {
      add(`${humanizeToolName(detail.name)} blocked`, "failed", event, `tool:${detail.name}`);
    } else if (type === "mcp_call") {
      add(`Call ${detail.server}.${detail.name}`, "completed", event, `mcp:${detail.server}:${detail.name}`);
    } else if (type === "validation" && ["pending", "required"].includes(detail.status)) {
      const paths = Array.isArray(detail.paths) && detail.paths.length ? ` · ${detail.paths.join(", ")}` : "";
      if (!findRunning((item) => item.key === "validation")) {
        add(`Validate workspace changes${paths}`, "running", event, "validation");
      }
    } else if (type === "validation" && ["passed", "failed"].includes(detail.status)) {
      const status = detail.status === "passed" ? "completed" : "failed";
      if (!finish((item) => item.key === "validation", event, status, `Validation ${detail.status}`)) {
        add(`Validation ${detail.status}`, status, event, "validation");
      }
    } else if (type === "response_stream") {
      if (!findRunning((item) => item.key === "response")) add("Write response", "running", event, "response");
    } else if (type === "response_complete") {
      finish((item) => item.key === "response", event, "completed", "Response completed");
      complete = true;
    } else if (type === "final") {
      finishAll(event);
      if (!items.some((item) => item.key === "response")) add("Prepare final answer", "completed", event, "response");
      complete = true;
    } else if (event.title === "Error") {
      finishAll(event, "failed");
      add("Run failed", "failed", event, "error");
      complete = true;
    }
  }

  const usageItems = items.filter((item) => item.usage);
  const usage = usageItems.length === 0 ? null : usageItems.reduce((total, item) => ({
    inputTokens: total.inputTokens + item.usage.inputTokens,
    outputTokens: total.outputTokens + item.usage.outputTokens,
    totalTokens: total.totalTokens + item.usage.totalTokens,
  }), { inputTokens: 0, outputTokens: 0, totalTokens: 0 });

  return {
    current: [...items].reverse().find((item) => item.status === "running") || null,
    complete,
    items,
    usage,
  };
}

function sessionActivityRuns(events = [], now = Date.now()) {
  const starts = events.reduce((indices, event, index) => {
    if (event?.title === "Prompt sent") indices.push(index);
    return indices;
  }, []);
  if (starts.length === 0) {
    const activity = sessionActivities(events, now);
    return activity.items.length ? [activity] : [];
  }
  return starts.map((start, index) =>
    sessionActivities(events.slice(start, starts[index + 1] ?? events.length), now)
  ).filter((activity) => activity.items.length > 0);
}

export { formatStepDuration, formatTokenCount, normalizeTokenUsage, sessionActivities, sessionActivityRuns };
