function modelsRouteProviderId(pathname) {
  const match = /^\/models(?:\/([^/]+))?\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1] || "");
  } catch {
    return "";
  }
}

function modelsRoutePath(providerId = "") {
  return providerId ? `/models/${encodeURIComponent(providerId)}` : "/models";
}

function normalizeProviderModels(models) {
  const normalized = new Map();
  for (const value of Array.isArray(models) ? models : []) {
    const source = typeof value === "string" ? { id: value } : value;
    if (!source || typeof source !== "object") continue;
    const id = String(source.id || source.name || "").trim();
    if (!id) continue;
    const record = {
      id,
      tools: typeof source.tools === "boolean" ? source.tools : null,
      throughput: finiteNumber(source.throughput),
      latency: finiteNumber(source.latency),
      context: finiteNumber(source.context),
      inputCost: nonNegativeNumber(source.inputCost),
      outputCost: nonNegativeNumber(source.outputCost),
      testedAt: finiteNumber(source.testedAt),
    };
    const existing = normalized.get(id);
    normalized.set(id, existing
      ? Object.fromEntries(Object.entries(record).map(([key, entry]) => [key, entry ?? existing[key]]))
      : record);
  }
  return [...normalized.values()];
}

function groupedProviderModels(providers) {
  const grouped = new Map();
  for (const provider of Array.isArray(providers) ? providers : []) {
    const providerName = String(provider?.name || provider?.type || "Provider");
    const models = normalizeProviderModels([provider?.model, ...normalizeProviderModels(provider?.models)]);
    for (const model of models) {
      if (!grouped.has(model.id)) grouped.set(model.id, { providers: new Set(), details: [] });
      const group = grouped.get(model.id);
      group.providers.add(providerName);
      group.details.push({ ...model, provider: providerName, providerId: provider?.id });
    }
  }
  return [...grouped.entries()]
    .map(([model, group]) => ({
      model,
      providers: [...group.providers].sort((a, b) => a.localeCompare(b)),
      details: group.details,
    }))
    .sort((a, b) => a.model.localeCompare(b.model));
}

function providersNeedingInitialModelLoad(providers) {
  return (Array.isArray(providers) ? providers : []).filter((provider) => {
    const models = normalizeProviderModels(provider?.models);
    const loadedAt = Number(provider?.modelsLoadedAt);
    if (!loadedAt && models.length === 0) return true;
    let hasPublishedPricing = false;
    try {
      hasPublishedPricing = ["api.openai.com", "api.deepseek.com", "router.huggingface.co", "ollama.com"].includes(new URL(provider.baseUrl || (provider.type === "openai" ? "https://api.openai.com/v1" : "")).hostname);
    } catch {}
    return hasPublishedPricing
      && !models.some((model) => model.inputCost !== null || model.outputCost !== null)
      && (!loadedAt || Date.now() - loadedAt > 60 * 60 * 1000);
  });
}

function mergeRefreshedProviderModels(existingModels, refreshedModels) {
  const existing = new Map(normalizeProviderModels(existingModels).map((model) => [model.id, model]));
  return normalizeProviderModels(refreshedModels).map((model) => {
    const benchmark = existing.get(model.id);
    if (!benchmark) return model;
    return {
      tools: model.tools ?? benchmark.tools,
      throughput: benchmark.testedAt ? benchmark.throughput : model.throughput,
      latency: benchmark.testedAt ? benchmark.latency : model.latency,
      context: model.context ?? benchmark.context,
      inputCost: model.inputCost ?? benchmark.inputCost,
      outputCost: model.outputCost ?? benchmark.outputCost,
      testedAt: benchmark.testedAt,
      id: model.id,
    };
  });
}

function filterAndSortProviderModels(models, { query = "", providerId = "", key = "model", direction = "asc" } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  const scoped = (Array.isArray(models) ? models : []).flatMap((item) => {
    if (!providerId) return [item];
    const details = item.details.filter((detail) => String(detail.providerId) === String(providerId));
    return details.length ? [{
      ...item,
      details,
      providers: [...new Set(details.map((detail) => detail.provider))],
    }] : [];
  });
  const filtered = scoped.filter((item) => (
    !normalizedQuery || `${item.model} ${item.providers.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery)
  ));
  const multiplier = direction === "desc" ? -1 : 1;
  return [...filtered].sort((left, right) => {
    const leftValue = providerModelSortValue(left, key);
    const rightValue = providerModelSortValue(right, key);
    if (leftValue === null && rightValue === null) return left.model.localeCompare(right.model);
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    const comparison = typeof leftValue === "number" && typeof rightValue === "number"
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true });
    return comparison === 0 ? left.model.localeCompare(right.model) : comparison * multiplier;
  });
}

function providerModelSortValue(item, key) {
  if (key === "model") return item.model;
  if (key === "providers") return item.providers.join(", ");
  const values = [...new Set(item.details.map((detail) => detail[key]).filter((value) => value !== null))];
  if (values.length === 0) return null;
  if (typeof values[0] === "boolean") return values.reduce((sum, value) => sum + Number(value), 0) / values.length;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatProviderModelValues(details, key, formatter, unavailable = "—") {
  const ordered = [...details].sort((left, right) => (
    left.provider.localeCompare(right.provider)
    || String(left.providerId || "").localeCompare(String(right.providerId || ""))
  ));
  return ordered.map((detail) => (
    detail[key] === null || detail[key] === undefined ? unavailable : formatter(detail[key], detail)
  )).join(" / ");
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function nonNegativeNumber(value) {
  const number = finiteNumber(value);
  return number !== null && number >= 0 ? number : null;
}

export {
  modelsRouteProviderId,
  modelsRoutePath,
  filterAndSortProviderModels,
  formatProviderModelValues,
  groupedProviderModels,
  mergeRefreshedProviderModels,
  normalizeProviderModels,
  providersNeedingInitialModelLoad,
};
