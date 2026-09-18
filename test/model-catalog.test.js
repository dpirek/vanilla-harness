import assert from "node:assert/strict";
import test from "node:test";

import { catalogModel } from "../api/settings.js";

test("provider model metadata is normalized for the models table", () => {
  assert.deepEqual(catalogModel({
    id: "example/model",
    supported_parameters: ["tools", "temperature"],
    context_length: 128000,
    throughput: 84.25,
    latency_ms: 410,
    pricing: { prompt: "0.0000025", completion: "0.00001" },
  }), {
    id: "example/model",
    tools: true,
    throughput: 84.25,
    latency: 410,
    context: 128000,
    inputCost: 0.0000025,
    outputCost: 0.00001,
  });
});

test("provider negative pricing sentinels are treated as unavailable", () => {
  const model = catalogModel({ id: "openrouter/auto", pricing: { prompt: "-1", completion: -1 } });
  assert.equal(model.inputCost, null);
  assert.equal(model.outputCost, null);
});

test("custom providers using the OpenAI endpoint receive OpenAI prices", async (t) => {
  const { Readable } = await import("node:stream");
  const { createSettingsApiHandlers } = await import("../api/settings.js");
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    if (url === "https://api.openai.com/v1/models") {
      return new Response(JSON.stringify({ data: [{ id: "test-model" }] }));
    }
    assert.equal(options.headers, undefined);
    assert.equal(url, "https://developers.openai.com/api/docs/pricing.md");
    return new Response([
      "### Standard pricing data", "",
      "| Model | Short context input | Short context output |",
      "| --- | --- | --- |",
      "| test-model | $2 | $8 |",
    ].join("\n"));
  });
  const handlers = createSettingsApiHandlers({ uiStateStore: { getAll: () => ({}) } });
  const req = Readable.from([Buffer.from(JSON.stringify({
    provider: "custom", baseUrl: "https://api.openai.com/v1", apiKey: "test-key",
  }))]);
  req.method = "POST";
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  await handlers["/api/models"](req, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.modelDetails[0].inputCost, 0.000002);
  assert.equal(res.body.modelDetails[0].outputCost, 0.000008);
  assert.equal(calls.length, 2);
});
