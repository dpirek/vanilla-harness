import { jsonOptions, requestJson } from "./api-client.js";

function loadWorkspaceTree(workspace) {
  return requestJson(`/api/workspace-tree?workspace=${encodeURIComponent(workspace)}`, {}, "Unable to load files.");
}

function createWorkspaceFolder(parent, name) {
  return requestJson(
    "/api/workspace-folder",
    jsonOptions("POST", { parent, name }),
    "Unable to create workspace folder.",
  );
}

async function loadWorkspaceFile(workspace, path) {
  const payload = await requestJson(
    `/api/workspace-file?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`,
    {},
    "Unable to open file.",
  );
  return payload.content;
}

export {
  createWorkspaceFolder,
  loadWorkspaceFile,
  loadWorkspaceTree,
};
