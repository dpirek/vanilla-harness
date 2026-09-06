import crypto from "node:crypto";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const MAX_TIMEOUT_MS = 60 * 60 * 1000;
const MAX_TASK_LENGTH = 100_000;
const DEFAULT_SUBMISSION_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 500;

function normalizeWorkerUrl(value) {
  const url = new URL(String(value || "").trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Sub-agent worker URLs must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("Sub-agent worker URLs cannot contain credentials.");
  }
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  if (url.hostname === "[::]") url.hostname = "[::1]";
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/$/, "");
}

function normalizeSubAgentWorkers(value = []) {
  const entries = (Array.isArray(value) ? value : []).map((worker) => [worker?.name, worker?.url]);
  const names = new Set();
  return entries.map(([rawName, rawUrl]) => {
    const name = String(rawName || "").trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      throw new Error(`Invalid sub-agent name: ${name || "(empty)"}`);
    }
    if (names.has(name)) throw new Error(`Duplicate sub-agent name: ${name}`);
    names.add(name);
    return { name, url: normalizeWorkerUrl(rawUrl) };
  });
}

function a2aUrl(workerUrl) {
  const url = new URL(workerUrl);
  if (!url.pathname.endsWith("/a2a")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/a2a`;
  }
  return url.href;
}

function callbackText(payload) {
  return (Array.isArray(payload?.message?.parts) ? payload.message.parts : [])
    .filter((part) => part?.kind === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
}

function workerConnectionError(worker, error, attempts) {
  const cause = error?.cause;
  const causeMessage = typeof cause?.message === "string" ? cause.message : "";
  const detail = causeMessage && causeMessage !== error?.message
    ? `${error.message}: ${causeMessage}`
    : error?.message || "Unknown network error.";
  const attempted = attempts > 1 ? ` after ${attempts} attempts` : "";
  return new Error(`Unable to reach sub-agent “${worker.name}” at ${a2aUrl(worker.url)}${attempted}. ${detail}`);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class SubAgentManager {
  constructor({
    workers = [],
    callbackUrl,
    fetchImpl = globalThis.fetch,
    submissionAttempts = DEFAULT_SUBMISSION_ATTEMPTS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = {}) {
    this.setWorkers(workers);
    this.callbackUrl = callbackUrl;
    this.fetchImpl = fetchImpl;
    this.submissionAttempts = Math.max(1, Math.floor(submissionAttempts));
    this.retryDelayMs = Math.max(0, Math.floor(retryDelayMs));
    this.pending = new Map();
    this.tasks = new Map();
  }

  listWorkers() {
    return [...this.workers.values()].map(({ name, url }) => ({ name, url }));
  }

  setWorkers(workers = []) {
    this.workers = new Map(normalizeSubAgentWorkers(workers).map((worker) => [worker.name, worker]));
    return this.listWorkers();
  }

  listTasks() {
    return [...this.tasks.values()].map(({ token, resolve, timer, ...task }) => ({ ...task }));
  }

  async delegate({ agent, task, timeoutMs = DEFAULT_TIMEOUT_MS }) {
    const worker = this.workers.get(String(agent || ""));
    if (!worker) throw new Error(`Unknown sub-agent: ${agent || "(empty)"}`);
    if (typeof task !== "string" || !task.trim()) throw new Error("Sub-agent task is required.");
    if (task.length > MAX_TASK_LENGTH) {
      throw new Error(`Sub-agent task exceeds ${MAX_TASK_LENGTH} characters.`);
    }
    const duration = Number.isFinite(timeoutMs)
      ? Math.max(1_000, Math.min(MAX_TIMEOUT_MS, Math.floor(timeoutMs)))
      : DEFAULT_TIMEOUT_MS;
    const callbackUrl = typeof this.callbackUrl === "function"
      ? this.callbackUrl()
      : this.callbackUrl;
    if (!callbackUrl) throw new Error("A public sub-agent callback URL is not configured.");

    const messageId = `msg-${crypto.randomUUID()}`;
    const token = crypto.randomBytes(32).toString("base64url");
    const record = {
      agent: worker.name,
      callbackReceived: false,
      createdAt: new Date().toISOString(),
      inReplyTo: messageId,
      state: "submitting",
      taskId: null,
      workerUrl: worker.url,
    };
    this.tasks.set(messageId, record);

    let settle;
    const result = new Promise((resolve) => { settle = resolve; });
    const timer = setTimeout(() => {
      this.pending.delete(token);
      record.state = "timed_out";
      settle({
        ok: false,
        agent: worker.name,
        taskId: record.taskId,
        status: "timed_out",
        error: `Sub-agent did not call back within ${duration}ms.`,
      });
    }, duration);
    timer.unref?.();
    this.pending.set(token, { messageId, record, resolve: settle, timer });

    try {
      let response;
      let connectionError;
      let attempts = 0;
      const submissionDeadline = Date.now() + Math.min(duration, 30_000);
      while (!response && attempts < this.submissionAttempts) {
        attempts += 1;
        try {
          response = await this.fetchImpl(a2aUrl(worker.url), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              message: {
                messageId,
                role: "user",
                parts: [{ kind: "text", text: task.trim() }],
              },
              callback: { url: callbackUrl, token },
            }),
            signal: AbortSignal.timeout(Math.max(1, submissionDeadline - Date.now())),
          });
        } catch (error) {
          connectionError = error;
          const remaining = submissionDeadline - Date.now();
          if (attempts < this.submissionAttempts && remaining > 0) {
            await wait(Math.min(this.retryDelayMs, remaining));
          }
        }
      }
      if (!response) throw workerConnectionError(worker, connectionError, attempts);
      if (!this.pending.has(token)) return result;
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Sub-agent returned invalid JSON (HTTP ${response.status}).`);
      }
      if (response.status !== 202 || typeof body.taskId !== "string" || !body.taskId) {
        const detail = body?.error?.message || (typeof body?.error === "string" ? body.error : "");
        throw new Error(detail || `Sub-agent rejected the task (HTTP ${response.status}).`);
      }
      if (record.taskId && record.taskId !== body.taskId) {
        throw new Error("Sub-agent acknowledgement and callback used different task IDs.");
      }
      record.taskId = body.taskId;
      if (!record.callbackReceived) record.state = "working";
    } catch (error) {
      const pending = this.pending.get(token);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(token);
        record.state = "failed";
        settle({ ok: false, agent: worker.name, taskId: record.taskId, status: "failed", error: error.message });
      }
    }

    return result;
  }

  receiveCallback(authorization, payload) {
    const match = /^Bearer\s+(.+)$/i.exec(String(authorization || ""));
    const pending = match ? this.pending.get(match[1]) : null;
    if (!pending) return { status: 401, body: { ok: false, error: "Invalid or expired callback token." } };

    const { record } = pending;
    if (!payload || typeof payload !== "object" || payload.inReplyTo !== record.inReplyTo) {
      return { status: 400, body: { ok: false, error: "Callback inReplyTo does not match the delegated message." } };
    }
    if (typeof payload.taskId !== "string" || !payload.taskId) {
      return { status: 400, body: { ok: false, error: "Callback taskId is required." } };
    }
    if (record.taskId && payload.taskId !== record.taskId) {
      return { status: 409, body: { ok: false, error: "Callback taskId does not match the acknowledged task." } };
    }
    const state = payload.status?.state;
    if (state !== "completed" && state !== "failed") {
      return { status: 400, body: { ok: false, error: "Callback status.state must be completed or failed." } };
    }

    clearTimeout(pending.timer);
    this.pending.delete(match[1]);
    record.callbackReceived = true;
    record.taskId = payload.taskId;
    record.state = state;
    const output = state === "completed"
      ? { ok: true, agent: record.agent, taskId: payload.taskId, status: state, text: callbackText(payload) }
      : {
          ok: false,
          agent: record.agent,
          taskId: payload.taskId,
          status: state,
          error: payload.error?.message || (typeof payload.error === "string" ? payload.error : "Sub-agent task failed."),
        };
    pending.resolve(output);
    return { status: 200, body: { ok: true } };
  }
}

export {
  DEFAULT_TIMEOUT_MS,
  MAX_TIMEOUT_MS,
  SubAgentManager,
  normalizeSubAgentWorkers,
};
