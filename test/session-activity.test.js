import assert from "node:assert/strict";
import test from "node:test";

import {
  formatStepDuration,
  formatTokenCount,
  normalizeTokenUsage,
  sessionActivities,
  sessionActivityRuns,
} from "../public/lib/session-activity.js";

test("session activity tracks the current model and tool steps", () => {
  const events = [
    { title: "Prompt sent", timestamp: 1 },
    { detail: { type: "composer_start" }, timestamp: 2 },
    { detail: { type: "composer_complete" }, timestamp: 3 },
    { detail: { type: "turn_start", turn: 1 }, timestamp: 4 },
    { detail: { type: "turn", turn: 1 }, timestamp: 5 },
    { detail: { type: "tool_start", name: "read_file" }, timestamp: 6 },
  ];

  const activity = sessionActivities(events, 10);
  assert.equal(activity.current.label, "Run read file");
  assert.deepEqual(activity.items.map(({ label, status }) => ({ label, status })), [
    { label: "Send prompt", status: "completed" },
    { label: "Prompt refined", status: "completed" },
    { label: "Model turn 1", status: "completed" },
    { label: "Run read file", status: "running" },
  ]);
  assert.deepEqual(activity.items.map((item) => item.durationMs), [1, 1, 1, 4]);
});

test("step durations use concise elapsed-time labels", () => {
  assert.equal(formatStepDuration(0), "<1ms");
  assert.equal(formatStepDuration(850), "850ms");
  assert.equal(formatStepDuration(2450), "2.5s");
  assert.equal(formatStepDuration(72_000), "1m 12s");
});

test("model steps expose token usage and aggregate totals per prompt", () => {
  const activity = sessionActivities([
    { detail: { type: "composer_start" }, timestamp: 1 },
    { detail: { type: "composer_complete", usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } }, timestamp: 2 },
    { detail: { type: "turn_start", turn: 1 }, timestamp: 3 },
    { detail: { type: "turn", turn: 1, serverResponse: { usage: { input_tokens: 250, output_tokens: 50 } } }, timestamp: 4 },
  ]);

  assert.deepEqual(activity.items[0].usage, { inputTokens: 100, outputTokens: 20, totalTokens: 120 });
  assert.deepEqual(activity.items[1].usage, { inputTokens: 250, outputTokens: 50, totalTokens: 300 });
  assert.deepEqual(activity.usage, { inputTokens: 350, outputTokens: 70, totalTokens: 420 });
});

test("streaming responses retain usage reported when the model turn completes", () => {
  const activity = sessionActivities([
    { detail: { type: "turn_start", turn: 1 }, timestamp: 1 },
    { detail: { type: "response_stream" }, timestamp: 2 },
    { detail: { type: "turn", turn: 1, serverResponse: { usage: { input_tokens: 80, output_tokens: 25 } } }, timestamp: 3 },
    { detail: { type: "final" }, timestamp: 4 },
  ]);

  assert.deepEqual(activity.items.find((item) => item.key === "turn:1").usage, {
    inputTokens: 80,
    outputTokens: 25,
    totalTokens: 105,
  });
  assert.deepEqual(activity.usage, { inputTokens: 80, outputTokens: 25, totalTokens: 105 });
});

test("token usage accepts stored camel-case values and formats exact counts", () => {
  assert.deepEqual(normalizeTokenUsage({ inputTokens: 1234, outputTokens: 56 }), {
    inputTokens: 1234,
    outputTokens: 56,
    totalTokens: 1290,
  });
  assert.equal(formatTokenCount(1290), "1,290");
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
  assert.equal(activity.items.find((item) => item.key === "validation").durationMs, 1);
  assert.equal(activity.items.find((item) => item.key === "tool:write_file").durationMs, 1);
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

test("run command steps retain the command and structured response", () => {
  const activity = sessionActivities([
    {
      detail: {
        type: "tool_start",
        name: "run_command",
        args: { command: "npm test", timeout_ms: 120_000 },
      },
      timestamp: 1,
    },
    {
      detail: {
        type: "tool_result",
        name: "run_command",
        output: { ok: true, stdout: "24 tests passed\n", stderr: "" },
      },
      timestamp: 2,
    },
  ]);

  const command = activity.items.find((item) => item.key === "tool:run_command");
  assert.equal(command.command, "npm test");
  assert.deepEqual(command.response, {
    ok: true,
    stdout: "24 tests passed\n",
    stderr: "",
  });
});
