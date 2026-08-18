import assert from "node:assert/strict";
import test from "node:test";

import { resolveDisabledSteps } from "../lib/agent.js";

test("active preset workflow effects disable agent steps", () => {
  const disabled = resolveDisabledSteps([], {
    composer: false,
    tools: true,
    mcp: false,
    validation: true,
  });

  assert.deepEqual(disabled, ["composer", "mcp"]);
});

test("preset workflow effects combine with valid request overrides", () => {
  const disabled = resolveDisabledSteps(
    ["tools", "unknown", "tools"],
    { composer: false, validation: false },
  );

  assert.deepEqual(disabled, ["tools", "composer", "validation"]);
});
