export const OLLAMA_PRICING_URL = "https://ollama.com/pricing";
let cachedPrices = new Map();
let loadedAt = 0;

export function parseOllamaPricing(html) {
  const prices = new Map();
  // The later peak-pricing table overrides base rates for affected models.
  for (const [table] of html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
      .map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map((cell) => cell[1].replace(/<[^>]*>/g, "").trim()));
    const [header = []] = rows;
    if (header.join("|") !== "Model|Input|Cached input|Output") continue;
    const perToken = (value) => /^\$\d+(?:\.\d+)?$/.test(value)
      ? Number(value.slice(1)) / 1_000_000 : null;
    for (const row of rows.slice(1)) {
      const inputCost = perToken(row[1]);
      const outputCost = perToken(row[3]);
      if (inputCost !== null || outputCost !== null) prices.set(row[0], { inputCost, outputCost });
    }
  }
  return prices;
}

export async function enrichOllamaPrices(models, { fetchImpl = fetch } = {}) {
  if (!loadedAt || Date.now() - loadedAt >= 60 * 60 * 1000) {
    try {
      const response = await fetchImpl(OLLAMA_PRICING_URL, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`Ollama pricing HTTP ${response.status}`);
      const prices = parseOllamaPricing(await response.text());
      if (!prices.size) throw new Error("Ollama pricing table unavailable");
      cachedPrices = prices;
      loadedAt = Date.now();
    } catch {
      // An unavailable pricing page must not prevent model discovery.
    }
  }
  return models.map((model) => {
    const id = model.id.replace(/-cloud$/, "");
    // Exact size-specific prices take priority over published family rates.
    const price = cachedPrices.get(id) || cachedPrices.get(id.split(":")[0]);
    return {
      ...model,
      inputCost: model.inputCost ?? price?.inputCost ?? null,
      outputCost: model.outputCost ?? price?.outputCost ?? null,
    };
  });
}
