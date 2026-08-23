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

test("model turns retain expandable input prompt and output text", () => {
  const activity = sessionActivities([
    { detail: { type: "turn_start", turn: 1 }, timestamp: 1 },
    {
      detail: {
        type: "turn",
        turn: 1,
        inputPrompt: {
          instructions: "Inspect the selected workspace.",
          input: [{ role: "user", content: [{ type: "input_text", text: "Create report.md" }] }],
        },
        serverResponse: {
          output_text: "I will create the report.",
          usage: { input_tokens: 42, output_tokens: 9 },
        },
      },
      timestamp: 2,
    },
  ]);

  const turn = activity.items.find((item) => item.key === "turn:1");
  assert.deepEqual(turn.usage, { inputTokens: 42, outputTokens: 9, totalTokens: 51 });
  assert.equal(turn.modelTurn.input, "Instructions\nInspect the selected workspace.\n\nUser\nCreate report.md");
  assert.equal(turn.modelTurn.output, "I will create the report.");
  assert.deepEqual(turn.details.map(({ title, meta }) => ({ title, meta })), [
    { title: "Input prompt", meta: "42 tokens" },
    { title: "Model output", meta: "9 tokens" },
  ]);
});

test("prompt and completed tools expose expandable details", () => {
  const activity = sessionActivities([
    { title: "Prompt sent", detail: "Check the endpoint", timestamp: 1 },
    { detail: { type: "start", prompt: "Check the endpoint" }, timestamp: 2 },
    { detail: { type: "tool_start", name: "curl", args: { url: "https://example.com" } }, timestamp: 3 },
    { detail: { type: "tool_result", name: "curl", output: { ok: true, status: 200 } }, timestamp: 4 },
  ]);

  assert.equal(activity.items.find((item) => item.key === "prompt").details[0].text, "Check the endpoint");
  const curl = activity.items.find((item) => item.key === "tool:curl");
  assert.deepEqual(curl.details.map((section) => section.title), ["Arguments", "Response"]);
  assert.match(curl.details[0].text, /example\.com/);
  assert.match(curl.details[1].text, /200/);
});

test("model turn output preserves tool-call text when no prose is returned", () => {
  const activity = sessionActivities([
    { detail: { type: "turn_start", turn: 2 }, timestamp: 1 },
    {
      detail: {
        type: "turn",
        turn: 2,
        inputPrompt: { input: [{ type: "function_call_output", call_id: "call-1", output: { ok: true } }] },
        serverResponse: {
          output: [{ type: "function_call", name: "write_file", arguments: '{"path":"report.md"}' }],
        },
      },
      timestamp: 2,
    },
  ]);

  const turn = activity.items.find((item) => item.key === "turn:2");
  assert.match(turn.modelTurn.input, /Tool output · call-1/);
  assert.match(turn.modelTurn.output, /Tool call · write_file/);
  assert.match(turn.modelTurn.output, /report\.md/);
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

test("failed runs expose the last command and its response as expandable details", () => {
  const activity = sessionActivities([
    {
      detail: {
        type: "tool_start",
        name: "run_command",
        args: { command: "npm test" },
      },
      timestamp: 1,
    },
    {
      detail: {
        type: "tool_result",
        name: "run_command",
        output: { ok: false, exit_code: 1, stdout: "", stderr: "Tests failed\n" },
      },
      timestamp: 2,
    },
    { title: "Error", detail: "The agent stopped after the command failed.", timestamp: 3 },
  ]);

  const failure = activity.items.find((item) => item.key === "error");
  assert.equal(failure.label, "Run failed");
  assert.equal(failure.command, "npm test");
  assert.deepEqual(failure.response, {
    ok: false,
    exit_code: 1,
    stdout: "",
    stderr: "Tests failed\n",
  });
  assert.deepEqual(failure.details.map((section) => section.title), [
    "Command",
    "Response",
    "Run error",
  ]);
  assert.match(failure.details[1].text, /Tests failed/);
  assert.equal(failure.details[2].text, "The agent stopped after the command failed.");
});

test("failed runs without a completed command still expose useful details", () => {
  const activity = sessionActivities([
    { title: "Error", detail: "Provider request timed out.", timestamp: 1 },
  ]);

  const failure = activity.items.find((item) => item.key === "error");
  assert.deepEqual(failure.details.map(({ title, text }) => ({ title, text })), [
    { title: "Command", text: "No command was recorded for this run." },
    { title: "Response", text: "Provider request timed out." },
  ]);
});
