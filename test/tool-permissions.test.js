import assert from "node:assert/strict";
import test from "node:test";

import { normalizeStoredToolPermissions } from "../lib/ui-state.js";
import { normalizeToolPermissions } from "../public/lib/settings.js";

test("server and browser permission defaults expose Chrome DevTools", () => {
  const serverPermissions = normalizeStoredToolPermissions({});
  const browserPermissions = normalizeToolPermissions({});

  assert.equal(serverPermissions.chrome_devtools, true);
  assert.deepEqual(serverPermissions, browserPermissions);
});
