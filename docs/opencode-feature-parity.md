# Feature parity: current implementation

Updated September 20, 2026 after implementing the four requested feature areas in vanilla Node.js, with **no added npm dependencies**. OpenCode reference: local revision `0e3dfd17694471b55f1cc0db578bff8920341e2d`.

| Requested area | Current Harness implementation | Remaining difference from OpenCode |
| --- | --- | --- |
| Precise editing | Unique exact replacements, multi-file preflight, optional SHA-256 stale-file checks, verified writes, diff review | No general patch-language parser, fuzzy replacement, or semantic edit engine. |
| Change recovery | Durable before/after journal, guarded undo/redo, prepared-record recovery, browser and CLI review | Partial parity: only built-in writes/exact edits are tracked; no whole-workspace snapshots for arbitrary shell/MCP changes. |
| Long-session context | Persistent structured text/image/tool replay, budgeted summaries, recent-round retention, archives, cancellation-aware bounded retries | Approximate token counts, model-dependent summary quality, no cross-process execution coordination or automatic archive retention policy. |
| Granular permissions | Ordered wildcard allow/ask/deny rules, canonical file targets, command targets, per-file recovery checks, browser/CLI prompts, locally mediated MCP calls | Global runtime rules plus per-preset tool switches; no per-agent hierarchy or persistent “allow always” grants. These are tool policies, not an OS sandbox. |
| JavaScript / Node.js tooling | Node syntax checks, import hints, automatic post-edit checks, lexical symbols/references, manual UI inspection | Partial parity: no full LSP, completion, type inference, scope-aware references, or semantic rename. Only `.js`, `.mjs`, and `.cjs`. |

The requested areas now have concrete implementations, but full OpenCode equivalence is not asserted. Broader baseline gaps such as desktop distribution, worktrees, editor integrations, native provider breadth, and MCP OAuth remain outside this implementation.

Validation: **171 passing tests** plus an isolated Chrome/local mock-model workflow covering settings, JavaScript inspection, undo/redo, approval before mutation, and structured tool-result replay. See [implementation report](vanilla-harness-implementation-report.md) for details, usage, and limits.

## Historical baseline

The following review describes the **pre-implementation revision** and is retained as a record of the initial findings. Its gap labels and runtime caveats are historical; the table above and implementation report describe the new behavior.

# Original baseline: Vanilla Harness and OpenCode

Comparison date: September 20, 2026. Direction: Vanilla Harness relative to the neighboring OpenCode checkout.

Vanilla Harness implements the essential local agent loop: streaming chat, workspace tools, multiple provider configurations, persistent conversations, a browser UI, a CLI, skills, and MCP. It does **not yet provide equivalent coding workflow depth** to OpenCode. The largest gaps are precise editing and change recovery, long-session context management, granular permissions, language tooling, and developer integrations.

Vanilla Harness has its own strengths: a dependency-free Node application, an embeddable custom element, explicit workflow controls, model evaluation UI, and external A2A worker delegation. These are worth preserving rather than replacing merely to match OpenCode.

## Scope and method

- Vanilla Harness revision: `5cc05e812e9c0b9f9569d4f14c8b2f1161df6c44`.
- OpenCode revision: `0e3dfd17694471b55f1cc0db578bff8920341e2d`.
- Both worktrees were clean before this report was added.
- This is a static source review of the local checkouts, not a comparison against the latest online release. Sources include runtime entry points, tool registries, provider clients, session code, UI modules, and test inventory.
- “Covered” means the same broad user capability exists; it does not assert equal quality, performance, or edge-case behavior. “Partial” means a material implementation or workflow difference. “Gap” means no first-class equivalent was found in the inspected Harness source. Shell commands or third-party MCP servers may bridge gaps, but do not count as built-in parity.
- OpenCode contains both legacy application paths and newer Core/V2 implementations. This report credits source-backed application capabilities without assuming every capability is available in every execution path. Experimental and conditional tools are noted explicitly.
- Neither application nor its test suite was run for this report. Runtime reliability, external service compatibility, and performance are unverified. No percentage score is assigned because feature rows have unequal scope and importance.

