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

function saveWorkspaceFile(workspace, path, content) {
  return requestJson(
    "/api/workspace-file",
    jsonOptions("PUT", { workspace, path, content }),
    "Unable to save file.",
  );
}

function workspaceFileAssetUrl(workspace, path) {
  return `/api/workspace-file-asset?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;
}

async function saveWorkspaceRecording(workspace, blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return requestJson(
    "/api/workspace-recording",
    jsonOptions("POST", { workspace, mimeType: blob.type, data: btoa(binary) }),
    "Unable to save microphone recording.",
  );
}

function transcribeWorkspaceRecording(workspace, path) {
  return requestJson(
    "/api/workspace-transcription",
    jsonOptions("POST", { workspace, path }),
    "Unable to transcribe microphone recording.",
  );
}

export {
  createWorkspaceFolder,
  loadWorkspaceFile,
  loadWorkspaceTree,
  saveWorkspaceFile,
  saveWorkspaceRecording,
  transcribeWorkspaceRecording,
  workspaceFileAssetUrl,
};
