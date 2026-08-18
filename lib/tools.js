import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 100_000;
const MAX_CURL_BODY = 1_000_000;

// Responses API tools require JSON schemas. This helper keeps each tool
// definition compact while still requiring explicit arguments.
function objectSchema(properties, required = Object.keys(properties)) {
  return { type: "object", properties, required, additionalProperties: false };
}

function createTools({ root, approve = async () => false }) {
  const workspace = path.resolve(root);

  // Resolve user/model-provided paths against the workspace and reject anything
  // that escapes via ../ or an absolute path.
  function resolvePath(requested = ".") {
    const absolute = path.resolve(workspace, requested);
    const relative = path.relative(workspace, absolute);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path is outside the workspace: ${requested}`);
    }
    return absolute;
  }

  function relativePath(absolute) {
    return path.relative(workspace, absolute) || ".";
  }

  // Each returned object is both an OpenAI function definition and its local
  // implementation. The agent publishes the schema and calls execute().
  return [
    {
      name: "list_files",
      description: "List files and directories in a workspace directory.",
      parameters: objectSchema({
        path: { type: "string", description: "Workspace-relative directory path." },
      }),
      async execute({ path: requested }) {
        // withFileTypes avoids extra stat calls when building dir/file labels.
        const target = resolvePath(requested);
        const entries = await fs.readdir(target, { withFileTypes: true });
        return {
          ok: true,
          entries: entries
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((entry) => `${entry.isDirectory() ? "dir" : "file"}\t${entry.name}`),
        };
      },
    },
    {
      name: "read_file",
      validatesWorkspace: true,
      description: "Read a UTF-8 text file, optionally selecting a line range.",
      parameters: objectSchema({
        path: { type: "string", description: "Workspace-relative file path." },
        start_line: { type: ["integer", "null"], description: "First line, 1-based, or null." },
        end_line: { type: ["integer", "null"], description: "Last line, inclusive, or null." },
      }),
      async execute({ path: requested, start_line: start, end_line: end }) {
        const target = resolvePath(requested);
        const content = await fs.readFile(target, "utf8");
        const lines = content.split("\n");
        // Clamp requested line ranges so out-of-range input stays harmless.
        const from = Math.max(1, start || 1);
        const to = Math.min(lines.length, end || lines.length);
        const selected = lines.slice(from - 1, to).join("\n");
        return {
          ok: true,
          path: relativePath(target),
          start_line: from,
          end_line: to,
          content: selected.slice(0, MAX_OUTPUT),
          truncated: selected.length > MAX_OUTPUT,
        };
      },
    },
    {
      name: "write_file",
      mutatesWorkspace: true,
      description: "Create or replace a UTF-8 text file inside the workspace.",
      parameters: objectSchema({
        path: { type: "string", description: "Workspace-relative file path." },
        content: { type: "string", description: "Complete new file content." },
      }),
      async execute({ path: requested, content }) {
        const target = resolvePath(requested);
        // The caller controls whether workspace mutations are authorized.
        if (!(await approve(`write to ${relativePath(target)}`))) {
          return { ok: false, error: "User denied file write." };
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf8");
        // Verify the persisted bytes before telling the model the mutation
        // succeeded. This catches partial or unexpected writes immediately.
        const persisted = await fs.readFile(target, "utf8");
        if (persisted !== content) {
          return { ok: false, error: `File verification failed: ${relativePath(target)}` };
        }
        return {
          ok: true,
          path: relativePath(target),
          bytes: Buffer.byteLength(content),
          verified: true,
        };
      },
    },
    {
      name: "search_files",
      description: "Search text files recursively using a JavaScript regular expression.",
      parameters: objectSchema({
        query: { type: "string", description: "JavaScript regular expression." },
        path: { type: "string", description: "Workspace-relative directory or file." },
      }),
      async execute({ query, path: requested }) {
        const pattern = new RegExp(query, "i");
        const start = resolvePath(requested);
        const matches = [];
        const ignored = new Set([".git", "node_modules", ".ai-harness", "db"]);

        // Recursive search is implemented directly to avoid shelling out to grep
        // or depending on ripgrep. Size and count limits keep results bounded.
        async function visit(target) {
          if (matches.length >= 200) return;
          const stat = await fs.stat(target);
          if (stat.isDirectory()) {
            for (const entry of await fs.readdir(target, { withFileTypes: true })) {
              if (ignored.has(entry.name)) continue;
              await visit(path.join(target, entry.name));
            }
            return;
          }
          if (stat.size > 1_000_000) return;
          let content;
          try {
            content = await fs.readFile(target, "utf8");
          } catch {
            return;
          }
          if (content.includes("\0")) return;
          content.split("\n").forEach((line, index) => {
            if (matches.length < 200 && pattern.test(line)) {
              matches.push(`${relativePath(target)}:${index + 1}:${line.slice(0, 500)}`);
            }
            pattern.lastIndex = 0;
          });
        }

        await visit(start);
        return { ok: true, matches, truncated: matches.length >= 200 };
      },
    },
    {
      name: "curl",
      description: "Fetch an HTTP or HTTPS URL with curl for API and web inspection.",
      parameters: objectSchema({
        url: { type: "string", description: "HTTP or HTTPS URL to request." },
        method: {
          type: ["string", "null"],
          description: "HTTP method, or null for GET.",
        },
        headers: {
          type: ["array", "null"],
          description: "Optional header lines such as 'Authorization: Bearer token'.",
          items: { type: "string" },
        },
        body: {
          type: ["string", "null"],
          description: "Optional request body. When provided, curl sends it as data.",
        },
        timeout_ms: {
          type: ["integer", "null"],
          description: "Timeout in milliseconds, or null for 30000.",
        },
      }),
      async execute({ url, method, headers, body, timeout_ms: timeout }) {
        if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
          throw new Error("curl only allows http:// and https:// URLs.");
        }
        if (body && Buffer.byteLength(body) > MAX_CURL_BODY) {
          throw new Error(`curl request body exceeds ${MAX_CURL_BODY} bytes.`);
        }

        const requestMethod = typeof method === "string" && method.trim()
          ? method.trim().toUpperCase()
          : "GET";
        if (!/^[A-Z][A-Z0-9_-]{0,30}$/.test(requestMethod)) {
          throw new Error(`Invalid HTTP method: ${method}`);
        }

        const args = [
          "--silent",
          "--show-error",
          "--location",
          "--max-time",
          String(Math.max(1, Math.ceil((timeout || 30_000) / 1000))),
          "--request",
          requestMethod,
        ];

        for (const header of Array.isArray(headers) ? headers.slice(0, 50) : []) {
          if (typeof header !== "string" || /[\r\n]/.test(header)) {
            throw new Error("curl headers must be single-line strings.");
          }
          args.push("--header", header);
        }
        if (body !== undefined && body !== null) {
          args.push("--data-binary", body);
        }
        args.push("--write-out", "\n__HTTP_STATUS__:%{http_code}", url);

        try {
          const result = await execFileAsync("curl", args, {
            cwd: workspace,
            timeout: timeout || 30_000,
            maxBuffer: MAX_OUTPUT * 2,
            env: process.env,
          });
          const stdout = result.stdout.slice(0, MAX_OUTPUT);
          const statusMatch = stdout.match(/\n__HTTP_STATUS__:(\d{3})$/);
          return {
            ok: true,
            status: statusMatch ? Number(statusMatch[1]) : null,
            stdout: statusMatch ? stdout.slice(0, statusMatch.index) : stdout,
            stderr: result.stderr.slice(0, MAX_OUTPUT),
            truncated: result.stdout.length > MAX_OUTPUT,
          };
        } catch (error) {
          return {
            ok: false,
            exit_code: error.code,
            signal: error.signal,
            stdout: String(error.stdout || "").slice(0, MAX_OUTPUT),
            stderr: String(error.stderr || error.message).slice(0, MAX_OUTPUT),
          };
        }
      },
    },
    {
      name: "run_command",
      validatesWorkspace: true,
      description: "Run a shell command in the workspace. Use for inspection, tests, and builds.",
      parameters: objectSchema({
        command: { type: "string", description: "Shell command to execute." },
        timeout_ms: {
          type: ["integer", "null"],
          description: "Timeout in milliseconds, or null for 120000.",
        },
      }),
      async execute({ command, timeout_ms: timeout }) {
        // The caller controls whether command execution is authorized.
        if (!(await approve(`command: ${command}`))) {
          return { ok: false, error: "User denied command." };
        }
        try {
          const result = await execFileAsync(
            process.env.SHELL || "/bin/sh",
            ["-lc", command],
            {
              cwd: workspace,
              timeout: timeout || 120_000,
              maxBuffer: MAX_OUTPUT * 2,
              env: process.env,
            },
          );
          return {
            ok: true,
            stdout: result.stdout.slice(0, MAX_OUTPUT),
            stderr: result.stderr.slice(0, MAX_OUTPUT),
          };
        } catch (error) {
          return {
            ok: false,
            exit_code: error.code,
            signal: error.signal,
            stdout: String(error.stdout || "").slice(0, MAX_OUTPUT),
            stderr: String(error.stderr || error.message).slice(0, MAX_OUTPUT),
          };
        }
      },
    },
  ];
}

export { createTools };
