---
name: chrome-devtools-tool
description: Open a web page with Chrome DevTools, wait for usable page content, capture a screenshot, and verify that the image was saved in the workspace.
---

# Chrome DevTools Page Screenshot Workflow

Use this workflow when a task asks you to open an HTTP(S) page in a browser, wait for it to load, and save a screenshot in the workspace.

## Tools

- `functions.chrome_devtools`: navigate, wait, inspect, and capture the browser page.
- `functions.list_files`: verify that the screenshot exists in the workspace.

## Successful workflow

### 1. Navigate to the requested URL

Call `functions.chrome_devtools` with `action: "navigate"`:

```json
{
  "action": "navigate",
  "url": "https://www.cnn.com",
  "browser_command": null,
  "command_arguments": null,
  "javascript": null,
  "path": null,
  "full_page": null,
  "format": null,
  "timeout_ms": 30000
}
```

A navigation timeout does not always mean the page failed to open. Check the returned page list, title, and final URL. In the demonstrated run, navigation reported a timeout while also showing that CNN had loaded and redirected to `https://edition.cnn.com/` with the title `Breaking News, Latest News and Videos | CNN`.

### 2. Wait for page content when useful

Use the allowlisted Chrome DevTools `wait_for` browser command with text expected on the loaded page:

```json
{
  "action": "browser_command",
  "browser_command": "wait_for",
  "command_arguments": {
    "text": ["Breaking News", "Latest News"],
    "timeout": 30000
  },
  "url": null,
  "javascript": null,
  "path": null,
  "full_page": null,
  "format": null,
  "timeout_ms": 30000
}
```

If this wait times out, reassess the browser state rather than assuming navigation failed. Dynamic sites may change visible text, redirect, continuously load resources, or render content differently by region.

### 3. Capture a JPEG screenshot directly into the workspace

Use the dedicated screenshot action, provide a workspace-relative path, and select JPEG:

```json
{
  "action": "screenshot",
  "url": null,
  "browser_command": null,
  "command_arguments": null,
  "javascript": null,
  "path": "cnn-homepage.jpeg",
  "full_page": false,
  "format": "jpeg",
  "timeout_ms": 30000
}
```

The successful result reported:

- `ok: true`
- `path: "cnn-homepage.jpeg"`
- a nonzero byte count
- `format: "jpeg"`
- `Took a screenshot of the current page's viewport.`

For reliability, start with a viewport screenshot (`full_page: false`). Use a descriptive workspace-relative filename and do not write outside the workspace.

### 4. Verify the saved file

After the screenshot mutation, call `functions.list_files` on the workspace root:

```json
{
  "path": ""
}
```

Confirm that the expected file appears, for example:

```text
file    cnn-homepage.jpeg
```

Do not report completion until this verification succeeds.

## Recommended sequencing

1. `functions.chrome_devtools` — `navigate`
2. Inspect the navigation result, including any final URL or title despite a timeout.
3. `functions.chrome_devtools` — `browser_command: "wait_for"` when there is a dependable content marker.
4. `functions.chrome_devtools` — `action: "screenshot"`, `format: "jpeg"`, workspace-relative `path`.
5. `functions.list_files` — verify the screenshot exists.
6. Report the exact workspace-relative filename.

## Unsuccessful approaches and steps to avoid

### Avoid relying only on the navigation success flag

The CNN navigation exceeded the 30-second timeout, but the returned browser state showed that the page had loaded and redirected. Do not immediately retry indefinitely or declare failure without inspecting the returned title, URL, and selected page.

### Avoid treating a text wait timeout as proof that the page is unavailable

Waiting for `Breaking News` or `Latest News` timed out. Exact text can be unreliable on dynamic, localized, or frequently updated pages. Use it as a readiness hint, not as the sole indication of successful navigation.

### Avoid PNG for this workflow when the tool falls back to a temporary path

Multiple PNG attempts produced an unsuccessful tool result and saved only to temporary paths outside the workspace, such as a Chrome DevTools MCP temp directory. The unsuccessful variants included:

- `action: "screenshot"`, `path: "cnn-homepage.png"`, `full_page: true`, `format: "png"`
- `action: "screenshot"`, `path: "cnn-homepage.png"`, `full_page: false`, `format: "png"`
- `browser_command: "take_screenshot"` with `filePath` or `path` in `command_arguments`
- retrying under `screenshots/cnn-homepage.png`
- passing an absolute workspace path to `take_screenshot`

These calls reported that an image was captured but placed it in an external temporary directory instead of the requested workspace path. Do not claim that such a screenshot was saved successfully.

### Prefer the dedicated screenshot action over `take_screenshot`

For this demonstrated environment, the reliable call was the top-level `action: "screenshot"` with `format: "jpeg"`. Attempts to invoke `browser_command: "take_screenshot"` did not honor the requested destination.

### Do not skip post-write validation

A screenshot response can mention a generated image while failing to place it in the workspace. Always use `functions.list_files` after capture and verify the exact filename before reporting success.