Links to OpenCode assume the repositories remain sibling directories.

## Interface and everyday workflows

| Capability | Harness status | Comparison and evidence |
| --- | --- | --- |
| Browser chat and streaming | Covered | Harness provides streamed responses and tool events through [WebSocket handling](lib/ws.js) and [chat UI](public/components/harness-chat.js). OpenCode has a composed [session UI](../opencode/packages/app/src/pages/session/). |
| Interactive CLI and one-shot prompts | Covered | Harness provides terminal commands and `--prompt` in [cli.js](cli.js); OpenCode provides a richer terminal run interface in [CLI commands](../opencode/packages/opencode/src/cli/cmd/). Covered at the interface level, not terminal UX equivalence. |
| Native desktop application | Gap | Harness launches a local server/browser. OpenCode includes an [Electron desktop package](../opencode/packages/desktop/). |
| Workspace browsing and manual editing | Covered | Harness has [workspace APIs](api/workspace.js), a [workspace panel](public/components/workspace-panel.js), and a [file editor](public/components/modals/file-editor-modal.js). OpenCode exposes file and review workflows in its [app](../opencode/packages/app/src/). |
| Persistent conversations | Partial | Harness stores conversations in [SQLite](lib/ui-state.js), but restored model context uses a bounded text transcript rather than full structured replay; see findings below. OpenCode has dedicated [session persistence and execution modules](../opencode/packages/opencode/src/session/). |
| Session sharing and import/export | Gap | No dedicated Harness session interchange or public sharing flow found. OpenCode includes [sharing](../opencode/packages/opencode/src/share/session.ts), [import](../opencode/packages/opencode/src/cli/cmd/import.ts), and [export](../opencode/packages/opencode/src/cli/cmd/export.ts). Copying local SQLite data is not equivalent. |
| Image input | Covered | Harness supports [image attachments](public/lib/image-attachments.js) and provider-specific image conversion in [model clients](lib/openai.js). OpenCode supports file/image content in [ACP content handling](../opencode/packages/opencode/src/acp/content.ts). Actual support depends on the selected model. |
| Integrated interactive terminal | Gap | Harness offers bounded command execution and a manual file editor, not an application PTY. OpenCode has a [terminal panel](../opencode/packages/app/src/pages/session/terminal-panel.tsx) and [PTY implementation](../opencode/packages/core/src/pty/). |
| Localization | Gap | Harness UI text is embedded in English. OpenCode includes [application locale resources](../opencode/packages/app/src/i18n/). |

## Agent runtime and coding tools

