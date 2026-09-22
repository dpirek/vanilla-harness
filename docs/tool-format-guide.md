# Tool folder format

Each tool lives in `/tools/<folder>/`. Folder names use lowercase words separated by dashes. The tool's API name in `TOOL.json` uses underscores, so `list_files` lives in `tools/list-files/`. This keeps saved preset permissions and model tool calls stable.

The server scans tool folders when it builds an agent's tool list. Add a folder with a manifest and module to register a new tool; no registry edit is needed. Enable the new tool in the active preset before agents can call it. Global permission rules still apply. Restart the server after editing the source of a previously loaded module so Node reloads it.

## JavaScript module tool

`tools/word-count/TOOL.json`:

```json
{
  "name": "word_count",
  "kind": "module",
  "title": "Word count",
  "description": "Count words in supplied text.",
  "group": "custom",
  "entry": "index.js"
}
```

`tools/word-count/index.js`:

```js
export function createTool(context) {
  return {
    name: "word_count",
    description: "Count words in supplied text.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    async execute({ text }) {
      return { words: text.trim().split(/\s+/).filter(Boolean).length };
    },
  };
}
```

`createTool` receives the same workspace context used by the built-in tools. It must return a tool with a matching `name`, JSON schema `parameters`, and an `execute` function. The module is trusted local code and runs in the server process. The Tools modal can import a complete folder, edit the entry file, and check its syntax without running it. Supporting files may live beside the entry file and be imported with the folder.

Built-in tools use the same structure with `"kind": "builtin"`. Their implementation and manifest are both in `/tools`; their API names remain fixed for compatibility.

## Command tool

```json
{
  "name": "echo_input",
  "kind": "command",
  "title": "Echo input",
  "description": "Pass text to a program.",
  "group": "custom",
  "command": "node",
  "args": ["{{toolDir}}/scripts/echo.js", "{{input}}"],
  "timeoutMs": 10000
}
```

Command tools receive one string input. Each `{{input}}` in `args` is replaced with that string as one argument. `{{toolDir}}` resolves to the tool's folder, so scripts can live under `/tools`. Commands run in the active workspace without a shell, with a 1 MiB output limit. `timeoutMs` may be 100–120000. The modal's **Test manifest** action validates the manifest without executing the command.

Tool names use lowercase letters, numbers, and underscores. Module entries must be relative `.js` files inside the folder. Groups use lowercase letters and hyphens.
