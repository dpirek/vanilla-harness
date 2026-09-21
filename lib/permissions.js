export function wildcard(pattern, value) {
  const expression = String(pattern).split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${expression}$`, 's').test(String(value));
}

export function permissionDecision(policy, tool, target) {
  return [...(policy.rules || [])].reverse().find((rule) => wildcard(rule.tool, tool) && wildcard(rule.pattern, target))?.action || policy.default || 'allow';
}

export function createAuthorizer({ settings, ask = async () => false }) {
  return async (tool, target = '*', { signal, details } = {}) => {
    signal?.throwIfAborted();
    const action = permissionDecision(settings().permissions, tool, target);
    if (action === 'deny') throw new Error(`Permission denied: ${tool} ${target}`);
    const detailText = action === 'ask' && details ? JSON.stringify(details, null, 2) : '';
    const preview = detailText.slice(0, 16000) + (detailText.length > 16000 ? '\n[arguments truncated]' : '');
    if (action === 'ask' && !await ask({ tool, target, preview }, { signal })) throw new Error(`Permission denied: ${tool} ${target}`);
    signal?.throwIfAborted();
    if (permissionDecision(settings().permissions, tool, target) === "deny") throw new Error(`Permission denied: ${tool} ${target}`);
    return true;
  };
}

export function protectTools(tools, authorize) {
  return tools.map((tool) => {
    if (tool.type === 'mcp') throw new Error('Granular permissions require locally executed MCP tools.');
    return { ...tool, async execute(args, options = {}) {
      const targets = Array.isArray(args?.edits) ? args.edits.map((edit) => edit.path) : [args?.path ?? args?.command ?? args?.url ?? args?.agent ?? '*'];
      for (const target of [...new Set(targets)]) await authorize(tool.name, String(target), { ...options, details: args });
      return tool.execute(args, options);
    } };
  });
}
