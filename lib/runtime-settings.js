export const DEFAULT_RUNTIME_SETTINGS = Object.freeze({
  permissions: { default: 'allow', rules: [] },
  context: { enabled: true, maxTokens: 32000, reserveTokens: 4000, keepRecent: 4 },
  javascript: { checkAfterEdit: true },
});

export function normalizeRuntimeSettings(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Runtime settings must be an object.");
  const permissions = value.permissions || DEFAULT_RUNTIME_SETTINGS.permissions;
  if (!['allow', 'ask', 'deny'].includes(permissions.default)) throw new Error('Permission default must be allow, ask, or deny.');
  if (!Array.isArray(permissions.rules) || permissions.rules.length > 200) throw new Error('Permissions require at most 200 rules.');
  const rules = permissions.rules.map((rule) => {
    if (!rule || !['allow', 'ask', 'deny'].includes(rule.action) || typeof rule.tool !== 'string' || !rule.tool || typeof rule.pattern !== 'string' || !rule.pattern || rule.tool.length > 100 || rule.pattern.length > 1000) {
      throw new Error('Each permission rule needs tool, pattern, and action (allow/ask/deny).');
    }
    return { tool: rule.tool, pattern: rule.pattern, action: rule.action };
  });
  const context = { ...DEFAULT_RUNTIME_SETTINGS.context, ...value.context };
  if (!Number.isInteger(context.maxTokens) || context.maxTokens < 8000 || context.maxTokens > 1000000) throw new Error('Context maxTokens must be 8000–1000000.');
  if (!Number.isInteger(context.reserveTokens) || context.reserveTokens < 1000 || context.reserveTokens >= context.maxTokens / 2) throw new Error('Reserve tokens must be at least 1000 and less than half the context budget.');
  if (!Number.isInteger(context.keepRecent) || context.keepRecent < 1 || context.keepRecent > 20) throw new Error('Keep recent must be 1–20 turns.');
  return { permissions: { default: permissions.default, rules }, context: { ...context, enabled: context.enabled !== false }, javascript: { checkAfterEdit: value.javascript?.checkAfterEdit !== false } };
}

export function runtimeSettings(store) {
  return normalizeRuntimeSettings(store?.getRuntimeValue?.('settings') || DEFAULT_RUNTIME_SETTINGS);
}
