function humanizeToolName(name = "tool") {
  return String(name).replace(/__/g, " · ").replace(/_/g, " ");
}

function sessionActivities(events = []) {
  const items = [];
  let sequence = 0;
  let complete = false;

  const add = (label, status, event, key) => {
    const item = {
      id: `${event.timestamp || Date.now()}-${sequence += 1}`,
      key,
      label,
      status,
      timestamp: event.timestamp || Date.now(),
    };
    items.push(item);
    return item;
  };
  const findRunning = (predicate) => [...items].reverse().find((item) =>
    item.status === "running" && predicate(item)
  );
  const finish = (predicate, status = "completed", label) => {
    const item = findRunning(predicate);
    if (!item) return null;
    item.status = status;
    if (label) item.label = label;
    return item;
  };
  const finishAll = (status = "completed") => {
    for (const item of items) {
      if (item.status === "running") item.status = status;
    }
  };

  for (const event of events) {
    const detail = event?.detail && typeof event.detail === "object" ? event.detail : {};
    const type = detail.type;

    if (event.title === "Prompt sent") {
      add("Send prompt", "running", event, "prompt");
    } else if (type === "composer_start") {
      finish((item) => item.key === "prompt");
      add("Refine the prompt", "running", event, "composer");
    } else if (type === "composer_complete") {
      finish((item) => item.key === "composer", "completed", "Prompt refined");
    } else if (type === "start") {
      finish((item) => item.key === "prompt");
      finish((item) => item.key === "composer");
      add("Start agent run", "completed", event, "run");
    } else if (type === "turn_start") {
      add(`Model turn ${detail.turn}`, "running", event, `turn:${detail.turn}`);
    } else if (type === "turn") {
      finish((item) => item.key === `turn:${detail.turn}`);
    } else if (type === "tool_start") {
      add(`Run ${humanizeToolName(detail.name)}`, "running", event, `tool:${detail.name}`);
    } else if (type === "tool_result") {
      const failed = detail.output?.ok === false;
      const label = `${humanizeToolName(detail.name)} ${failed ? "failed" : "completed"}`;
      if (!finish((item) => item.key === `tool:${detail.name}`, failed ? "failed" : "completed", label)) {
        add(label, failed ? "failed" : "completed", event, `tool:${detail.name}`);
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
      if (!finish((item) => item.key === "validation", status, `Validation ${detail.status}`)) {
        add(`Validation ${detail.status}`, status, event, "validation");
      }
    } else if (type === "response_stream") {
      finish((item) => item.key.startsWith("turn:"));
      if (!findRunning((item) => item.key === "response")) add("Write response", "running", event, "response");
    } else if (type === "response_complete") {
      finish((item) => item.key === "response", "completed", "Response completed");
      complete = true;
    } else if (type === "final") {
      finishAll();
      if (!items.some((item) => item.key === "response")) add("Prepare final answer", "completed", event, "response");
      complete = true;
    } else if (event.title === "Error") {
      finishAll("failed");
      add("Run failed", "failed", event, "error");
      complete = true;
    }
  }

  return {
    current: [...items].reverse().find((item) => item.status === "running") || null,
    complete,
    items,
  };
}

function sessionActivityRuns(events = []) {
  const starts = events.reduce((indices, event, index) => {
    if (event?.title === "Prompt sent") indices.push(index);
    return indices;
  }, []);
  if (starts.length === 0) {
    const activity = sessionActivities(events);
    return activity.items.length ? [activity] : [];
  }
  return starts.map((start, index) =>
    sessionActivities(events.slice(start, starts[index + 1] ?? events.length))
  ).filter((activity) => activity.items.length > 0);
}

export { humanizeToolName, sessionActivities, sessionActivityRuns };
