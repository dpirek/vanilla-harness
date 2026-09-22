---
name: chrome-devtools-login
description: Log into a website and capture a screenshot of the authenticated page using Chrome DevTools. Use when a task requires form-based login followed by a screenshot, and the chrome_devtools MCP wrapper actions are flaky or broken.
---

# Chrome DevTools: Login + Screenshot (pitfall-avoidance playbook)

This skill captures lessons learned from a real login-and-screenshot run against
`https://www.krestanskaseznamka.cz`. It documents what worked, what failed, and why.

## When to use

- You need to navigate to a site, submit a login form, wait for a redirect, and save a screenshot.
- The `chrome_devtools` tool is available, but its high-level `action` wrapper fails with
  `Input validation error: ... Required at pageId` (very common).

## Tool behavior discovered (chrome_devtools MCP)

The `chrome_devtools` tool wraps the `chrome-devtools-mcp` server. Its high-level `action`
values and its `browser_command` values behave differently.

### Broken: high-level wrapper actions

| `action` | Result |
|---|---|
| `navigate` | Fails: `Required at pageId` |
| `snapshot` | Fails: `Required at pageId` |
| `screenshot` | Fails: `Required at pageId` — and ignores `command_arguments` |

These actions do NOT forward a `pageId`, even when you pass one inside `command_arguments`.

### Broken: `browser_command: "take_screenshot"`

`take_screenshot` is special-cased by the wrapper and gets routed to the broken
`screenshot` action, so it also fails with `Required at pageId` regardless of
`command_arguments`.

### Working: explicit `browser_command` + `command_arguments` with `pageId`

The following DO work when you pass `pageId` inside `command_arguments`:

- `list_pages` (no args) — shows pages as `1: <title> (<url>) [selected]`. The leading
  number is the `pageId` you must reuse (it is a number in practice).
- `browser_command: navigate_page` with `{"url": "...", "pageId": 1}`
- `browser_command: take_snapshot` with `{"pageId": 1}` — great for reading the DOM/forms.
- `browser_command: fill` with `{"uid": "<uid>", "value": "...", "pageId": 1}`
  (`uid` comes from the latest snapshot, e.g. `2_12`).
- `browser_command: click` with `{"uid": "<uid>", "pageId": 1}`

### Pitfall: `wait_for` text must be an array

`browser_command: wait_for` rejects a string `text` with:
`Expected array, received string at text`.
Pass `text` as an array, e.g. `{"text": ["mike27"], "pageId": 1}`.

## Why the MCP screenshot path fails (and the fix)

- The `chrome-devtools-mcp` process launches its own Chrome with
  `--remote-debugging-pipe` (Puppeteer), NOT an HTTP debugging port.
  You cannot reach that browser over `http://127.0.0.1:9222`.
- Because the wrapper's screenshot action never supplies `pageId`, the simplest reliable
  path is to launch your OWN isolated headless Chrome and drive it directly over the
  Chrome DevTools Protocol (CDP) WebSocket.

## The login-form gotcha (critical)

- Filling inputs with a native value setter + `input`/`change` events is correct and
  framework-friendly (works for React/Vue).
- Submitting via `form.requestSubmit()` **failed silently** — the server kept us on
  `/user/login`. This site has a JavaScript login handler bound to the button.
- Submitting via the actual button `.click()` **worked** and produced the redirect.

Rule: **click the submit button** (`button` whose text is the login label), do not call
`requestSubmit()` / `form.submit()`.

## Reliable end-to-end recipe (raw CDP)

1. Confirm Chrome exists:
   `ls "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`
2. Launch an isolated headless Chrome with a debugging port (pick an unused port like
   9333–9340; the MCP may already be using another port):
   ```sh
   PROFILE="$(mktemp -d /tmp/chrome-cdp-profile.XXXXXX)"
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
     --headless=new --no-sandbox --disable-gpu --hide-scrollbars --mute-audio \
     --user-data-dir="$PROFILE" --remote-debugging-port=9333 about:blank \
     >/tmp/chrome-cdp.log 2>&1 &
   ```
