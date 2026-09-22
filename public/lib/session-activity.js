import { contextUsageForTurn } from "./model-context.js";

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

function calculateTokenCost(usage, pricing) {
  const normalizedUsage = normalizeTokenUsage(usage);
  if (pricing?.inputCost === null || pricing?.inputCost === undefined
    || pricing?.outputCost === null || pricing?.outputCost === undefined) return null;
  const inputCost = Number(pricing?.inputCost);
  const outputCost = Number(pricing?.outputCost);
  if (!normalizedUsage || !Number.isFinite(inputCost) || inputCost < 0
    || !Number.isFinite(outputCost) || outputCost < 0) return null;
  return (normalizedUsage.inputTokens * inputCost) + (normalizedUsage.outputTokens * outputCost);
}

function printableValue(value) {
  if (typeof value === "string") return value.trim();
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function failureReason(output) {
  if (!output || typeof output !== "object") return printableValue(output);
  if (output.error) return printableValue(output.error);
  const stderr = printableValue(output.stderr);
  if (stderr) return stderr;
  if (output.exit_code !== undefined && output.exit_code !== null) return `Command exited with code ${output.exit_code}.`;
  if (output.signal) return `Command stopped by signal ${output.signal}.`;
  return "The step reported a failure without an error message.";
}

function formatModelTurnInput(inputPrompt) {
  if (!inputPrompt || typeof inputPrompt !== "object") return "Input prompt unavailable.";
  const sections = [];
  if (typeof inputPrompt.instructions === "string" && inputPrompt.instructions.trim()) {
    sections.push(`Instructions\n${inputPrompt.instructions.trim()}`);
  }
  for (const item of Array.isArray(inputPrompt.input) ? inputPrompt.input : []) {
    if (item?.role) {
      const content = (Array.isArray(item.content) ? item.content : [])
        .map((part) => {
          if (typeof part?.text === "string") return part.text.trim();
          if (part?.type === "input_image") return "[Image input]";
          return printableValue(part);
        })
        .filter(Boolean)
        .join("\n\n");
      if (content) sections.push(`${String(item.role).replace(/^./, (letter) => letter.toUpperCase())}\n${content}`);
      continue;
    }
    if (item?.type === "function_call_output") {
      const callId = item.call_id ? ` · ${item.call_id}` : "";
      sections.push(`Tool output${callId}\n${printableValue(item.output) || "(empty output)"}`);
      continue;
    }
    const value = printableValue(item);
    if (value) sections.push(value);
  }
  return sections.join("\n\n") || printableValue(inputPrompt) || "Input prompt unavailable.";
}

function formatModelTurnOutput(serverResponse) {
  if (!serverResponse || typeof serverResponse !== "object") return "Model output unavailable.";
  if (typeof serverResponse.output_text === "string" && serverResponse.output_text.trim()) {
    return serverResponse.output_text.trim();
  }
  const sections = [];
  for (const item of Array.isArray(serverResponse.output) ? serverResponse.output : []) {
    if (item?.type === "message") {
      const text = (Array.isArray(item.content) ? item.content : [])
        .map((part) => typeof part?.text === "string" ? part.text.trim() : "")
        .filter(Boolean)
        .join("\n\n");
      if (text) sections.push(text);
      continue;
    }
    if (item?.type === "function_call") {
      sections.push(`Tool call · ${item.name || "unknown"}\n${printableValue(item.arguments) || "{}"}`);
      continue;
    }
    if (item?.type === "mcp_call") {
      sections.push(`MCP call · ${item.server_label || "unknown"}.${item.name || item.tool || "unknown"}`);
      continue;
    }
    const value = printableValue(item);
    if (value) sections.push(value);
  }
  return sections.join("\n\n") || "No output text was returned for this turn.";
}

function sessionActivities(events = [], now = Date.now()) {
  const items = [];
  let sequence = 0;
  let complete = false;
  let stopped = false;
  let runContext = null;
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
  const setDetails = (item, sections = []) => {
    if (!item) return item;
    item.details = sections
      .map((section) => ({
        title: String(section.title || "Details"),
        text: printableValue(section.text),
        meta: section.meta ? String(section.meta) : "",
      }))
      .filter((section) => section.text);
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
      const promptDetail = event.detail && typeof event.detail === "object" ? event.detail : null;
      if (promptDetail) {
        runContext = {
          runId: String(promptDetail.runId || ""),
          ...(Number.isInteger(promptDetail.messageIndex) ? { messageIndex: promptDetail.messageIndex } : {}),
          providerId: String(promptDetail.providerId || ""),
          providerName: String(promptDetail.providerName || promptDetail.provider || ""),
          provider: String(promptDetail.provider || ""),
          model: String(promptDetail.model || ""),
          inputCost: promptDetail.inputCost ?? null,
          outputCost: promptDetail.outputCost ?? null,
          presetSettings: promptDetail.presetSettings && typeof promptDetail.presetSettings === "object"
            ? promptDetail.presetSettings : {},
          tools: promptDetail.tools && typeof promptDetail.tools === "object" ? promptDetail.tools : {},
          systemPrompts: promptDetail.systemPrompts && typeof promptDetail.systemPrompts === "object"
            ? promptDetail.systemPrompts : {},
          inputPrompt: String(promptDetail.prompt || ""),
        };
      }
      setDetails(add("Send prompt", "running", event, "prompt"), [
        { title: "Prompt", text: promptDetail?.prompt ?? event.detail },
      ]);
    } else if (type === "composer_start") {
      finish((item) => item.key === "prompt", event);
      setDetails(add("Refine the prompt", "running", event, "composer"), [
        { title: "Original prompt", text: detail.prompt },
        { title: "Model", text: detail.model },
      ]);
    } else if (type === "composer_complete") {
      const item = setUsage(
        finish((item) => item.key === "composer", event, "completed", "Prompt refined"),
        detail.usage,
      );
      if (item) item.model = String(detail.model || "").trim();
      setDetails(item, [
        { title: "Original prompt", text: detail.originalPrompt },
        { title: "Refined prompt", text: detail.refinedPrompt },
        { title: "Model", text: detail.model },
      ]);
    } else if (type === "start") {
      finish((item) => item.key === "prompt", event);
      finish((item) => item.key === "composer", event);
      setDetails(add("Start agent run", "completed", event, "run"), [
        { title: "Agent prompt", text: detail.prompt },
        { title: "Images", text: detail.images ? `${detail.images} attached` : "" },
      ]);
    } else if (type === "turn_start") {
      const model = String(detail.model || "").trim();
      add(`Model turn ${detail.turn}${model ? ` (${model})` : ""}`, "running", event, `turn:${detail.turn}`);
    } else if (type === "turn") {
      const model = String(detail.inputPrompt?.model || detail.serverResponse?.model || detail.model || "").trim();
      const item = setUsage(
        finish(
          (candidate) => candidate.key === `turn:${detail.turn}`,
          event,
          "completed",
          `Model turn ${detail.turn}${model ? ` (${model})` : ""}`,
        ),
        detail.serverResponse?.usage || detail.usage,
      );
      if (item) {
        item.model = model;
        item.contextUsage = contextUsageForTurn(detail, item.usage);
        item.modelTurn = {
          model,
          input: formatModelTurnInput(detail.inputPrompt),
          output: formatModelTurnOutput(detail.serverResponse),
        };
        setDetails(item, [
          {
            title: "Input prompt",
            text: item.modelTurn.input,
            meta: item.usage ? `${formatTokenCount(item.usage.inputTokens)} tokens` : "Tokens unavailable",
          },
          {
            title: "Model output",
            text: item.modelTurn.output,
            meta: item.usage ? `${formatTokenCount(item.usage.outputTokens)} tokens` : "Tokens unavailable",
          },
        ]);
      }
    } else if (type === "tool_start") {
      const item = add(`Run ${humanizeToolName(detail.name)}`, "running", event, `tool:${detail.name}`);
      setDetails(item, [
        { title: "Arguments", text: detail.args },
      ]);
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
      const priorArguments = item.details?.find((section) => section.title === "Arguments")?.text;
      item.output = detail.output;
      if (failed) item.failureReason = failureReason(detail.output);
      setDetails(item, [
        { title: "Command", text: detail.name === "run_command" ? item.command || detail.args?.command : "" },
        { title: "Arguments", text: priorArguments || detail.args },
        { title: "Failure reason", text: failed ? item.failureReason : "" },
        { title: "Response", text: detail.output },
      ]);
      if (detail.name === "run_command") {
        item.command ||= String(detail.args?.command || "");
        item.response = detail.output;
      }
    } else if (type === "tool_blocked") {
      const item = add(`${humanizeToolName(detail.name)} blocked`, "failed", event, `tool:${detail.name}`);
      item.failureReason = `Tool ${detail.name} is unavailable.`;
      setDetails(item, [
        { title: "Arguments", text: detail.args },
        { title: "Failure reason", text: item.failureReason },
      ]);
    } else if (type === "mcp_call") {
      setDetails(add(`Call ${detail.server}.${detail.name}`, "completed", event, `mcp:${detail.server}:${detail.name}`), [
        { title: "Server", text: detail.server },
        { title: "Tool", text: detail.name },
      ]);
    } else if (type === "validation" && ["pending", "required"].includes(detail.status)) {
      const paths = Array.isArray(detail.paths) && detail.paths.length ? ` · ${detail.paths.join(", ")}` : "";
      if (!findRunning((item) => item.key === "validation")) {
        setDetails(add(`Validate workspace changes${paths}`, "running", event, "validation"), [
          { title: "Changed paths", text: detail.paths },
          { title: "Validation tool", text: detail.tool },
        ]);
      }
    } else if (type === "validation" && ["passed", "failed"].includes(detail.status)) {
      const status = detail.status === "passed" ? "completed" : "failed";
      const item = finish((candidate) => candidate.key === "validation", event, status, `Validation ${detail.status}`)
        || add(`Validation ${detail.status}`, status, event, "validation");
      if (status === "failed") item.failureReason = failureReason(detail.error || [...items].reverse().find((candidate) => candidate.key === `tool:${detail.tool}`)?.output);
      setDetails(item, [
        { title: "Changed paths", text: detail.paths },
        { title: "Validation tool", text: detail.tool },
        { title: "Status", text: detail.status },
        { title: "Failure reason", text: item.failureReason },
      ]);
    } else if (type === "response_stream") {
      if (!findRunning((item) => item.key === "response")) add("Write response", "running", event, "response");
    } else if (type === "run_stopped") {
      finishAll(event, "stopped");
      add("Run stopped", "stopped", event, "stopped");
      stopped = true;
      complete = true;
    } else if (type === "response_complete") {
      finish((item) => item.key === "response", event, "completed", "Response completed");
      complete = true;
    } else if (type === "final") {
      finishAll(event);
      if (!items.some((item) => item.key === "response")) add("Prepare final answer", "completed", event, "response");
      complete = true;
    } else if (event.title === "Error") {
      finishAll(event, "failed");
      const errorText = printableValue(event.detail) || "The run failed without an error message.";
      for (const pending of items.filter((item) => item.status === "failed" && !item.failureReason)) {
        pending.failureReason = errorText;
        setDetails(pending, [...(pending.details || []), { title: "Failure reason", text: errorText }]);
      }
      const commandItem = [...items].reverse().find((item) => item.key === "tool:run_command");
      const response = commandItem?.response ?? event.detail;
      const responseText = printableValue(response);
      const item = add("Run failed", "failed", event, "error");
      item.failureReason = errorText;
      item.command = commandItem?.command || "";
      item.response = response;
      setDetails(item, [
        { title: "Failure reason", text: item.failureReason },
        { title: "Command", text: item.command || "No command was recorded for this run." },
        { title: "Response", text: responseText || "No response was recorded for this run." },
        {
          title: "Run error",
          text: commandItem?.response !== undefined && errorText !== responseText ? errorText : "",
        },
      ]);
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
    stopped,
    items,
    runId: runContext?.runId || String(items[0]?.startedAt || ""),
    runContext,
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

// Anchor runs to their initiating user messages, independently of whether a run
// produced an assistant reply. Older saved events have only prompt text.
function activityMessageIndices(messages = [], activities = []) {
  const users = messages.flatMap((message, index) => message.role === 'user' ? [index] : []);
  const indices = Array(activities.length).fill(-1);
  let cursor = users.length - 1;
  for (let index = activities.length - 1; index >= 0; index--) {
    const context = activities[index].runContext;
    const explicit = context?.messageIndex;
    if (Number.isInteger(explicit) && messages[explicit]?.role === 'user') {
      indices[index] = explicit;
      cursor = users.indexOf(explicit) - 1;
      continue;
    }
    const prompt = context?.inputPrompt;
    let match = -1;
    if (prompt) {
      for (let user = cursor; user >= 0; user--) {
        const message = messages[users[user]];
        const imagePrompt = `${message.text} (${message.images?.length || 0} image)`;
        if (message.text === prompt || (message.images?.length && imagePrompt === prompt)) { match = user; break; }
      }
    }
    if (match < 0) match = cursor;
    if (match >= 0) { indices[index] = users[match]; cursor = match - 1; }
  }
  return indices;
}

export {
  activityMessageIndices,
  calculateTokenCost,
  formatModelTurnInput,
  formatModelTurnOutput,
  formatStepDuration,
  formatTokenCount,
  normalizeTokenUsage,
  sessionActivities,
  sessionActivityRuns,
};
