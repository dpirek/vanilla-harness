import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "harness-stop-"));
let abortedStreams = 0;
const provider = http.createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  const body = JSON.parse(text || "{}");
  if (!body.stream) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "refine", choices: [{ message: { role: "assistant", content: "Test prompt" } }] }));
  } else {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"id":"stream","choices":[{"delta":{"content":"Partial answer"}}]}\n\n'.replaceAll("\\n", "\n"));
    res.on("close", () => abortedStreams++);
  }
});
await new Promise(resolve => provider.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:8127";
const app = spawn(process.execPath, ["server.js"], { env: { ...process.env, PORT: "8127", AI_HARNESS_DATA_DIR: dataDir }, stdio: ["ignore", "pipe", "pipe"] });
let logs = "";
app.stdout.on("data", d => logs += d);
app.stderr.on("data", d => logs += d);
let ws;
try {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(origin + "/api/health")).ok) break; } catch {}
    await sleep(100);
  }
  const settings = { provider: "custom", model: "mock-model", apiKey: "test", baseUrl: `http://127.0.0.1:${provider.address().port}/v1` };
  const saved = await fetch(origin + "/api/ui-state", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ state: {
    providerSettings: settings,
    providers: [{ id: "mock", name: "Mock", type: "custom", ...settings, selected: true, models: ["mock-model"], modelsLoadedAt: Date.now() }],
  } }) });
  assert.equal(saved.ok, true);
  const targets = await (await fetch("http://127.0.0.1:9236/json")).json();
  ws = new WebSocket(targets.find(t=>t.type === "page").webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `localStorage.setItem("ai-harness.defaultWorkspace", ${JSON.stringify(process.cwd())});` });
  await send("Page.navigate", { url: origin });
  const until = async expression => {
    for (let i=0;i<100;i++) { if (await evaluate(expression)) return; await sleep(50); }
    throw new Error("Timed out: " + expression + "\n" + logs + "\n" + await evaluate('JSON.stringify({button:document.querySelector("#sendButton")?.outerHTML,messages:document.querySelector("#messages")?.textContent,dialogs:[...document.querySelectorAll("dialog[open]")].map(d=>d.id)})'));
  };
  await until('document.querySelector("#sendButton")?.title === "Send" && !document.querySelector("#sendButton").disabled');
  errors.length = 0;
  for (let run = 0; run < 2; run++) {
    await evaluate('document.querySelector("#promptInput").value="Test"; document.querySelector("#sendButton").click()');
    await until('document.querySelector("#sendButton").getAttribute("aria-label") === "Stop" && !!document.querySelector(".message-streaming")');
    assert.equal(await evaluate('document.querySelector("#sendButton").disabled'), false);
    assert.equal(await evaluate('document.querySelector("#sendButton").type'), "button");
    assert.match(await evaluate('document.querySelector("#sendButton use").getAttribute("href")'), /#stop-fill$/);
    await evaluate('document.querySelector("#sendButton").click()');
    await until('document.querySelector("#sendButton").getAttribute("aria-label") === "Send"');
    assert.equal(await evaluate('document.querySelector("#promptInput").disabled'), false);
  }
  for (let i=0; i<20 && abortedStreams < 2; i++) await sleep(50);
  assert.equal(abortedStreams, 2);
  const state = (await (await fetch(origin + "/api/ui-state")).json()).state;
  assert.equal(state.sessions.flatMap(s => s.messages).filter(m => m.role === "agent" && m.text === "Partial answer").length, 2);
  assert.deepEqual(errors, []);
  console.log("Passed two complete Send → Stop → Send cycles; upstream streams aborted, partial answers saved, next run accepted.");
  await send("Browser.close");
} finally {
  ws?.close();
  app.kill("SIGTERM");
  provider.closeAllConnections();
  await new Promise(resolve => provider.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}
