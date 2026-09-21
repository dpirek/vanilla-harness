# Implementation report: coding workflow parity

Completed September 20, 2026, against Vanilla Harness base revision `5cc05e812e9c0b9f9569d4f14c8b2f1161df6c44`. OpenCode reference remains the local checkout at `0e3dfd17694471b55f1cc0db578bff8920341e2d`.

The four requested feature areas now have working implementations in vanilla JavaScript and Node.js. No npm dependencies were installed or added; `package.json` is unchanged. This closes several functional gaps, but **does not claim complete OpenCode equivalence**: recovery covers the built-in editing tools, and JavaScript navigation is lexical rather than a full language server.

## 1. Precise editing and change recovery

Added [edit_files and change_history](lib/tools/edit-files.js), backed by [durable change history](lib/change-history.js).

- `edit_files` accepts a batch of 1–50 exact replacements, one per file. Every old-text match must occur exactly once. Missing or ambiguous matches reject the batch before any file is changed.
- `read_file` now returns a SHA-256 hash of the entire file, including when only a line range is returned. `edit_files` and `write_file` accept `expected_hash` to reject a stale version. Passing `null` omits this additional precondition.
- All batch edits are preflighted. Writes use temporary sibling files and rename, preserve existing permission bits, and verify the resulting contents.
- A write-ahead record stores before/after text, paths, modes, timestamp, status, and a change ID in SQLite. Records survive server restart.
- On a failed batch, the implementation attempts to restore only bytes that still match its own write. If recovery cannot safely finish, the prepared record remains available for inspection and recovery.
- Undo/redo checks every affected file and its permissions before restoration. It refuses to overwrite content that differs from the recorded expected state.
- Prepared records allow recovery after a partially completed batch or process interruption. A restored new file is removed on undo and recreated on redo.
- Review includes a unified-style diff preview and before/after hashes. The browser exposes Review, Undo, and Redo under Tools → Workspace change recovery. CLI users can run `/changes`, `/changes inspect <id>`, `/changes undo <id>`, and `/changes redo <id>`.

Example agent call after reading a file:

```json
{
  "edits": [{
    "path": "src/server.js",
    "old_text": "const port = 3000;",
    "new_text": "const port = 4000;",
    "expected_hash": null
  }]
}
```

Recovery limits: this is a journal for built-in writes/exact edits, not a whole-workspace snapshot system. Shell commands, MCP tools, uploads, and manual editor writes are not captured. Regular UTF-8 text files are limited to 2 MB each. Symlink paths and multiply linked files are rejected by the workspace tool boundary. Batch writes are preflighted and recoverable, but are not a filesystem-wide atomic transaction. External processes can still race filesystem operations; there is no OS sandbox or cross-process editing lock. The UI lists the latest 100 records; older records remain in storage and can be addressed by ID.

## 2. Long-session context management

Added [ConversationContext](lib/conversation-context.js) and integrated it into browser and CLI agent creation.

- Model-visible conversation history is persisted independently of the visible chat transcript.
- Replay includes user/assistant text, input images, tool calls, and tool results. New sessions no longer depend on a provider retaining `previous_response_id` state.
- Reopening a conversation restores its structured history. Older conversations without runtime history are seeded from their saved messages and available image data; historical structured tool results cannot be reconstructed if they were never stored in this format.
- When a tool call has no durable result after interruption, replay marks the outcome unknown and instructs the model to inspect before retrying. The harness does not automatically execute that tool again.
- Automatic compaction summarizes older complete rounds while retaining a configurable number of recent rounds verbatim. It keeps tool calls/results together.
- Older rounds are archived in SQLite before successful compaction. Active context keeps the summary and recent rounds; failed or empty summaries leave the source history intact.
- Context budgets reserve output capacity and include instructions, tool schemas, and an allowance for images. The selected reserve is also sent as the model response limit.
- An oversized recent turn or failed compaction produces an actionable error instead of silently trimming it away. Disabling compaction still enforces the configured budget.
- Context estimates and compaction events appear in the event stream. In-process concurrent runs of the same conversation are rejected.
- Clear/reset removes active context; reset also clears its compaction archives. Deleting a saved conversation removes runtime context associated with its saved workspace identity.
- Custom Chat Completions and Ollama adapters now support replaying assistant text and paired tool calls/results.

