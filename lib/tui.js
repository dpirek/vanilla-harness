import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const ANSI = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", cyan: "\x1b[36m",
  promptBackground: "\x1b[48;2;30;30;30m",
  promptAccent: "\x1b[38;2;0;255;24m",
  promptPlaceholder: "\x1b[38;2;38;130;45m",
};

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function color(value, code, enabled = true) {
  return enabled ? `${code}${value}${ANSI.reset}` : String(value);
}

function formatPromptLine(value = "", {
  placeholder = "Ask AI Harness to do anything",
  columns = 80,
  color: useColor = true,
} = {}) {
  const input = String(value);
  const visibleText = input || placeholder;
  const content = `  › ${visibleText}`;
  const padding = " ".repeat(Math.max(2, Number(columns) - content.length));
  const blankLine = " ".repeat(Math.max(content.length + 2, Number(columns)));
  if (!useColor) return `${blankLine}\n${content}${padding}\n${blankLine}`;
  const textColor = input ? ANSI.reset + ANSI.promptBackground : ANSI.promptPlaceholder;
  const blank = `${ANSI.promptBackground}${blankLine}${ANSI.reset}`;
  const prompt = `${ANSI.promptBackground}  ${ANSI.promptAccent}› ${textColor}${visibleText}${padding}${ANSI.reset}`;
  return `\r\x1b[2K${blank}\n\r\x1b[2K${prompt}\n\r\x1b[2K${blank}`;
}

function wrapText(value, width = 80) {
  const lines = [];
  for (const sourceLine of String(value).split("\n")) {
    if (!sourceLine) {
      lines.push("");
      continue;
    }
    let line = sourceLine;
    while (line.length > width) {
      let cut = line.lastIndexOf(" ", width);
      if (cut < Math.floor(width / 2)) cut = width;
      lines.push(line.slice(0, cut));
      line = line.slice(cut).trimStart();
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function parseCommandLine(value) {
  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const char of String(value).trim()) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (quote) {
      if (char === quote) quote = "";
      else current += char;
    } else if (char === "\"" || char === "'") {
      quote = char;
    } else if (/\s/.test(char)) {
      if (current) parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (escaped) current += "\\";
  if (quote) throw new Error("Unclosed quote.");
  if (current) parts.push(current);
  return parts;
}

function formatTable(rows, { headers = [] } = {}) {
  const values = headers.length > 0 ? [headers, ...rows] : rows;
  if (values.length === 0) return "";
  const widths = [];
  for (const row of values) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] || 0, stripAnsi(cell).length);
    });
  }
  const line = (row) => row.map((cell, index) => {
    const padding = " ".repeat(widths[index] - stripAnsi(cell).length);
    return `${cell}${padding}`;
  }).join("  ").trimEnd();
  const output = [];
  if (headers.length > 0) {
    output.push(line(headers), widths.map((width) => "─".repeat(width)).join("  "));
  }
  output.push(...rows.map(line));
  return output.join("\n");
}

async function runEditor(initialValue = "", { editor = process.env.VISUAL || process.env.EDITOR || "vi", suffix = ".txt" } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vanilla-harness-tui-"));
  const file = path.join(directory, `edit${suffix}`);
  await fs.writeFile(file, String(initialValue), "utf8");
  const [command, ...editorArgs] = parseCommandLine(editor);
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(command, [...editorArgs, file], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
    });
    return await fs.readFile(file, "utf8");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

class TerminalUI {
  constructor({ input = process.stdin, output = process.stdout, color: useColor = output.isTTY } = {}) {
    this.input = input;
    this.output = output;
    this.colorEnabled = Boolean(useColor);
    this.readline = createInterface({ input, output, terminal: Boolean(input.isTTY && output.isTTY) });
    this.lines = [];
    this.waiter = null;
    this.readline.on("line", (line) => {
      if (this.waiter) {
        const resolve = this.waiter;
        this.waiter = null;
        resolve(line);
      } else {
        this.lines.push(line);
      }
    });
    this.readline.on("close", () => {
      if (this.waiter) {
        const resolve = this.waiter;
        this.waiter = null;
        resolve(null);
      }
    });
  }

  style(value, name) {
    return color(value, ANSI[name] || "", this.colorEnabled && Boolean(ANSI[name]));
  }

  write(value = "") { this.output.write(String(value)); }
  line(value = "") { this.write(`${value}\n`); }
  heading(value) { this.line(this.style(value, "bold")); }
  info(value) { this.line(this.style(value, "dim")); }
  success(value) { this.line(this.style(value, "green")); }
  error(value) { this.line(this.style(value, "red")); }
  table(rows, options) { this.line(formatTable(rows, options)); }

  async ask(label, { defaultValue = "" } = {}) {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    this.write(`${label}${suffix}: `);
    const answer = this.lines.length > 0
      ? this.lines.shift()
      : await new Promise((resolve) => { this.waiter = resolve; });
    if (answer === null) throw new Error("Terminal input closed.");
    return answer.trim() || defaultValue;
  }

  async prompt({ placeholder = "Ask AI Harness to do anything" } = {}) {
    if (!this.input.isTTY || !this.output.isTTY) {
      return this.ask(this.style("›", "green"));
    }

    let finished = false;
    let redrawPending = false;
    let promptDrawn = false;
    const redraw = () => {
      redrawPending = false;
      if (finished) return;
      const value = this.readline.line || "";
      const cursor = Math.max(0, Number(this.readline.cursor) || 0);
      if (promptDrawn) this.write("\x1b[1A");
      this.write(formatPromptLine(value, {
        placeholder,
        columns: this.output.columns || 80,
        color: this.colorEnabled,
      }));
      this.write(`\x1b[1A\r\x1b[${cursor + 4}C`);
      promptDrawn = true;
    };
    const scheduleRedraw = () => {
      if (redrawPending) return;
      redrawPending = true;
      setImmediate(redraw);
    };

    // A four-column native prompt keeps readline's cursor calculations aligned
    // with the padded custom chevron while redraw supplies the full-width treatment.
    this.readline.setPrompt("    ");
    this.readline.prompt();
    this.input.on("keypress", scheduleRedraw);
    redraw();
    try {
      const answer = this.lines.length > 0
        ? this.lines.shift()
        : await new Promise((resolve) => { this.waiter = resolve; });
      if (answer === null) throw new Error("Terminal input closed.");
      return answer.trim();
    } finally {
      finished = true;
      this.input.off("keypress", scheduleRedraw);
      if (promptDrawn) this.write("\n");
    }
  }

  async confirm(label, defaultValue = false) {
    const answer = (await this.ask(`${label} ${defaultValue ? "[Y/n]" : "[y/N]"}`)).toLowerCase();
    if (!answer) return defaultValue;
    return answer === "y" || answer === "yes";
  }

  async select(label, items) {
    if (!items.length) return null;
    this.heading(label);
    items.forEach((item, index) => this.line(`  ${index + 1}. ${item.label ?? item}`));
    const answer = await this.ask("Select");
    const index = Number(answer) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error("Invalid selection.");
    return items[index].value ?? items[index];
  }

  async edit(initialValue, options) {
    this.readline.pause();
    try { return await runEditor(initialValue, options); }
    finally { this.readline.resume(); }
  }

  close() { this.readline.close(); }
}

export { ANSI, TerminalUI, color, formatPromptLine, formatTable, parseCommandLine, runEditor, stripAnsi, wrapText };
