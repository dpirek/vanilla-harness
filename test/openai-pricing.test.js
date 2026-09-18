import assert from "node:assert/strict";
import test from "node:test";
import { enrichOpenAiPrices, parseOpenAiPricing, parseOpenAiModelPricing } from "../lib/openai-pricing.js";

const pricing = `### Standard pricing data

| Model | Short context input | Short context cached input | Short context output | Long context input | Long context output |
| --- | --- | --- | --- | --- | --- |
| example | $2.50 | $0.25 | $10.00 | $5 | $15 |
| other (<272K context length) | $1 | - | $3 | - | - |

### Batch pricing data

| Model | Short context input | Short context cached input | Short context output |
| --- | --- | --- | --- |
| example | $1.25 | - | $5 |
`;
const modelDoc = `Model ID: \`coding-model\`

### Text tokens

| Metric | Price | Unit |
| --- | --- | --- |
| Input | $1.25 | 1M tokens |
| Cached input | $0.125 | 1M tokens |
| Output | $10 | 1M tokens |

### Audio tokens
| Input | $50 | 1M tokens |
`;

test("published standard pricing excludes batch, cached and long-context rates", () => {
  const prices = parseOpenAiPricing(pricing);
  assert.deepEqual(prices.get("example"), { inputCost: 0.0000025, outputCost: 0.00001 });
  assert.equal(prices.get("other").inputCost, 0.000001);
  assert.equal(parseOpenAiPricing("<html>error</html>").size, 0);
});

test("model pricing requires an exact ID and text-token units", () => {
  assert.deepEqual(parseOpenAiModelPricing(modelDoc, "coding-model"), {
    inputCost: 0.00000125, outputCost: 0.00001,
  });
  assert.equal(parseOpenAiModelPricing(modelDoc, "other"), null);
  assert.equal(parseOpenAiModelPricing(modelDoc.replaceAll("1M tokens", "minute"), "coding-model"), null);
});

test("price enrichment uses official public documents without credentials and tolerates missing prices", async () => {
  const requests = [];
  const models = await enrichOpenAiPrices([
    { id: "example", inputCost: null, outputCost: null },
    { id: "coding-model" },
    { id: "unknown-model" },
  ], { fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.headers, undefined);
    if (url.endsWith("/pricing.md")) return new Response(pricing);
    if (url.endsWith("/coding-model.md")) return new Response(modelDoc);
    throw new Error("unavailable");
  } });
  assert.equal(models[0].inputCost, 0.0000025);
  assert.equal(models[1].outputCost, 0.00001);
  assert.equal(models[2].inputCost, null);
  assert.equal(requests.length, 3);
});
