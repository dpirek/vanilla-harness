import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { createModelClient } from "../lib/openai.js";
import { createSettingsApiHandlers } from "../api/settings.js";
import { resolveProviderApiKey } from "../lib/provider-config.js";
import { parseOllamaPricing, enrichOllamaPrices } from "../lib/ollama-pricing.js";

const table = (rows) => `<table><tr><th>Model</th><th>Input</th><th>Cached input</th><th>Output</th></tr>${rows}</table>`;
const row = (id, input, output) => `<tr><td><a>${id}</a></td><td>$${input}</td><td>$0.01</td><td>$${output}</td></tr>`;
const html = table(row("example", 1, 2) + row("sized:20b", 0.1, 0.2) + row("sized:120b", 0.5, 1)) + table(row("example", 2, 4));

test("Ollama cloud pricing uses peak and exact size rates while handling model tags", async () => {
  assert.equal(parseOllamaPricing(html).get("example").inputCost, 2 / 1e6);
  const models = await enrichOllamaPrices([{ id: "example:0813" }, { id: "sized:20b-cloud" }, { id: "sized:unknown" }], {
    fetchImpl: async (_url, options) => {
      assert.equal(options.headers, undefined);
      return new Response(html);
    },
  });
  assert.equal(models[0].outputCost, 4 / 1e6);
  assert.equal(models[1].inputCost, 0.1 / 1e6);
  assert.equal(models[2].inputCost, null);
});

test("Ollama forwards bearer auth on chat and tool fallback and normalizes /api URLs", async () => {
  const requests = [];
  const client = createModelClient({ provider: "ollama", baseUrl: "https://ollama.com/api/", apiKey: "cloud-key", fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? new Response(JSON.stringify({ error: "model does not support tools" }), { status: 400 })
      : new Response(JSON.stringify({ message: { role: "assistant", content: "ok" }, done: true }));
  } });
  await client.createResponse({ model: "example", input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }], tools: [{ type: "function", name: "read_file", parameters: { type: "object" } }] });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, "https://ollama.com/api/chat");
    assert.equal(request.options.headers.authorization, "Bearer cloud-key");
  }
  assert.equal(resolveProviderApiKey("ollama", "", { OLLAMA_API_KEY: "env-key", OPENAI_API_KEY: "wrong" }), "env-key");
  assert.equal(resolveProviderApiKey("ollama", "", { OPENAI_API_KEY: "wrong" }), "");
});

test("Ollama models listing sends auth and applies cloud prices", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://ollama.com/api/tags");
    assert.equal(options.headers.authorization, "Bearer cloud-key");
    return new Response(JSON.stringify({ models: [{ name: "example:0813" }] }));
  });
  const handlers = createSettingsApiHandlers({ uiStateStore: { getAll: () => ({}) } });
  const req = Readable.from([Buffer.from(JSON.stringify({ provider: "ollama", baseUrl: "https://ollama.com/api", apiKey: "cloud-key" }))]);
  req.method = "POST";
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  await handlers["/api/models"](req, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.modelDetails[0].inputCost, 2 / 1e6);
});
