const DEFAULT_WORKSPACE_STORAGE_KEY = "ai-harness.defaultWorkspace";

function loadDefaultWorkspace(storage = globalThis.localStorage) {
  return String(storage?.getItem(DEFAULT_WORKSPACE_STORAGE_KEY) || "").trim();
}

function saveDefaultWorkspace(path, storage = globalThis.localStorage) {
  const workspace = String(path || "").trim();
  if (!workspace) throw new Error("Choose a workspace folder.");
  storage?.setItem(DEFAULT_WORKSPACE_STORAGE_KEY, workspace);
  return workspace;
}

export {
  DEFAULT_WORKSPACE_STORAGE_KEY,
  loadDefaultWorkspace,
  saveDefaultWorkspace,
};
