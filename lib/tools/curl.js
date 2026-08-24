import { execFileAsync, MAX_CURL_BODY, MAX_OUTPUT, objectSchema } from "./shared.js";

function createCurlTool({ workspace }) {
  return {
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
  };
}

export { createCurlTool };
