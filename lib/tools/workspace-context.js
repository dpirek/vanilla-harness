import path from "node:path";

function createWorkspaceContext({ root, approve }) {
  const workspace = path.resolve(root);

  // Resolve user/model-provided paths against the workspace and reject anything
  // that escapes via ../ or an absolute path.
  function resolvePath(requested = ".") {
    const absolute = path.resolve(workspace, requested);
    const relative = path.relative(workspace, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path is outside the workspace: ${requested}`);
    }
    return absolute;
  }

  function relativePath(absolute) {
    return path.relative(workspace, absolute) || ".";
  }

  return { approve, relativePath, resolvePath, workspace };
}

export { createWorkspaceContext };
