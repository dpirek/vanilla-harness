import { createSettingsApiHandlers } from "./settings.js";
import { createWorkspaceApiHandlers } from "./workspace.js";

export function createApiRouter(options) {
  const routes = new Map(Object.entries({
    ...createSettingsApiHandlers(options),
    ...createWorkspaceApiHandlers(options),
  }));

  return async function handleApiRequest(req, res, url) {
    const handler = routes.get(url.pathname);
    if (!handler) return false;
    await handler(req, res, url);
    return true;
  };
}
