import BaseComponent from "./base-component.js";
import { requestJson, jsonOptions } from "../services/api-client.js";

class LogsPage extends BaseComponent {
  connectedCallback() {
    if (this.childElementCount) return;
    this.setAttribute("role", "main");
    this.offset = 0;
    const el = (tag, props = {}) => this.createElement(tag, props);
    this.appendChildren(this, [
      el("header", { class: "logsHeader", children: [
        el("div", { children: [el("h1", { textContent: "Error logs" }), el("p", { textContent: "Investigate failed steps and track improvements to the harness." })] }),
        el("a", { href: "/", "data-app-route": "", textContent: "Back to chat" }),
      ] }),
      el("div", { class: "logsToolbar", children: [
        el("input", { id: "logsSearch", type: "search", placeholder: "Search failures, steps, or run IDs", "aria-label": "Search error logs" }),
        el("select", { id: "logsStatusFilter", "aria-label": "Filter by review status", children: [
          el("option", { value: "", textContent: "All statuses" }),
          ...["open", "investigating", "resolved"].map((value) => el("option", { value, textContent: value })),
        ] }),
        el("button", { id: "refreshLogs", type: "button", textContent: "Refresh" }),
      ] }),
      el("p", { id: "logsFeedback", role: "status", "aria-live": "polite" }),
      el("div", { id: "logsContent" }),
      el("div", { class: "logsPagination", children: [
        el("button", { id: "logsPrevious", type: "button", textContent: "Previous" }),
        el("span", { id: "logsCount" }),
        el("button", { id: "logsNext", type: "button", textContent: "Next" }),
      ] }),
    ]);
    this.querySelector("#logsSearch").addEventListener("input", () => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => { this.offset = 0; this.load("/logs"); }, 250);
    });
    this.querySelector("#logsStatusFilter").addEventListener("change", () => { this.offset = 0; this.load("/logs"); });
    this.querySelector("#refreshLogs").addEventListener("click", () => this.load(this.pathname));
    this.querySelector("#logsPrevious").addEventListener("click", () => { this.offset = Math.max(0, this.offset - 50); this.load("/logs"); });
    this.querySelector("#logsNext").addEventListener("click", () => { this.offset += 50; this.load("/logs"); });
  }

  feedback(text) { this.querySelector("#logsFeedback").textContent = text; }

  async load(pathname) {
    clearTimeout(this.searchTimer);
    this.pathname = pathname;
    const version = this.version = (this.version || 0) + 1;
    const id = pathname.split("/").filter(Boolean)[1];
    this.querySelector(".logsToolbar").hidden = Boolean(id);
    this.querySelector(".logsPagination").hidden = Boolean(id);
    this.feedback("Loading error logs…");
    this.querySelector("#logsContent").replaceChildren();
    try {
      if (id) {
        const result = await requestJson(`/api/logs/${encodeURIComponent(id)}`);
        if (version !== this.version) return;
        this.renderDetail(result.log);
      } else {
        const params = new URLSearchParams({ search: this.querySelector("#logsSearch").value, status: this.querySelector("#logsStatusFilter").value, offset: this.offset, limit: 50 });
        const result = await requestJson(`/api/logs?${params}`);
        if (version !== this.version) return;
        this.renderList(result);
      }
      this.feedback("");
    } catch (error) {
      if (version !== this.version) return;
      this.feedback(error.message);
      const link = this.createElement("a", { href: "/logs", "data-app-route": "", textContent: "Back to error logs" });
      this.querySelector("#logsContent").replaceChildren(link);
    }
  }

  renderList({ logs, total, offset, limit }) {
    const el = (tag, props = {}) => this.createElement(tag, props);
    const content = this.querySelector("#logsContent");
    if (!logs.length) content.append(el("p", { class: "logsEmpty", textContent: total ? "No logs on this page. Use Previous to return." : "No matching error logs. Failed steps will appear here automatically." }));
    for (const log of logs) content.append(el("article", { class: "logListItem", children: [
      el("div", { class: "logListMeta", children: [
        el("time", { datetime: new Date(log.createdAt).toISOString(), textContent: new Date(log.createdAt).toLocaleString() }),
        el("span", { class: "logBadge", textContent: log.status }),
        el("span", { textContent: log.category }),
      ] }),
      el("h2", { children: [el("a", { href: `/logs/${encodeURIComponent(log.id)}`, "data-app-route": "", textContent: log.step })] }),
      el("p", { textContent: log.summary }),
      el("small", { textContent: `Run ${log.runId} · Conversation ${log.sessionId}` }),
    ] }));
    this.querySelector("#logsCount").textContent = `${total ? offset + 1 : 0}–${Math.min(offset + limit, total)} of ${total}`;
    this.querySelector("#logsPrevious").disabled = offset === 0;
    this.querySelector("#logsNext").disabled = offset + limit >= total;
  }

  renderDetail(log) {
    const el = (tag, props = {}) => this.createElement(tag, props);
    const section = (title, children) => el("section", { class: "logSection", children: [el("h2", { textContent: title }), ...children] });
    const json = (value) => el("pre", { tabindex: "0", textContent: JSON.stringify(value ?? null, null, 2) });
    const content = this.querySelector("#logsContent");
    const notes = el("textarea", { id: "logNotes", rows: "5", maxlength: "20000", value: log.notes, placeholder: "Record the confirmed cause, reproduction, proposed fix, and test results." });
    notes.value = log.notes || "";
    const status = el("select", { id: "logReviewStatus", children: ["open", "investigating", "resolved"].map((value) => el("option", { value, textContent: value })) });
    status.value = log.status;
    const save = el("button", { type: "button", textContent: "Save review" });
    const analyze = el("button", { type: "button", textContent: log.analysis ? "Analyze again" : "Analyze with model" });
    const exportLink = el("a", { href: `/api/logs/${encodeURIComponent(log.id)}`, download: `error-log-${log.id}.json`, textContent: "Download JSON" });
    const analysis = el("div", { class: "logAnalysis" });
    const renderAnalysis = (value) => {
      analysis.replaceChildren();
      if (value) analysis.append(el("p", { textContent: `${value.model} · ${new Date(value.createdAt).toLocaleString()} · Model-generated hypotheses; verify before acting.` }), el("pre", { textContent: value.text }));
      else analysis.append(el("p", { textContent: "No model analysis yet. Analyze with the currently selected provider and model. This sends the saved diagnostic evidence to that provider." }));
    };
    renderAnalysis(log.analysis);
    content.replaceChildren(
      el("a", { href: "/logs", "data-app-route": "", textContent: "← All error logs" }),
      section(log.step, [el("p", { textContent: log.diagnosis.reason }), el("p", { class: "logListMeta", textContent: `${new Date(log.createdAt).toLocaleString()} · ${log.durationMs} ms · ${log.diagnosis.category}` }), exportLink]),
      section("What happened", [json({ logId: log.id, sessionId: log.sessionId, runId: log.runId, workspace: log.workspace, step: log.step, provider: log.providerSettings?.provider, model: log.providerSettings?.model, startedAt: log.startedAt, failedAt: log.failedAt }), el("h3", { textContent: "Step input" }), json(log.input), el("h3", { textContent: "Output and error" }), json({ output: log.output, exception: log.error, failureEvent: log.event })]),
      section("Possible cause", [el("p", { textContent: log.diagnosis.hypothesis }), el("p", { textContent: log.diagnosis.confidence }), el("ul", { children: log.diagnosis.checks.map((textContent) => el("li", { textContent })) })]),
      section("Model analysis", [analyze, analysis]),
      section("Investigation", [el("label", { for: "logReviewStatus", textContent: "Review status" }), status, el("label", { for: "logNotes", textContent: "Notes and harness improvements" }), notes, save]),
      el("details", { class: "logSection", children: [el("summary", { textContent: "Run context and preceding events" }), json({ prompt: log.prompt, runtime: log.runtime, preset: log.preset, toolPermissions: log.toolPermissions, disabledSteps: log.disabledSteps, timeline: log.timeline })] }),
    );
    const version = this.version;
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await requestJson(`/api/logs/${log.id}`, jsonOptions("PATCH", { notes: notes.value, status: status.value }));
        if (this.version === version) this.feedback("Review saved.");
      } catch (error) { if (this.version === version) this.feedback(error.message); }
      finally { save.disabled = false; }
    });
    analyze.addEventListener("click", async () => {
      analyze.disabled = true;
      analyze.textContent = "Analyzing…";
      try {
        const result = await requestJson(`/api/logs/${log.id}/analyze`, jsonOptions("POST", {}));
        if (this.version === version) { renderAnalysis(result.log.analysis); this.feedback("Analysis saved."); }
      } catch (error) { if (this.version === version) this.feedback(error.message); }
      finally { analyze.disabled = false; analyze.textContent = "Analyze again"; }
    });
  }
}
customElements.define("logs-page", LogsPage);
export default LogsPage;
