const MODEL_CONTEXT_WINDOWS = [
  { pattern: /^gpt-5\.6(?:-(?:sol|terra|luna))?(?:-\d{4}-\d{2}-\d{2})?$/i, tokens: 1_050_000 },
  { pattern: /^gpt-5\.1-codex(?:-(?:mini|max))?(?:-\d{4}-\d{2}-\d{2})?$/i, tokens: 400_000 },
];

function normalizeContextWindow(value) {
  const tokens = Number(value);
  return Number.isFinite(tokens) && tokens > 0 ? Math.round(tokens) : null;
}

function modelContextWindow(model = "") {
  const name = String(model || "").trim().split("/").at(-1);
  return MODEL_CONTEXT_WINDOWS.find(({ pattern }) => pattern.test(name))?.tokens || null;
}

function contextUsageForTurn(detail = {}, usage) {
  if (!usage) return null;
  const model = String(detail.inputPrompt?.model || detail.serverResponse?.model || detail.model || "").trim();
  const contextWindow = [
    detail.contextWindow,
    detail.context_window,
    detail.serverResponse?.contextWindow,
    detail.serverResponse?.context_window,
    detail.serverResponse?.usage?.contextWindow,
    detail.serverResponse?.usage?.context_window,
    modelContextWindow(model),
  ].map(normalizeContextWindow).find(Boolean) || null;
  if (!contextWindow) return null;
  const usedTokens = Math.max(0, Number(usage.totalTokens) || 0);
  return {
    model,
    usedTokens,
    contextWindow,
    percentage: Number((usedTokens / contextWindow * 100).toFixed(6)),
  };
}

function formatContextPercentage(value) {
  const percentage = Math.max(0, Number(value) || 0);
  if (percentage > 0 && percentage < 0.1) return "<0.1% context";
  if (percentage < 10) return `${percentage.toFixed(1).replace(/\.0$/, "")}% context`;
  return `${Math.round(percentage)}% context`;
}

export { contextUsageForTurn, formatContextPercentage, modelContextWindow };
