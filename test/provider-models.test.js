import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortProviderModels,
  modelsRouteProviderId,
  modelsRoutePath,
  formatProviderModelValues,
  groupedProviderModels,
  mergeRefreshedProviderModels,
  normalizeProviderModels,
  providersNeedingInitialModelLoad,
} from "../public/lib/provider-models.js";

test("provider models are normalized and deduplicated", () => {
  assert.deepEqual(normalizeProviderModels([
    " gpt-5 ",
    { id: "gpt-5", tools: true, context: 128000 },
    null,
  ]), [{
    id: "gpt-5",
    tools: true,
    throughput: null,
    latency: null,
    context: 128000,
    inputCost: null,
    outputCost: null,
    testedAt: null,
  }]);
});

test("negative provider pricing sentinels normalize to unavailable", () => {
  const [model] = normalizeProviderModels([{ id: "openrouter/auto", inputCost: -1, outputCost: "-1" }]);
  assert.equal(model.inputCost, null);
  assert.equal(model.outputCost, null);
});

test("catalog refresh preserves measured performance and its hidden timestamp", () => {
  assert.deepEqual(mergeRefreshedProviderModels(
    [{ id: "gpt-5", throughput: 42, latency: 350, testedAt: 123, inputCost: 1 }],
    [{ id: "gpt-5", throughput: 99, latency: 10, inputCost: 2, outputCost: 4 }],
  ), [{
    id: "gpt-5",
    tools: null,
    throughput: 42,
    latency: 350,
    context: null,
    inputCost: 2,
    outputCost: 4,
    testedAt: 123,
  }]);
});

test("price refresh keeps cached benchmark values", () => {
  const [model] = mergeRefreshedProviderModels(
    [{ id: "gpt-6-astra", throughput: 55.5, latency: 420, testedAt: 123 }],
    [{ id: "gpt-6-astra", inputCost: 0.00001, outputCost: 0.00005 }],
  );
  assert.equal(model.inputCost, 0.00001);
  assert.equal(model.outputCost, 0.00005);
  assert.equal(model.throughput, 55.5);
  assert.equal(model.latency, 420);
  assert.equal(model.testedAt, 123);
});

test("models shared by providers render as one grouped record", () => {
  const grouped = groupedProviderModels([
    { name: "OpenAI", model: "gpt-5", models: ["gpt-5", "gpt-4.1"] },
    { name: "Gateway", model: "gpt-5", models: ["custom-model", "gpt-5"] },
  ]);
  assert.deepEqual(grouped.map(({ model, providers }) => ({ model, providers })), [
    { model: "custom-model", providers: ["Gateway"] },
    { model: "gpt-4.1", providers: ["OpenAI"] },
    { model: "gpt-5", providers: ["Gateway", "OpenAI"] },
  ]);
  assert.equal(grouped[2].details.length, 2);
});

test("shared-model metadata is ordered by provider and separated with slashes", () => {
  const details = [
    { provider: "Zulu", providerId: "z", throughput: null },
    { provider: "Alpha", providerId: "a", throughput: 42.25 },
  ];
  assert.equal(
    formatProviderModelValues(details, "throughput", (value) => `${value} t/s`),
    "42.25 t/s / —",
  );
});

test("only providers without a cached or previously attempted catalog auto-load", () => {
  const providers = [
    { id: "new", models: [], modelsLoadedAt: null },
    { id: "cached", models: ["gpt-5"], modelsLoadedAt: null },
    { id: "attempted", models: [], modelsLoadedAt: 12345 },
  ];
  assert.deepEqual(providersNeedingInitialModelLoad(providers).map(({ id }) => id), ["new"]);
});

