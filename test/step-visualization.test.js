import assert from "node:assert/strict";
import test from "node:test";

import { stepVisualizationModel } from "../public/lib/step-visualization.js";

test("step visualization describes active harness work", () => {
  const model = stepVisualizationModel({
    complete: false,
    current: { label: "Run tests" },
    items: [
      { id: "one", label: "Read files", status: "completed" },
      { id: "two", label: "Run tests", status: "running" },
    ],
  }, { active: true });

  assert.equal(model.state, "running");
  assert.equal(model.summary, "1 of 2 steps completed; Performing Run tests");
  assert.deepEqual(model.items.map((item) => item.status), ["completed", "running"]);
});

test("step visualization retains the most recent steps and reports failures", () => {
  const items = Array.from({ length: 8 }, (_, index) => ({
    id: String(index),
    label: `Step ${index + 1}`,
    status: index === 7 ? "failed" : "completed",
  }));
  const model = stepVisualizationModel({ complete: true, items }, { maxSteps: 4 });

  assert.equal(model.state, "failed");
  assert.equal(model.omitted, 4);
  assert.deepEqual(model.items.map((item) => item.label), ["Step 5", "Step 6", "Step 7", "Step 8"]);
  assert.match(model.summary, /1 failed/);
});
