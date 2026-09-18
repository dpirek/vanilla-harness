// HF router prices are USD per million tokens, nested under upstream providers.
// Unsuffixed model IDs default to the live provider with highest throughput.
export function huggingFaceModelPricing(model) {
  const live = (Array.isArray(model?.providers) ? model.providers : [])
    .filter((provider) => provider.status === "live");
  const ranked = live.filter((provider) => (
    provider.throughput != null && Number.isFinite(Number(provider.throughput))
  )).sort((a, b) => Number(b.throughput) - Number(a.throughput));
  const selected = ranked[0] || (live.length === 1 ? live[0] : null);
  const perToken = (value) => {
    if (value == null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number / 1_000_000 : null;
  };
  return {
    inputCost: selected?.is_free === true ? 0 : perToken(selected?.pricing?.input),
    outputCost: selected?.is_free === true ? 0 : perToken(selected?.pricing?.output),
  };
}
