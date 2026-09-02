import assert from "node:assert/strict";
import test from "node:test";

import { activateEnvironmentPreset } from "../lib/env-config.js";

test("environment preset activates a preset by name", () => {
  const configurations = [
    { id: "one", name: "Default" },
    { id: "two", name: "Review", selected: true },
  ];
  let activatedId = null;
  const store = {
    getRigConfigurations: () => ({ configurations, activeConfigurationId: "two" }),
    setRigConfigurations(items, id) {
      assert.equal(items, configurations);
      activatedId = id;
      return { configurations: items, activeConfigurationId: id };
    },
  };

  activateEnvironmentPreset(store, "default");
  assert.equal(activatedId, "one");
});

test("environment preset accepts an id and rejects an unknown selector", () => {
  const store = {
    getRigConfigurations: () => ({
      configurations: [{ id: "preset-id", name: "Default" }],
      activeConfigurationId: "preset-id",
    }),
    setRigConfigurations() {
      throw new Error("already active preset should not be rewritten");
    },
  };

  assert.equal(activateEnvironmentPreset(store, "preset-id").activeConfigurationId, "preset-id");
  assert.throws(() => activateEnvironmentPreset(store, "missing"), /does not match/);
});
