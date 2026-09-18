export const DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing/";
let cachedPrices = new Map();
let loadedAt = 0;

function plainText(html) {
  return html.replace(/<sup\b[^>]*>[\s\S]*?<\/sup>/gi, "")
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ").trim();
}

// Use peak, cache-miss input rates, not discounted cached/off-peak rates.
export function parseDeepSeekPricing(html) {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0] || "";
  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => plainText(cell[1])));
  const modelRow = rows.find((row) => row[0] === "MODEL");
  if (!modelRow) return new Map();
  const ids = modelRow.slice(1);
  const prices = new Map(ids.map((id) => [id, { inputCost: null, outputCost: null }]));
  let kind = null;
  for (const row of rows) {
    const label = row.join(" ");
    if (/1M INPUT TOKENS/.test(label)) kind = /CACHE MISS/.test(label) ? "inputCost" : null;
    else if (/1M OUTPUT TOKENS/.test(label)) kind = "outputCost";
    if (!kind || !row.includes("PEAK")) continue;
    const values = row.slice(-ids.length);
    if (!values.every((value) => /^\$\d+(?:\.\d+)?$/.test(value))) continue;
    ids.forEach((id, index) => { prices.get(id)[kind] = Number(values[index].slice(1)) / 1_000_000; });
  }
  // These legacy IDs are explicitly documented as billed at the Flash price.
  const text = plainText(html);
  if (text.includes("billed at the Flash price") && prices.has("deepseek-flash")) {
    for (const alias of ["deepseek-v4-flash", "deepseek-v4-flash-vision-exp"]) {
      if (text.includes(alias)) prices.set(alias, { ...prices.get("deepseek-flash") });
    }
  }
  return new Map([...prices].filter(([, price]) => price.inputCost !== null || price.outputCost !== null));
}

export async function enrichDeepSeekPrices(models, { fetchImpl = fetch } = {}) {
  if (!loadedAt || Date.now() - loadedAt >= 60 * 60 * 1000) {
    try {
      const response = await fetchImpl(DEEPSEEK_PRICING_URL, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error(`DeepSeek pricing HTTP ${response.status}`);
      const prices = parseDeepSeekPricing(await response.text());
      if (!prices.size) throw new Error("DeepSeek pricing table unavailable");
      cachedPrices = prices;
      loadedAt = Date.now();
    } catch {
      // Preserve models and previously fetched prices if documentation is unavailable.
    }
  }
  return models.map((model) => {
    const price = cachedPrices.get(model.id);
    return {
      ...model,
      inputCost: model.inputCost ?? price?.inputCost ?? null,
      outputCost: model.outputCost ?? price?.outputCost ?? null,
    };
  });
}
