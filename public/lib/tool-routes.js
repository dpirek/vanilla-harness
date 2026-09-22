const TOOL_TABS = new Set(["permissions", "files", "runtime", "test"]);

function toolsTabFromPath(pathname) {
  const match = /^\/tools(?:\/(permissions|files|runtime|test))?\/?$/.exec(pathname);
  return match ? match[1] || "permissions" : null;
}

function toolsTabPath(tab) {
  if (!TOOL_TABS.has(tab)) throw new Error(`Unknown Tools tab: ${tab}`);
  return `/tools/${tab}`;
}

export { toolsTabFromPath, toolsTabPath };
