# Vanilla Harness

Vanilla Harness is a local, browser and cli based generic-agent interface built with Node.js and vanilla JavaScript. It connects language models to a selected workspace and provides chat, file browsing and editing, tool execution, presets, system prompts, skills, MCP servers, and a live event stream.

The application supports:

- OpenAI models through the Responses API
- Local Ollama models
- Custom OpenAI-compatible endpoints
- Workspace-scoped file listing, reading, searching, and writing
- Approval-gated shell commands and file changes
- MCP servers and configurable skills
- Persistent conversations, skills, and settings in SQLite
- Image attachments and optional microphone transcription

## Requirements

- Node.js 22 or newer, including the built-in `node:sqlite` module
- `curl` if the agent's HTTP tool is enabled
- An API key or a running local model server, depending on the provider

The project currently has no third-party npm dependencies.

## Run locally

Clone the repository, enter its directory, and start the server:

```bash
git clone https://github.com/dpirek/vanilla-harness.git
cd vanilla-harness
npm start
```

Open [http://localhost:3000](http://localhost:3000) in a browser.

On the first launch, the Providers dialog opens automatically. Add an OpenAI, Ollama, or custom provider, choose a model, and save it. For Ollama, start Ollama separately before loading its models. Custom providers must expose the OpenAI-compatible endpoints used by the harness, including `/models` and `/responses`.

## Configuration

The application can be configured through the UI or with environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Web server port | `3000` |
| `AI_HARNESS_WORKSPACE` | Workspace root; takes precedence over the browser's saved workspace | Current directory |
| `AI_HARNESS_DATA_DIR` | Directory containing the local `db/` data directory | Current directory |
| `AI_PROVIDER` | Default provider: `openai`, `ollama`, or `custom` | `openai` |
| `AI_MODEL` | Default model override | Provider default |
| `AI_BASE_URL` | Provider base URL override applied to the runtime configuration | Stored value |
| `AI_API_KEY` | Provider API key override applied to the runtime configuration | Stored value |
| `OPENAI_API_KEY` | OpenAI API key fallback | — |
| `OPENAI_MODEL` | Default OpenAI model | `gpt-5.1-codex` |
| `OPENAI_BASE_URL` | Alternate OpenAI API base URL | OpenAI API |
| `OLLAMA_BASE_URL` | Ollama server URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Default Ollama model | `llama3.1` |
| `CUSTOM_AI_BASE_URL` | Custom provider base URL | `http://localhost:8000/v1` |
| `CUSTOM_AI_API_KEY` | Custom provider API key fallback | — |
| `CUSTOM_AI_MODEL` | Default custom-provider model | `custom-model` |

Example:

```bash
AI_HARNESS_WORKSPACE=/path/to/project PORT=4000 npm start
```

The server automatically loads a `.env` file from the project root. When that file is present, its individual provider, tool, skill, prompt, MCP, and workflow settings override the active stored configuration, and the preset bar is hidden in the web UI. See `.env.example` for every supported setting. Existing shell environment variables take precedence over values in `.env`.

## Local data

UI state, conversations, provider settings, presets, prompts, and MCP configuration are stored in:

```text
db/ui-state.sqlite
```

The `db/` directory is ignored by Git. Provider API keys saved through the UI are stored in this local database, so treat it as sensitive data and do not publish or share it.

If `AI_HARNESS_DATA_DIR` is set, the database is created under that directory instead. Microphone recordings are written to a `recordings/` directory inside the selected workspace.

## Project structure

```text
server.js          HTTP, WebSocket, workspace, and provider server
lib/               Agent loop, model clients, tools, MCP, skills, and SQLite state
public/            Vanilla JavaScript UI, components, styles, and browser services
db/                Local runtime state (ignored by Git)
```

## Example how to embed as web component:

```JavaScript
(async () => {
    await import("http://localhost:3000/components/ai-harness-app.js");

    const harness = document.createElement("ai-harness-app");
    harness.theme = "light";
    harness.hideLeftColumn = false;
    harness.hideRightColumn = false;

    Object.assign(harness.style, {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
    });

    document.body.append(harness);

    // Remove later with:
    window.removeInjectedHarness = () => harness.remove();
  })();
```

## Security notes

The agent can read files, write files, make HTTP requests, run commands, and call MCP servers within the selected workspace. Enabled tools and MCP servers are automatically approved, so only enable capabilities and connect servers you trust.

## License

ISC
