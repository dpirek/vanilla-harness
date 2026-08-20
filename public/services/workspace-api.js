import { jsonOptions, requestJson } from "./api-client.js";

const WORKSPACE_IMAGE_EXTENSIONS = new Set([
  ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp",
]);

function normalizeWorkspaceLinkPath(value) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(value || ""));
  } catch {
    return "";
  }
  const parts = [];
  for (const part of decoded.replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return "";
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

function workspaceFileAssetUrl(workspace, path) {
  return `/api/workspace-file-asset?workspace=${encodeURIComponent(workspace)}&path=${encodeURIComponent(path)}`;
}

function isWorkspaceImagePath(path) {
  const value = String(path || "");
  const extensionIndex = value.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? value.slice(extensionIndex).toLowerCase() : "";
  return WORKSPACE_IMAGE_EXTENSIONS.has(extension);
}

function resolveWorkspaceMarkdownLink(workspace, href) {
  const value = String(href || "").trim();
  if (!value || /^(?:https?:|mailto:)/i.test(value) || value.startsWith("#") || value.startsWith("?")) {
    return { href: value, previewImage: false };
  }
  const hashIndex = value.indexOf("#");
  const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
  const withoutHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
  const fileReference = withoutHash.split("?", 1)[0];
  const path = normalizeWorkspaceLinkPath(fileReference);
  if (!path) return { href: "", previewImage: false };
  return {
    href: `${workspaceFileAssetUrl(workspace, path)}${hash}`,
    previewImage: isWorkspaceImagePath(path),
  };
}

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

function createConversationWorkspace(root, sessionId) {
  return requestJson(
    "/api/conversation-workspace",
    jsonOptions("POST", { root, sessionId }),
    "Unable to create the conversation workspace.",
  );
}

function deleteConversationWorkspace(root, sessionId) {
  return requestJson(
    "/api/conversation-workspace",
    jsonOptions("DELETE", { root, sessionId }),
    "Unable to delete the conversation workspace.",
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
  createConversationWorkspace,
  createWorkspaceFolder,
  deleteConversationWorkspace,
  isWorkspaceImagePath,
  loadWorkspaceFile,
  loadWorkspaceTree,
  resolveWorkspaceMarkdownLink,
  workspaceFileAssetUrl,
};