Added [bounded model retries](lib/model-request.js): HTTP 429, 500, 502, 503, and 504 errors can retry twice with 500 ms/1 s backoff, only before streamed text has been delivered. Cancellation interrupts backoff. Tool execution is outside this retry loop.

Defaults: compaction enabled; 32,000 estimated context tokens; 4,000 reserved output tokens; four recent rounds retained. Change these under Tools → Global runtime settings or edit the shared JSON with CLI `/runtime`.

Context limits: token counts are conservative estimates, not a provider tokenizer. Set the budget to fit the selected model. Summaries are lossy and incur additional model calls; their factual quality depends on the model. Reasoning-only/provider-specific response blocks are not retained as portable replay messages. Archives and change records currently have no automatic disk-retention policy. Separate server/CLI processes do not share an execution lock. Live external-provider behavior and summary quality were not benchmarked.

## 3. Granular permissions

Added [runtime configuration](lib/runtime-settings.js), [permission evaluation](lib/permissions.js), and browser/CLI approval handling.

- Existing per-preset enabled-tool switches still control tool availability.
- Global runtime policy supplies a default action and ordered `{tool, pattern, action}` rules. Actions are `allow`, `ask`, and `deny`; the last matching rule wins.
- `*` is a wildcard matching any text, including separators. Other characters are literal; this is not a shell or regular-expression parser.
- File-tool paths are normalized relative to the workspace before policy matching. Shell rules match the complete command string. HTTP tools match their URL, and worker delegation matches the worker name.
- Batch edits authorize each target before any mutation. Undo/redo additionally checks `write_file` permission for each restored path; inspection checks `read_file`.
- Recursive search and JavaScript inspection check read permissions for candidate files, preventing a denied direct read from being bypassed by these tools.
- MCP tools are executed through local clients in the main application runtime so that the harness can enforce discovered-tool policy before invocation, including for remote servers. MCP discovery/startup still occurs when configured servers load.
- Browser `ask` displays a request-specific dialog with the target and a bounded argument preview, Deny, and Allow once. Decisions are recorded in the event stream. Responses must match the pending request and conversation. Escape, cancellation, disconnect, and a two-minute timeout deny the request.
- Interactive CLI asks for confirmation; non-interactive input denies `ask` requests instead of hanging or implicitly approving.
- Explicit manual recovery/inspection actions in the UI or CLI satisfy an `ask` rule for that human-requested action; `deny` rules still apply.
- Default prompts now describe conditional permission behavior. An agent runtime instruction also corrects older stored prompts that claimed all enabled tools were automatically approved.

Example rules, with default action `allow`:

```json
[
  { "tool": "run_command", "pattern": "*", "action": "ask" },
  { "tool": "write_file", "pattern": "*", "action": "ask" },
  { "tool": "edit_files", "pattern": "*", "action": "ask" },
  { "tool": "read_file", "pattern": ".env*", "action": "deny" },
  { "tool": "read_file", "pattern": "secrets/*", "action": "deny" }
]
```

Permissions intentionally default to `allow` to preserve existing installations until a policy is configured. These rules govern tool calls, not operating-system privileges. An allowed shell command or MCP tool can have broad access; path rules do not constrain what those external processes can do. Existing manual file-management APIs are not converted into an OS security boundary. There is no persistent “allow always” approval grant or per-agent policy hierarchy in this implementation.

## 4. Vanilla JavaScript / Node.js tooling

Added [JavaScript inspection](lib/javascript-tools.js), the `javascript` agent tool, and a browser inspection panel under Tools.

Supported extensions: `.js`, `.mjs`, `.cjs`.

| Action | Behavior |
| --- | --- |
| `diagnostics` | Runs the current Node executable with `--check`, without executing the inspected source. Removes inherited `NODE_OPTIONS`/`NODE_PATH`; uses a 10-second timeout and bounded output. Returns syntax errors and import-resolution hints. |
| `symbols` | Finds lexical declarations following `function`, `class`, `const`, `let`, and `var`; optional name filter; returns file, line, and column. |
| `references` | Finds exact lexical identifier matches across selected files; requires an identifier; returns locations. |

