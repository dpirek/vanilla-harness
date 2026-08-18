import assert from "node:assert/strict";
import test from "node:test";

import { sessionActivities, sessionActivityRuns } from "../public/lib/session-activity.js";

test("session activity tracks the current model and tool steps", () => {
  const events = [
    { title: "Prompt sent", timestamp: 1 },
    { detail: { type: "composer_start" }, timestamp: 2 },
    { detail: { type: "composer_complete" }, timestamp: 3 },
    { detail: { type: "turn_start", turn: 1 }, timestamp: 4 },
    { detail: { type: "turn", turn: 1 }, timestamp: 5 },
    { detail: { type: "tool_start", name: "read_file" }, timestamp: 6 },
  ];

  const activity = sessionActivities(events);
  assert.equal(activity.current.label, "Run read file");
  assert.deepEqual(activity.items.map(({ label, status }) => ({ label, status })), [
    { label: "Send prompt", status: "completed" },
    { label: "Prompt refined", status: "completed" },
    { label: "Model turn 1", status: "completed" },
    { label: "Run read file", status: "running" },
  ]);
});

test("session activity records completion, validation, and response generation", () => {
  const events = [
    { detail: { type: "tool_start", name: "write_file" }, timestamp: 1 },
    { detail: { type: "tool_result", name: "write_file", output: { ok: true } }, timestamp: 2 },
    { detail: { type: "validation", status: "pending", paths: ["app.js"] }, timestamp: 3 },
    { detail: { type: "validation", status: "passed" }, timestamp: 4 },
    { detail: { type: "response_stream" }, timestamp: 5 },
  ];

  const activity = sessionActivities(events);
  assert.equal(activity.current.label, "Write response");
  assert.equal(activity.items.find((item) => item.key === "validation").status, "completed");
  assert.equal(activity.items.find((item) => item.key === "tool:write_file").status, "completed");
  assert.equal(activity.complete, false);
});

test("session activity is complete after the final response", () => {
  const activity = sessionActivities([
    { detail: { type: "response_stream" }, timestamp: 1 },
    { detail: { type: "final" }, timestamp: 2 },
  ]);

  assert.equal(activity.complete, true);
  assert.equal(activity.current, null);
});

test("session activity separates tasks into chronological runs", () => {
  const runs = sessionActivityRuns([
    { title: "Prompt sent", timestamp: 1 },
    { detail: { type: "start" }, timestamp: 1.5 },
    { detail: { type: "tool_start", name: "read_file" }, timestamp: 2 },
    { detail: { type: "tool_result", name: "read_file", output: { ok: true } }, timestamp: 3 },
    { title: "Prompt sent", timestamp: 4 },
    { detail: { type: "start" }, timestamp: 4.5 },
    { detail: { type: "tool_start", name: "run_command" }, timestamp: 5 },
  ]);

  assert.equal(runs.length, 2);
  assert.equal(runs[0].items.at(-1).label, "read file completed");
  assert.equal(runs[1].current.label, "Run run command");
});
