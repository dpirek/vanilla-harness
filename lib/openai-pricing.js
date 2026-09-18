// OpenAI's Models API has no prices. Use the provider's published standard
// text-token rates; never infer prices for unlisted models or modalities.
export const OPENAI_PRICING_URL = "https://developers.openai.com/api/docs/pricing.md";
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

function tokenPrice(value) {
  const match = /^\$([\d,]+(?:\.\d+)?)$/.exec(value?.trim());
  return match ? Number(match[1].replaceAll(",", "")) / 1_000_000 : null;
}

export function parseOpenAiPricing(markdown) {
  const section = markdown.match(/^### Standard pricing data\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1] || "";
  const rows = section.split("\n").filter((line) => line.startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
  const [header = []] = rows;
  const inputIndex = header.indexOf("Short context input");
  const outputIndex = header.indexOf("Short context output");
  if (inputIndex < 0 || outputIndex < 0) return new Map();
  return new Map(rows.slice(2).flatMap((row) => {
    const id = row[0].replace(/\s+\(.*$/, "");
    const inputCost = tokenPrice(row[inputIndex]);
    const outputCost = tokenPrice(row[outputIndex]);
    return inputCost !== null || outputCost !== null ? [[id, { inputCost, outputCost }]] : [];
  }));
}

export function parseOpenAiModelPricing(markdown, modelId) {
  // Only accept the exact model's own text-token table.
  if (!markdown.includes(`Model ID: \`${modelId}\``)) return null;
  const section = markdown.match(/^### Text tokens\s*\n([\s\S]*?)(?=^## |^### |$(?![\s\S]))/m)?.[1] || "";
  const prices = {};
  for (const line of section.split("\n")) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells[2] !== "1M tokens") continue;
    if (cells[0] === "Input") prices.inputCost = tokenPrice(cells[1]);
    if (cells[0] === "Output") prices.outputCost = tokenPrice(cells[1]);
  }
  return prices.inputCost != null || prices.outputCost != null ? prices : null;
}

async function documentText(url, fetchImpl, signal) {
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (response.status === 404) {
      cache.set(url, { at: Date.now(), text: "" });
      return "";
    }
    if (!response.ok) throw new Error(`Pricing document HTTP ${response.status}`);
    const text = await response.text();
    cache.set(url, { at: Date.now(), text });
    return text;
  } catch {
    // Pricing availability must never prevent the models list from loading.
    return cached?.text || "";
  }
}

export async function enrichOpenAiPrices(models, { fetchImpl = fetch } = {}) {
  const signal = AbortSignal.timeout(15000);
  const prices = parseOpenAiPricing(await documentText(OPENAI_PRICING_URL, fetchImpl, signal));
  const pending = [...models];
  const result = new Map();
  await Promise.all(Array.from({ length: Math.min(4, models.length) }, async () => {
    while (pending.length) {
      const model = pending.shift();
      let price = prices.get(model.id);
      if (!price && !signal.aborted && /^[a-z0-9][a-z0-9.-]*$/i.test(model.id)) {
        const url = `https://developers.openai.com/api/docs/models/${encodeURIComponent(model.id)}.md`;
        price = parseOpenAiModelPricing(await documentText(url, fetchImpl, signal), model.id);
      }
      result.set(model.id, {
        ...model,
        inputCost: model.inputCost ?? price?.inputCost ?? null,
        outputCost: model.outputCost ?? price?.outputCost ?? null,
      });
    }
  }));
  return models.map((model) => result.get(model.id));
}