Import hints cover Node builtins, relative file imports, and CommonJS package resolution. Package hints are warnings because ESM export conditions can differ. Checks after `write_file`/`edit_files` are enabled by default and configurable. Diagnostics are returned alongside successful mutation results; a successful write is not mislabeled as failed merely because the new source has a syntax error.

Inspection ignores `node_modules`, `.git`, `db`, `.ai-harness`, and `coverage`; it bounds traversal to 3,000 entries, 500 JavaScript files, 1 MB per inspected file, and 1,000 result records. Tool results flag traversal/result truncation.

Language-tooling limits: this is not LSP, TypeScript, JSX, a full JavaScript parser, or scope/type analysis. Symbol/reference results are candidates, not semantic definitions/references. Comments, quoted strings, and template bodies are excluded; regex literals and advanced syntax can still affect lexical accuracy. There is no completion engine, type inference, automatic import rewrite, or semantic rename. Syntax checks use the installed Node version, so browser-only or newer unsupported syntax may be reported as invalid.

## UI, configuration, and persistence

The Tools dialog now contains global permission rules, context budgeting, compaction controls, automatic JavaScript checks, manual JavaScript inspection, and change recovery. New tool toggles also appear in preset editing. The global controls are shared across presets; the enabled-tool switches remain per-preset. Settings take effect through fresh evaluation at execution/context boundaries.

New HTTP routes in [api/runtime.js](api/runtime.js):

- `GET/PUT /api/runtime-settings`
- `GET /api/changes?workspace=...` and `GET /api/changes?workspace=...&id=...&action=inspect`
- `POST /api/changes` with workspace, change ID, and undo/redo action
- `POST /api/javascript` with workspace, path, action, and optional query

A new `runtime_values` SQLite table stores settings, context, archives, and recovery records. It is additive; existing presets and UI tables remain intact. API request validation rejects malformed settings. New environment toggles are documented in [.env.example](.env.example): `AI_HARNESS_TOOL_EDIT_FILES`, `AI_HARNESS_TOOL_CHANGE_HISTORY`, and `AI_HARNESS_TOOL_JAVASCRIPT`. Legacy configurations that disable all existing file tools also disable the new file capabilities unless explicitly overridden.

The README's custom-provider documentation was corrected to match the actual `/chat/completions` implementation.

## Verification

`npm test`: **171 tests passed**, zero failed. No package installation was needed.

New focused coverage includes:

- ambiguous/stale batch preflight, file hashing, traversal/symlink rejection;
- SQLite reopen, undo/redo, later-user-edit conflicts, prepared crash-record recovery, and per-file recovery permissions;
- ordered rules, canonical paths, recursive read filtering, approval denial, and cancellation;
- request/session-matched WebSocket approvals and stop behavior;
- structured context persistence/replay, compaction, preservation on summary failure, oversized input, and uncertain interrupted tool results;
- custom/Ollama replay compatibility, transient model retries, and no retry after partial streamed text;
- Node syntax/import checks without source execution, lexical symbols/references, and API JSON persistence/recovery.

[The browser verification script](.ui-verification/parity.mjs) ran an isolated server, temporary database/workspace, headless Chrome profile, and local mock Chat Completions provider. It verified settings persistence, recovery review, HTTP undo/redo, JavaScript symbol UI, and a real browser approval-gated edit: `demo.js` stayed at `42` until Allow once, then became `43`; the next provider request contained the structured tool result. No browser runtime exceptions were recorded. The isolated server/browser were stopped afterward.

Screenshots: [tools](.ui-verification/parity-artifacts/tools-settings.png), [runtime settings and inspection](.ui-verification/parity-artifacts/runtime-settings.png), [approval request](.ui-verification/parity-artifacts/permission-request.png).

The browser pass found and drove fixes for settings JSON parsing, document-versus-Shadow-DOM dialog mounting, and duplicate current-prompt history. These checks used a deterministic local model fixture; they do not certify live model/provider quality or broad browser/platform compatibility. `git diff --check` also passed.

See [FEATURE_PARITY.md](FEATURE_PARITY.md) for the current scoped comparison and the original baseline review.