| Capability | Harness status | Comparison and evidence |
| --- | --- | --- |
| Model/tool execution loop | Covered | Harness [CodingAgent](lib/agent.js) handles tool calls, results, streaming, and a turn limit. OpenCode registers its coding tools in [ToolRegistry](../opencode/packages/opencode/src/tool/registry.ts). |
| File listing, reading, searching | Covered | Harness registers `list_files`, `read_file`, and `search_files` in its [tool registry](lib/tools/index.js). OpenCode supplies read/glob/grep tools through its registry. Search semantics and scale were not benchmarked. |
| Precise edits and multi-file patches | Partial | Harness [write_file](lib/tools/write-file.js) creates or replaces an entire file. OpenCode supplies [edit](../opencode/packages/opencode/src/tool/edit.ts) and [apply_patch](../opencode/packages/opencode/src/tool/apply_patch.ts); registry selection is model-dependent. Harness can invoke external patch commands through the shell, but lacks a dedicated edit contract. |
| Shell commands, builds, and tests | Covered | Harness [run_command](lib/tools/run-command.js) supports timeouts, bounded output, cancellation, and process-group termination on abort. OpenCode supplies a [shell tool](../opencode/packages/opencode/src/tool/shell.ts). Interactive terminal support is a separate gap above. |
| HTTP retrieval and web search | Partial | Harness supplies [curl](lib/tools/curl.js). OpenCode has [webfetch](../opencode/packages/opencode/src/tool/webfetch.ts) and [websearch](../opencode/packages/opencode/src/tool/websearch.ts). OpenCode search availability depends on provider/flags; arbitrary HTTP access alone is not a search product. |
| Language-server integration | Gap | No Harness LSP subsystem found. OpenCode tools depend on LSP and include an [LSP tool](../opencode/packages/opencode/src/tool/lsp.ts); exposing that explicit tool is experimental in the registry. |
| Change snapshots and undo/redo | Gap | Harness verifies written bytes but has no agent-aware snapshot/revert flow. OpenCode implements [revert/unrevert](../opencode/packages/opencode/src/session/revert.ts) backed by snapshots. |
| Git worktree lifecycle | Gap | Harness selects or creates workspace folders but has no dedicated worktree manager. OpenCode includes [worktree management](../opencode/packages/opencode/src/worktree/index.ts). Git remains manually usable through the Harness shell. |
| Context compaction and pruning | Gap | Harness links response IDs or stores client history without a token-budget compaction policy. OpenCode includes [compaction and pruning](../opencode/packages/opencode/src/session/compaction.ts). |
| Transient model-error retries | Gap | No general provider retry/backoff policy found in Harness [model clients](lib/openai.js). OpenCode implements error classification and retry timing in [session retry](../opencode/packages/opencode/src/session/retry.ts). Harness worker-delivery retries are a separate capability. |
| Task delegation | Partial | Harness [A2A worker manager](lib/sub-agents.js) delegates to externally configured workers via callbacks. OpenCode [task](../opencode/packages/opencode/src/tool/task.ts) delegates to configured agent types within its session system. These have different deployment, context, and lifecycle semantics; Harness CLI wiring is incomplete. |
| Build/plan agent modes | Partial | Harness has presets, prompts, and [workflow toggles](public/components/modals/workflow-modal.js). OpenCode defines build/plan agents with distinct permission policies in [agent configuration](../opencode/packages/opencode/src/agent/agent.ts). Turning off all tools is not an equivalent read-only planning agent. The separate OpenCode plan tool is experimental. |
| Structured questions and task lists | Gap | Harness can ask questions in ordinary text, but has no dedicated question or todo tool. OpenCode provides [question](../opencode/packages/opencode/src/tool/question.ts) and [todo](../opencode/packages/opencode/src/tool/todo.ts); question-tool exposure depends on client/flags. |
| Project instruction discovery | Partial | Harness injects configured prompts and selected skill contents through [CodingAgent](lib/agent.js). No automatic project `AGENTS.md` discovery found. OpenCode discovers instruction files in [session instructions](../opencode/packages/opencode/src/session/instruction.ts). |

## Providers, permissions, and extensibility

