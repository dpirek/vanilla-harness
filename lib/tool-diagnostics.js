import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createTools } from "./tools/index.js";

function executableAvailable(command) {
  if (!command || command.includes("{{input}}")) return false;
  const candidates = command.includes(path.sep)
    ? [path.resolve(command)]
    : (process.env.PATH || "").split(path.delimiter).map((folder) => path.join(folder, command));
  return candidates.some((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); }
    catch { return false; }
  });
}

async function localHttpServer() {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("harness-system-test");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve) => server.close(resolve)) };
}

export async function runToolSystemTest(store) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "harness-tool-test-"));
  const records = new Map();
  const catalog = [{ id: "system-test-skill", name: "System test skill", description: "Tool probe", valid: true, selected: true }];
  const probeStore = {
    getToolRoot: () => store.getToolRoot(),
    getSkillCatalog: () => catalog,
    getSelectedSkills: () => catalog,
    getSkillResource: () => "# System test skill\n",
    getRuntimeValue: (key) => records.get(key),
    setRuntimeValue: (key, value) => records.set(key, value),
  };
  const results = [];
  let localServer;
  try {
    await fsp.writeFile(path.join(root, "sample.txt"), "harness-system-test\n");
    await fsp.writeFile(path.join(root, "sample.js"), "export const harnessSystemTest = true;\n");
    const manifests = store.getTools();
    for (const manifest of manifests) {
      const result = { name: manifest.name, title: manifest.title, status: "passed", detail: "Loaded and tested." };
      try {
        probeStore.getTools = () => [manifest];
        const [tool] = createTools({ root, store: probeStore, approve: async () => true, authorize: async () => true, settings: () => ({ javascript: { checkAfterEdit: false } }) });
        let output;
        switch (manifest.name) {
          case "list_files": output = await tool.execute({ path: "." }); if (!output.entries.some((item) => item.includes("sample.txt"))) throw new Error("Fixture file was not listed."); break;
          case "read_file": output = await tool.execute({ path: "sample.txt" }); if (!output.content.includes("harness-system-test")) throw new Error("Fixture file was not read."); break;
          case "search_files": output = await tool.execute({ path: ".", query: "harness-system-test" }); if (!output.matches.length) throw new Error("Fixture text was not found."); break;
          case "write_file": output = await tool.execute({ path: "written.txt", content: "before", expected_hash: null }); if (await fsp.readFile(path.join(root, "written.txt"), "utf8") !== "before") throw new Error("Temporary file write failed."); break;
          case "edit_files": output = await tool.execute({ edits: [{ path: "sample.txt", old_text: "harness-system-test", new_text: "harness-system-tested" }] }); if (!(await fsp.readFile(path.join(root, "sample.txt"), "utf8")).includes("harness-system-tested")) throw new Error("Temporary exact edit failed."); break;
          case "change_history": output = await tool.execute({ action: "list", change_id: null }); if (!Array.isArray(output.changes)) throw new Error("Change history was not returned."); break;
          case "javascript": output = await tool.execute({ path: "sample.js", action: "diagnostics", query: null }); if (!output.ok) throw new Error("JavaScript diagnostics failed."); break;
          case "run_command": output = await tool.execute({ command: `"${process.execPath}" -e "process.stdout.write('harness-system-test')"`, timeout_ms: 5000 }); if (!output.ok || !output.stdout.includes("harness-system-test")) throw new Error(output.stderr || "Shell command failed."); break;
          case "curl":
            try { localServer ||= await localHttpServer(); }
            catch (error) {
              if (!["EPERM", "EACCES", "EADDRNOTAVAIL"].includes(error.code)) throw error;
              if (!executableAvailable("curl")) throw new Error("curl is unavailable in PATH.");
              result.status = "limited";
              result.detail = "curl is installed; this environment blocked the loopback HTTP probe.";
              break;
            }
            output = await tool.execute({ url: localServer.url, method: "GET", timeout_ms: 5000 });
            if (!output.ok || output.status !== 200 || !output.stdout.includes("harness-system-test")) throw new Error(output.stderr || "Local HTTP request failed.");
            break;
          case "search_skills": output = await tool.execute({ query: "system test" }); if (!output.skills.some((item) => item.id === "system-test-skill")) throw new Error("Skill catalog search failed."); break;
          case "read_skill_resource": output = await tool.execute({ skill: "system-test-skill", resource: "SKILL.md" }); if (!output.content.includes("System test skill")) throw new Error("Skill resource was not returned."); break;
          case "chrome_devtools":
            result.status = "limited";
            result.detail = executableAvailable("npx") ? "Tool loaded; browser/MCP startup was not run." : "Tool loaded; npx is unavailable in PATH.";
            break;
          case "delegate_to_sub_agent":
            result.status = "limited";
            result.detail = "Tool loaded; no worker was contacted.";
            break;
          default:
            if (manifest.kind === "command") {
              const command = manifest.command.replaceAll("{{toolDir}}", path.join(store.getToolRoot(), manifest.name.replaceAll("_", "-")));
              if (!executableAvailable(command)) throw new Error(`Executable unavailable: ${command}`);
              result.status = "limited";
              result.detail = "Executable found; command was not run without test input.";
            } else if (typeof tool.selfTest === "function") {
              output = await tool.selfTest();
              if (output?.ok === false) throw new Error(output.error || "Tool self-test failed.");
              result.detail = "Module self-test passed.";
            } else {
              result.status = "limited";
              result.detail = "Module loaded; add selfTest() to exercise its behavior.";
            }
        }
        if (result.status === "passed" && output?.ok === false) throw new Error(output.error || "Tool returned a failure.");
      } catch (error) {
        result.status = "failed";
        result.detail = error.message;
      }
      results.push(result);
    }
  } finally {
    if (localServer) await localServer.close();
    await fsp.rm(root, { recursive: true, force: true });
  }
  return {
    results,
    passed: results.filter((item) => item.status === "passed").length,
    failed: results.filter((item) => item.status === "failed").length,
    limited: results.filter((item) => item.status === "limited").length,
  };
}
