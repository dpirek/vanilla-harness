import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  resolvePublicPath,
  respondJson,
  serveStatic,
} from "../lib/response.js";

function responseRecorder() {
  return {
    body: Buffer.alloc(0),
    headers: {},
    statusCode: undefined,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body : Buffer.from(body);
    },
  };
}

test("JSON responses include their type and exact byte length", () => {
  const res = responseRecorder();
  respondJson(res, { message: "héllo" }, 201);

  assert.equal(res.statusCode, 201);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(res.headers["content-length"], res.body.length);
  assert.deepEqual(JSON.parse(res.body.toString()), { message: "héllo" });
});

test("public paths resolve inside the configured root", () => {
  const root = path.resolve(os.tmpdir(), "response-public-root");
  assert.equal(resolvePublicPath(root, "/"), path.join(root, "index.html"));
  assert.equal(resolvePublicPath(root, "/assets/app.js"), path.join(root, "assets/app.js"));
  assert.equal(resolvePublicPath(root, "/../server.js"), null);
  assert.equal(resolvePublicPath(root, "/%2e%2e/server.js"), null);
});

test("static responses serve files, redirects, and missing-file errors", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "response-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "index.html"), "<h1>Harness</h1>");

  const page = responseRecorder();
  await serveStatic({ url: "/", headers: {} }, page, root);
  assert.equal(page.statusCode, 200);
  assert.equal(page.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(page.headers["cache-control"], "no-store");
  assert.equal(page.body.toString(), "<h1>Harness</h1>");

  const favicon = responseRecorder();
  await serveStatic({ url: "/favicon.ico", headers: {} }, favicon, root);
  assert.equal(favicon.statusCode, 302);
  assert.equal(favicon.headers.location, "/logo.svg");

  const missing = responseRecorder();
  await serveStatic({ url: "/missing.js", headers: {} }, missing, root);
  assert.equal(missing.statusCode, 404);
  assert.deepEqual(JSON.parse(missing.body.toString()), { ok: false, error: "Not found." });
});