| Capability | Harness status | Comparison and evidence |
| --- | --- | --- |
| OpenAI, local models, compatible endpoints | Covered | Harness [client factory](lib/openai.js) selects Responses, Ollama, or Chat Completions implementations. OpenCode supports compatible endpoints and provider configuration in its [provider layer](../opencode/packages/opencode/src/provider/provider.ts). |
| Native provider breadth | Partial | Harness has three protocol paths. OpenCode includes native [provider plugins](../opencode/packages/core/src/plugin/provider/) for Anthropic, Google, Bedrock, Azure, and others. A compatible proxy can broaden Harness access but does not supply equivalent native authentication or provider semantics. |
| Tool permissions | Partial | Harness has tool enable/disable switches and approval callbacks, but browser and CLI runtime callbacks approve enabled capabilities automatically. OpenCode [permission evaluation](../opencode/packages/opencode/src/permission/index.ts) supports pattern-based allow/ask/deny decisions. |
| Skills | Partial | Harness validates and stores selectable skill content through [skills API](api/settings.js) and [skill parser](public/lib/skill-content.js), then injects selected guides. OpenCode includes [skill discovery](../opencode/packages/core/src/skill/discovery.ts) and an agent-callable [skill tool](../opencode/packages/opencode/src/tool/skill.ts). |
| MCP tools over local/remote transports | Covered | Harness [MCP implementation](lib/mcp.js) supports stdio and remote HTTP/SSE handling. OpenCode supplies [MCP clients](../opencode/packages/opencode/src/mcp/index.ts). This is tool connectivity parity, not a claim of full MCP protocol parity. |
| MCP OAuth | Gap | Harness offers configured headers/environment values but no OAuth authorization/callback lifecycle was found. OpenCode wires OAuth providers and callbacks through its MCP implementation. |
| Custom tools and plugin hooks | Partial | Harness exposes a programmatic [tool registry](lib/tools/index.js), plus MCP. OpenCode loads local JS/TS tools and plugins in its [registry](../opencode/packages/opencode/src/tool/registry.ts) and defines a public [plugin API](../opencode/packages/plugin/src/index.ts). Harness lacks an equivalent packaged plugin lifecycle. |
| Server API and generated clients | Partial | Harness has [HTTP routes](api/index.js) and WebSocket messages. OpenCode includes [server API handlers](../opencode/packages/opencode/src/server/routes/instance/httpapi/) and [SDK packages](../opencode/packages/sdk/). Harness has no equivalent generated external client contract. |
| Editor integration / ACP | Gap | No Harness editor extension or ACP server found. OpenCode includes [VS Code integration](../opencode/sdks/vscode/) and an [ACP implementation](../opencode/packages/opencode/src/acp/). A2A and ACP serve different integration roles. |
| GitHub and Slack integrations | Gap | No dedicated Harness integrations found. OpenCode includes a [GitHub Action](../opencode/github/action.yml) and [Slack integration](../opencode/packages/slack/src/index.ts). External account setup is still required. |

## Harness capabilities to preserve

These are concrete strengths of this implementation, not claims that OpenCode cannot be extended to provide them.

| Capability | Evidence and limits |
| --- | --- |
| No third-party npm dependencies | [package.json](package.json) has no dependencies. Runtime still requires a suitable Node version and external services/binaries for selected capabilities. OpenCode is a multi-package Bun application with a substantially larger dependency graph. |
| Embeddable application component | [ai-harness-app](public/components/ai-harness-app.js) mounts in an open Shadow DOM with theme and column controls. The documented integration is same-origin; it is not a standalone cross-origin SDK. |
| Explicit workflow controls | [Workflow modal](public/components/modals/workflow-modal.js) exposes composer, tools, MCP, and validation switches. These are fixed stages, not an arbitrary workflow graph engine. |
| External A2A workers | [Sub-agent manager](lib/sub-agents.js) and [callback API](api/sub-agents.js) provide named workers, callback tokens, timeouts, and delivery retry handling. Browser/server wiring exists; CLI parity needs work. |
| Model evaluation and task ratings | [Models page](public/components/models-page.js), [benchmark module](lib/model-benchmark.js), and [settings endpoints](api/settings.js) support model testing and task ratings. These are not evidence of superior model quality or a standardized comparative benchmark. |
| Microphone recording and transcription | [Workspace API](api/workspace.js) exposes recording/transcription functionality. Provider/service availability is still required. |
| Dedicated browser automation adapter | [Chrome DevTools tool](lib/tools/chrome-devtools.js) is part of the built-in registry. This is a purpose-built integration rather than relying exclusively on generic shell access. |

## Findings that change the interpretation

1. **Approval plumbing is not interactive approval behavior.** [server.js](server.js) passes `approve: async () => true` to local tools and enables MCP auto-approval; [cli.js](cli.js) also supplies affirmative approval callbacks. The README's opening description of “approval-gated” changes can be misread. Actual protection is capability enablement, not per-command or per-path approval. Workspace path checks are not an OS sandbox: the shell runs with the process environment and privileges.

