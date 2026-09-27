import crypto from "node:crypto";

// Diagnostics are bounded and credentials are removed before they reach disk or a model.
export function sanitizeDiagnostic(value, depth = 0, budget = { characters: 120000, nodes: 4000 }) {
  if (--budget.nodes < 0 || budget.characters <= 0) return "[truncated]";
  if (depth > 8) return "[depth limit]";
  if (typeof value === "string") {
    const text = value
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [redacted]")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, "[redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|password|secret|authorization)["']?\s*[=:]\s*["']?)[^\s"',;}]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/g, "$1[redacted]@")
    .slice(0, Math.min(16000, budget.characters));
    budget.characters -= text.length;
    return text;
  }
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeDiagnostic(item, depth + 1, budget));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, item]) => [
    key, /api.?key|authorization|cookie|password|secret|token$|dataUrl/i.test(key) ? "[redacted]" : sanitizeDiagnostic(item, depth + 1, budget),
  ]));
  return String(value);
}

export function errorDetails(error) {
  return sanitizeDiagnostic({ name: error?.name, message: error?.message || String(error), code: error?.code,
    status: error?.status || error?.statusCode, stack: error?.stack,
    cause: error?.cause ? String(error.cause?.message || error.cause) : undefined,
    attempts: error?.diagnosticAttempts, request: error?.diagnosticRequest });
}

export function diagnoseFailure(output = {}) {
  const reason = String(output.error?.message || output.error || output.message || output.stderr || (output.exit_code != null ? `Process exited with code ${output.exit_code}.` : "The step reported failure without a specific error message."));
  const evidence = JSON.stringify(output);
  let category = "unknown";
  let hypothesis = "The recorded evidence does not establish the root cause.";
  let checks = ["Compare the step input with its output and preceding events.", "Reproduce the smallest failing operation in the same workspace and configuration.", "Add a regression test once the cause is confirmed."];
  if (/denied|forbidden|EACCES|EPERM|permission/i.test(evidence)) {
    category = "permissions"; hypothesis = "A permission rule, filesystem permission, or upstream access policy may have blocked the operation.";
    checks = ["Check the recorded tool permissions and requested target.", "Check filesystem access and upstream authorization before changing permission rules."];
  } else if (/401|unauthorized|api.?key|authentication/i.test(evidence)) {
    category = "authentication"; hypothesis = "The provider may have rejected the configured credentials.";
    checks = ["Verify the selected provider and endpoint.", "Check credential configuration without copying secrets into this log."];
  } else if (/429|rate.?limit|quota/i.test(evidence)) {
    category = "rate-limit"; hypothesis = "A provider limit or exhausted quota may have rejected the request.";
    checks = ["Inspect provider quota and any retry-after information.", "Review retry limits and backoff behavior."];
  } else if (/timeout|timed out|ETIMEDOUT|SIGTERM/i.test(evidence)) {
    category = "timeout"; hypothesis = "The operation may have exceeded a deadline or been terminated.";
    checks = ["Compare elapsed time with the configured timeout.", "Check subprocess termination and provider latency."];
  } else if (/ECONN|ENOTFOUND|fetch failed|network|socket/i.test(evidence)) {
    category = "network"; hypothesis = "The connection to an external service may have failed.";
    checks = ["Check endpoint, DNS, and service availability.", "Review retries and connection error handling."];
  } else if (/unknown tool|unavailable tool|not available|is unavailable/i.test(evidence)) {
    category = "tool-configuration"; hypothesis = "The model requested a tool that may not be enabled or registered.";
    checks = ["Compare the tool name with the tools advertised to the model.", "Review preset permissions and tool registration."];
  } else if (/ENOENT|not found|no such file/i.test(evidence)) {
    category = "missing-resource"; hypothesis = "A required file, executable, or resource may be missing.";
    checks = ["Check the workspace, path, and executable availability.", "Review argument construction and resource setup."];
  } else if (output.exit_code != null) {
    category = "command"; hypothesis = "The subprocess reported a failure; stderr and the exit code may explain it.";
    checks = ["Inspect the exact command, working directory, exit code, stdout, and stderr.", "Determine whether the failure is in the harness, project code, or command arguments."];
  }
  return { reason, category, hypothesis, checks, confidence: "Unconfirmed; verify against the recorded evidence." };
}