test("grouped models filter by model or provider and sort metadata with missing values last", () => {
  const grouped = groupedProviderModels([
    { name: "Fast gateway", models: [{ id: "model-b", context: 64000 }] },
    { name: "OpenAI", models: [{ id: "model-a", context: 128000 }, { id: "model-c" }] },
  ]);
  assert.deepEqual(
    filterAndSortProviderModels(grouped, { query: "openai", key: "context", direction: "desc" })
      .map(({ model }) => model),
    ["model-a", "model-c"],
  );
  assert.deepEqual(
    filterAndSortProviderModels(grouped, { key: "context", direction: "asc" }).map(({ model }) => model),
    ["model-b", "model-a", "model-c"],
  );
});

test("provider filter scopes shared models and metadata by ID and combines with search and sorting", () => {
  const grouped = groupedProviderModels([
    { id: "a", name: "Gateway", models: [{ id: "shared", context: 100 }, { id: "only-a" }] },
    { id: "b", name: "Gateway", models: [{ id: "shared", context: 200 }, { id: "only-b", context: 300 }] },
  ]);
  const filtered = filterAndSortProviderModels(grouped, { providerId: "b", key: "context", direction: "desc" });
  assert.deepEqual(filtered.map(({ model }) => model), ["only-b", "shared"]);
  assert.deepEqual(filtered[1].details.map(({ providerId, context }) => ({ providerId, context })), [
    { providerId: "b", context: 200 },
  ]);
  assert.deepEqual(filterAndSortProviderModels(grouped, { providerId: "b", query: "only-a" }), []);
  assert.equal(filterAndSortProviderModels(grouped, { providerId: "b", query: "shared" }).length, 1);
  assert.deepEqual(filterAndSortProviderModels(grouped, { providerId: "missing" }), []);
  assert.equal(filterAndSortProviderModels(grouped, { providerId: "" }).length, 3);
  assert.equal(grouped.find(({ model }) => model === "shared").details.length, 2);
});

test("models routes round-trip provider IDs and distinguish non-model paths", () => {
  for (const providerId of ["", "provider-123", "My provider", "gateway/custom", "a%?#"]) {
    assert.equal(modelsRouteProviderId(modelsRoutePath(providerId)), providerId);
  }
  assert.equal(modelsRouteProviderId("/models/provider-123/"), "provider-123");
  assert.equal(modelsRouteProviderId("/models/"), "");
  assert.equal(modelsRouteProviderId("/models/%broken"), "");
  assert.equal(modelsRouteProviderId("/"), null);
  assert.equal(modelsRouteProviderId("/models/provider/extra"), null);
});

test("cached OpenAI catalogs without prices refresh even when configured as custom", () => {
  const providers = [
    { id: "openai-custom", type: "custom", baseUrl: "https://api.openai.com/v1", models: ["gpt-5"], modelsLoadedAt: 1 },
    { id: "priced", type: "openai", models: [{ id: "gpt-5", inputCost: 0.000001 }], modelsLoadedAt: 1 },
    { id: "gateway", type: "openai", baseUrl: "https://gateway.example/v1", models: ["gpt-5"], modelsLoadedAt: 1 },
    { id: "recent-attempt", type: "openai", models: ["gpt-5"], modelsLoadedAt: Date.now() },
  ];
  assert.deepEqual(providersNeedingInitialModelLoad(providers).map(({ id }) => id), ["openai-custom"]);
});

test("cached DeepSeek catalogs without prices refresh by endpoint", () => {
  const providers = [
    { id: "deepseek", type: "custom", baseUrl: "https://api.deepseek.com/v1", models: ["deepseek-flash"], modelsLoadedAt: 1 },
    { id: "other", type: "custom", baseUrl: "https://gateway.example", models: ["deepseek-flash"], modelsLoadedAt: 1 },
  ];
  assert.deepEqual(providersNeedingInitialModelLoad(providers).map(({ id }) => id), ["deepseek"]);
});

test("cached Hugging Face models without prices refresh", () => {
  const provider = { id: "hf", type: "openai", baseUrl: "https://router.huggingface.co/v1", models: ["org/model"], modelsLoadedAt: 1 };
  assert.deepEqual(providersNeedingInitialModelLoad([provider]).map(({ id }) => id), ["hf"]);
});
