import { json, methodNotAllowed, readRequestBody } from "./http.js";
import { analyzeErrorLog } from "../lib/error-log-analysis.js";

const analyzing = new Set();
export async function handleLogsApi(req, res, url, { uiStateStore, analyze = analyzeErrorLog }) {
  const match = url.pathname.match(/^\/api\/logs(?:\/([^/]+)(\/analyze)?)?\/?$/);
  if (!match) return false;
  try {
    const store = uiStateStore.errorLogs;
    const id = match[1];
    if (!id) {
      if (req.method !== "GET") { methodNotAllowed(res, "GET"); return true; }
      const offset = Math.max(0, Math.min(1000000, Number.parseInt(url.searchParams.get("offset"), 10) || 0));
      const limit = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit"), 10) || 50));
      json(res, 200, { ok: true, ...store.list({ search: url.searchParams.get("search") || "", status: url.searchParams.get("status") || "", offset, limit }) });
      return true;
    }
    const log = store.read(id);
    if (!log) { json(res, 404, { ok: false, error: "Error log not found." }); return true; }
    if (match[2]) {
      if (req.method !== "POST") { methodNotAllowed(res, "POST"); return true; }
      if (analyzing.has(id)) { json(res, 409, { ok: false, error: "Analysis is already in progress for this log." }); return true; }
      analyzing.add(id);
      try {
        const analysis = await analyze(log, uiStateStore.getAll().providerSettings || {});
        json(res, 200, { ok: true, log: store.saveAnalysis(id, analysis) });
      } finally { analyzing.delete(id); }
    } else if (req.method === "GET") json(res, 200, { ok: true, log });
    else if (req.method === "PATCH") {
      const body = JSON.parse(await readRequestBody(req, 30000));
      json(res, 200, { ok: true, log: store.review(id, body) });
    } else methodNotAllowed(res, "GET, PATCH");
  } catch (error) { json(res, 400, { ok: false, error: error.message }); }
  return true;
}