export function createErrorLogStore(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS error_logs (
    id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, session_id TEXT NOT NULL, run_id TEXT NOT NULL,
    step TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
    diagnostic TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', analysis TEXT
  ) STRICT;
  CREATE INDEX IF NOT EXISTS error_logs_created ON error_logs(created_at DESC);`);
  const read = (id) => {
    const row = database.prepare("SELECT * FROM error_logs WHERE id = ?").get(id);
    return row ? { id: row.id, createdAt: row.created_at, status: row.status, notes: row.notes,
      ...JSON.parse(row.diagnostic), analysis: row.analysis ? JSON.parse(row.analysis) : null } : null;
  };
  return {
    read,
    create(diagnostic) {
      const { diagnosis, step, sessionId, runId, input, output, error, ...context } = diagnostic;
      const safe = sanitizeDiagnostic({ diagnosis, step, sessionId, runId, input, output, error, ...context });
      const id = crypto.randomUUID();
      const createdAt = Date.now();
      database.prepare("INSERT INTO error_logs (id, created_at, session_id, run_id, step, category, summary, diagnostic) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(id, createdAt, safe.sessionId || "", safe.runId || "", safe.step, safe.diagnosis.category, safe.diagnosis.reason.slice(0, 500), JSON.stringify(safe));
      return read(id);
    },
    list({ search = "", status = "", offset = 0, limit = 50 } = {}) {
      const where = "WHERE (? = '' OR status = ?) AND (? = '' OR summary LIKE ? OR step LIKE ? OR category LIKE ? OR run_id LIKE ? OR session_id LIKE ?)";
      const query = `%${search.slice(0, 200)}%`;
      const args = [status, status, search, query, query, query, query, query];
      const total = database.prepare(`SELECT count(*) AS count FROM error_logs ${where}`).get(...args).count;
      const logs = database.prepare(`SELECT id, created_at AS createdAt, session_id AS sessionId, run_id AS runId, step, category, summary, status FROM error_logs ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(...args, limit, offset);
      return { logs, total, offset, limit };
    },
    review(id, { notes, status }) {
      if (typeof notes !== "string" || notes.length > 20000 || !["open", "investigating", "resolved"].includes(status)) throw new Error("Provide notes (up to 20,000 characters) and a valid review status.");
      database.prepare("UPDATE error_logs SET notes = ?, status = ? WHERE id = ?").run(sanitizeDiagnostic(notes), status, id);
      return read(id);
    },
    saveAnalysis(id, analysis) {
      database.prepare("UPDATE error_logs SET analysis = ? WHERE id = ?").run(JSON.stringify(sanitizeDiagnostic(analysis)), id);
      return read(id);
    },
  };
}

export function createRunDiagnostics(store, context) {
  const startedAt = Date.now();
  const timeline = [];
  let active = { step: "Initialize run", startedAt };
  let lastTool = null;
  let validation = null;
  const blocked = new Map();
  return {
    observe(payload) {
      const event = payload.type === "agent_event" ? payload.event : payload.type === "error" ? { type: "run_error", ...payload } : null;
      if (!event) return payload;
      const now = Date.now();
      if (["composer_start", "start", "turn_start", "tool_start"].includes(event.type)) {
        active = { step: event.type === "tool_start" ? `Tool: ${event.name}` : event.type === "turn_start" ? `Model turn ${event.turn}` : event.type === "composer_start" ? "Refine prompt" : "Start agent run", startedAt: now, input: event };
      }
      if (event.type === "validation" && ["pending", "required"].includes(event.status) && !validation) {
        validation = { startedAt: now, input: event };
      }
      const failed = payload.type === "error" || event.type === "tool_blocked" || (event.type === "tool_result" && event.output?.ok === false) || (event.type === "validation" && event.status === "failed");
      if (failed) {
        const output = event.output || (event.type === "validation" ? lastTool?.output : null) || { error: event.error || `Tool ${event.name} is unavailable.` };
        const failedStep = event.type === "validation" ? validation || active : active;
        const step = event.type === "validation" ? "Validate workspace changes" : event.type === "tool_blocked" ? `Tool: ${event.name}` : active.step;
        let id = event.type === "tool_result" && blocked.get(event.callId || event.name);
        if (!id) {
          const record = store.create({ ...context, step, startedAt: failedStep.startedAt, failedAt: now,
            durationMs: now - failedStep.startedAt, runStartedAt: startedAt,
            input: event.args || failedStep.input, output, error: payload.errorDetails,
            diagnosis: diagnoseFailure(output), event, timeline: [...timeline],
            runtime: { node: process.version, platform: process.platform, arch: process.arch } });
          id = record.id;
        }
        if (event.type === "tool_blocked") blocked.set(event.callId || event.name, id);
        if (event.type === "tool_result") blocked.delete(event.callId || event.name);
        if (payload.type === "agent_event") payload = { ...payload, event: { ...event, errorLogId: id } };
        else payload = { ...payload, errorLogId: id };
      }
      if (event.type === "tool_result") {
        lastTool = sanitizeDiagnostic(event);
        active = { step: "Continue agent run", startedAt: now };
      }
      if (event.type === "validation" && ["passed", "failed"].includes(event.status)) validation = null;
      timeline.push(sanitizeDiagnostic({ ...event, timestamp: now }));
      if (timeline.length > 12) timeline.shift();
      return payload;
    },
  };
}
