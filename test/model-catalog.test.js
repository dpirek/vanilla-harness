import assert from "node:assert/strict";
import test from "node:test";

import { catalogModel, openAiPricingCatalog } from "../api/settings.js";

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

test("OpenAI pricing normalizes per-million and per-token response fields", () => {
  assert.deepEqual(openAiPricingCatalog({ data: [
    { model: "gpt-6-astra", input: 10, output: 50 },
    { model_id: "gpt-5.6-sol", input_cost_per_token: 0.000004, output_cost_per_token: 0.00002 },
  ] }), [
    { id: "gpt-6-astra", inputCost: 0.00001, outputCost: 0.00005 },
    { id: "gpt-5.6-sol", inputCost: 0.000004, outputCost: 0.00002 },
  ]);
});
