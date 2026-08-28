import fs from "node:fs/promises";
import path from "node:path";

const CONTENT_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".webp": "image/webp",
};

export function contentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

export function respond(res, statusCode, body = "", { headers = {}, type } = {}) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(statusCode, {
    ...(type ? { "content-type": type } : {}),
    "content-length": payload.length,
    ...headers,
  });
  res.end(payload);
}

export function respondJson(res, data, statusCode = 200) {
  respond(res, statusCode, JSON.stringify(data), {
    type: "application/json; charset=utf-8",
  });
}

export function respondHtml(res, data, statusCode = 200) {
  respond(res, statusCode, data, { type: "text/html; charset=utf-8" });
}

export function redirect(res, location, statusCode = 302) {
  respond(res, statusCode, "", { headers: { location } });
}

export function resolvePublicPath(publicDir, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath).replaceAll("\\", "/");
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const root = path.resolve(publicDir);
  const target = decoded === "/" ? "/index.html" : decoded;
  const absolute = path.resolve(root, `.${target}`);
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return absolute;
}

export async function serveStatic(req, res, publicDir) {
  let requestUrl;
  try {
    requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch {
    respondJson(res, { ok: false, error: "Invalid request URL." }, 400);
    return;
  }

  if (requestUrl.pathname === "/favicon.ico") {
    redirect(res, "/logo.svg");
    return;
  }

  const filePath = resolvePublicPath(publicDir, requestUrl.pathname);
  if (!filePath) {
    respondJson(res, { ok: false, error: "Path is outside public directory." }, 403);
    return;
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) {
      respondJson(res, { ok: false, error: "Not found." }, 404);
      return;
    }
    respond(res, 200, await fs.readFile(filePath), {
      type: contentType(filePath),
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") {
      respondJson(res, { ok: false, error: "Not found." }, 404);
      return;
    }
    respondJson(res, { ok: false, error: error.message }, 500);
  }
}