2. **Custom-provider documentation disagrees with runtime.** [README.md](README.md) says custom endpoints must expose `/responses`; [createModelClient](lib/openai.js) selects `ChatCompletionsClient`, which calls `/chat/completions`. Assess compatibility from the implementation until the documentation is corrected.

3. **Saved conversations do not imply lossless model continuation.** [lib/ws.js](lib/ws.js) reconstructs history from at most 20 text messages, capped at 6,000 characters each. [cli.js](cli.js) uses the same limits. This omits older context and structured tool/image history on reconstruction. It is distinct from semantic compaction and full session replay.

4. **A2A delegation is not fully wired into the CLI.** [server.js](server.js) configures and passes `subAgentManager`; [cli.js](cli.js) does not pass it to `createTools`. The [delegation tool](lib/tools/sub-agent.js) returns “No sub-agent workers are configured” without that manager. Shared registry code alone does not establish shared behavior.

5. **Validation is a workflow heuristic.** [CodingAgent](lib/agent.js) tracks writes and requires a successful validating read/command before finishing when validation is enabled. A successful non-read validation tool clears pending paths; that does not prove relevant tests ran or that behavior is correct.

6. **External asynchronous workers do not imply parallel parent tool execution.** [CodingAgent](lib/agent.js) requests `parallel_tool_calls: false` and awaits calls sequentially. Do not advertise concurrent parent delegation based solely on the asynchronous callback transport.

7. **OpenCode's newer Core path has explicit migration gaps.** Its [tool architecture notes](../opencode/packages/core/src/tool/AGENTS.md) identify incomplete canonical registration designs for plugins and MCP. OpenCode's established application integrations should not be conflated with complete V2 parity.

## Suggested implementation order

This ordering is an engineering judgment based on the observed gaps, not a commitment to implement them as part of this report.

| Priority | Work | Concrete completion criterion |
| --- | --- | --- |
| 1 | Correct documentation and CLI worker wiring | README matches custom-provider protocol and approval behavior; configured workers can complete a CLI delegation or the CLI explicitly identifies it as unsupported. |
| 1 | Durable structured conversation history | Restart/reconnect restores messages, tool results, and attachment references without silent text-only truncation; a restart integration test proves continuation. |
| 1 | Precise edits plus review/recovery | Add guarded replacements or patch application, present changed-file diffs, and support restoring a pre-change snapshot while preserving unrelated user changes. |
| 1 | Granular execution policy | Support allow/ask/deny by capability and relevant path/command patterns; browser and CLI both enforce decisions before side effects. |
| 2 | Context budgeting and retry behavior | Compact before exceeding model limits; preserve recent tool relationships; retry classified transient failures without automatically replaying completed mutations. |
| 2 | Project guidance and planning tools | Discover project instructions, load skills on demand, and add structured questions/todos plus a planning policy that keeps useful read tools available. |
| 2 | Language tooling and terminal workflows | Surface diagnostics after edits and provide an interactive PTY with cancellation and lifecycle management. |
| 3 | Broader ecosystem support | Add native providers, MCP OAuth, a documented/versioned API client, then ACP/editor integration according to intended users. |
| 3 | Distribution and collaboration | Consider desktop packaging, share/import/export, worktree UI, and hosted integrations when product requirements justify them. |

## Validation limits and follow-up checks

Existing Harness tests cover provider compatibility, tool permissions, MCP transports/timeouts, worker delegation, stop-run behavior, persistence, and CLI behavior under [test/](test/). Their presence helps identify intended contracts; this review does not claim they pass or cover the gaps above. OpenCode likewise contains tests and app end-to-end coverage, which were not executed.

Before claiming operational parity, exercise the same scenarios in both applications: restart a conversation containing tool results and images; edit and undo multiple files with pre-existing user changes; deny one path while allowing another; exceed a model context window; recover from a transient provider error; cancel a running command; and complete worker delegation from each supported interface. Record outcome and data loss separately from UI availability.
