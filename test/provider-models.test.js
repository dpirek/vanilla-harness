import assert from "node:assert/strict";
import test from "node:test";

import {
  filterAndSortProviderModels,
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