3. Use a Node.js script that:
   - waits for `http://127.0.0.1:<port>/json/version`,
   - fetches `/json`, finds the `page` target, connects to its `webSocketDebuggerUrl`,
   - `Page.enable`, `Runtime.enable`, `Emulation.setDeviceMetricsOverride`,
   - `Page.navigate` to the login URL,
   - fills username/password via native value setter,
   - **clicks the submit button** via `btn.click()`,
   - polls `location.href` (wrap in try/catch — mid-navigation the document body can be
     `null` and throw `TypeError: Cannot read properties of null (reading 'innerText')`),
   - waits for the URL to leave `/login`,
   - waits ~3s, scrolls to top,
   - `Page.getLayoutMetrics` then `Page.captureScreenshot` with a `clip` (cap height at a
     sane max, e.g. 8000px) to save a full-page PNG.
4. Kill only the Chrome PID you started and remove the temp profile.

A ready-to-use implementation of this recipe was validated and produced
`screenshots/krestanskaseznamka-login.png`.

## Template script (working)

Save as `capture-login.mjs` and run `node capture-login.mjs <output.png>`.

```js
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335;
const CDP = `http://127.0.0.1:${PORT}`;
const OUTPUT = process.argv[2] || 'screenshots/login.png';
const LOGIN_URL = process.env.LOGIN_URL || 'https://www.example.com/user/login';
const USERNAME = process.env.USERNAME || '<USERNAME>';
const PASSWORD = process.env.PASSWORD || '<PASSWORD>';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = fs.mkdtempSync('/tmp/chrome-cdp-profile.');
const chrome = spawn(CHROME, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--mute-audio',
  `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank',
], { stdio: 'ignore' });

async function waitForCdp() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`${CDP}/json/version`); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint unavailable');
}

async function connect() {
  await waitForCdp();
  const targets = await (await fetch(`${CDP}/json`)).json();
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('No page target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (!m.id || !pending.has(m.id)) return;
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { ws, send };
}

async function evalJs(send, expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}

async function main() {
  const { ws, send } = await connect();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1800, deviceScaleFactor: 1, mobile: false });

  await send('Page.navigate', { url: LOGIN_URL });
  await sleep(4500);

  await evalJs(send, `(() => {
    const setVal = (el, v) => {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const u = document.querySelector('input[name="username"]');
    const p = document.querySelector('input[name="password"]');
    if (!u || !p) throw new Error('missing login fields');
    setVal(u, ${JSON.stringify(USERNAME)});
    setVal(p, ${JSON.stringify(PASSWORD)});
  })()`);

  // CRITICAL: click the submit button (requestSubmit() failed on this site).
  await evalJs(send, `(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.innerText.trim() === 'Přihlásit');
    if (!btn) throw new Error('no submit button');
    btn.click();
  })()`);

  let finalUrl = LOGIN_URL;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const href = await evalJs(send, 'location.href');
      if (typeof href === 'string') finalUrl = href;
      if (!finalUrl.includes('/user/login')) break;
    } catch { /* mid-navigation; keep waiting */ }
  }
  console.log('FINAL_URL:', finalUrl);

  await sleep(3000);
  await evalJs(send, 'window.scrollTo(0, 0)').catch(() => {});
  await sleep(500);

  const metrics = await send('Page.getLayoutMetrics');
  const size = metrics.cssContentSize || metrics.contentSize || { width: 1440, height: 1800 };
  const width = Math.ceil(size.width);
  const height = Math.min(Math.ceil(size.height), 8000);

  const shot = await send('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });

  fs.mkdirSync('screenshots', { recursive: true });
  fs.writeFileSync(OUTPUT, Buffer.from(shot.data, 'base64'));
  console.log('SAVED:', OUTPUT);
  ws.close();
}

main()
  .catch((e) => { console.error('ERROR:', e.message || e); process.exitCode = 1; })
  .finally(async () => {
    try { chrome.kill('SIGKILL'); } catch {}
    await sleep(500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  });
```

Adjust the button-finder selector to the actual login button label on the target site
(here it is `Přihlásit`).

## Verification checklist

- Confirm the redirect URL (must leave `/login`), e.g. `/user/discover`.
- `file <output>.png` should report `PNG image data, <w> x <h>, 8-bit/color RGB`.
- A non-trivial file size (hundreds of KB) indicates real rendered content, not a blank page.

## Do-not-repeat list

- Do not rely on the `chrome_devtools` `navigate` / `snapshot` / `screenshot` actions.
- Do not rely on `browser_command: take_screenshot`.
- Do not try to attach to the MCP's Chrome via HTTP CDP — it uses a debug pipe.
- Do not submit login forms with `requestSubmit()`/`form.submit()`; click the button.
- Do not assume `document.body` exists during navigation polling; wrap reads in try/catch.
- Do not kill unrelated Chrome sessions; track and kill only the PID you spawned.
