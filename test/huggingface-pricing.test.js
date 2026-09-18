import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { huggingFaceModelPricing } from "../lib/huggingface-pricing.js";
import { createSettingsApiHandlers } from "../api/settings.js";

const model = { id: "org/model", providers: [
  { status: "live", throughput: 10, pricing: { input: 0.1, output: 0.2 } },
  { status: "error", throughput: 1000, pricing: { input: 5, output: 10 } },
  { status: "live", throughput: 100, pricing: { input: 0.5, output: 2 } },
] };

test("HF uses fastest live provider and converts per-million prices to per-token", () => {
  assert.deepEqual(huggingFaceModelPricing(model), { inputCost: 0.5 / 1e6, outputCost: 2 / 1e6 });
  assert.deepEqual(huggingFaceModelPricing({ providers: [{ status: "live", is_free: true }] }),
    { inputCost: 0, outputCost: 0 });
});

test("HF does not borrow a slower provider's price or invent unknown prices", () => {
  assert.deepEqual(huggingFaceModelPricing({ providers: [
    ...model.providers, { status: "live", throughput: 200 },
  ] }), { inputCost: null, outputCost: null });
  assert.deepEqual(huggingFaceModelPricing({ providers: [
    { status: "live", pricing: { input: -1, output: "bad" } },
  ] }), { inputCost: null, outputCost: null });
  assert.deepEqual(huggingFaceModelPricing({}), { inputCost: null, outputCost: null });
});

test("HF catalog API reads nested pricing without a separate request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url) => {
    calls++;
    assert.equal(url, "https://router.huggingface.co/v1/models");
    return new Response(JSON.stringify({ data: [model] }));
  });
  const handlers = createSettingsApiHandlers({ uiStateStore: { getAll: () => ({}) } });
  const req = Readable.from([Buffer.from(JSON.stringify({
    provider: "openai", baseUrl: "https://router.huggingface.co/v1", apiKey: "test-key",
  }))]);
  req.method = "POST";
  const res = { writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  await handlers["/api/models"](req, res);
  assert.equal(res.status, 200);
  assert.equal(res.body.modelDetails[0].inputCost, 0.5 / 1e6);
  assert.equal(res.body.modelDetails[0].outputCost, 2 / 1e6);
  assert.equal(calls, 1);
});
