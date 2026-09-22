import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { CodingAgent } from "../lib/agent.js";
import { createSkillFileStore } from "../lib/skill-files.js";
import { createUiStateStore } from "../lib/ui-state.js";
import { relevantSkills } from "../lib/skill-discovery.js";
import { createReadSkillResourceTool } from "../lib/tools/read-skill-resource.js";
import { createSearchSkillsTool } from "../lib/tools/search-skills.js";

test("catalog discovers metadata without reading guide bodies or resource files", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harness-discovery-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const store = createSkillFileStore(path.join(directory, "skills"));
  store.write("browser-testing", "---\nname: browser-testing\ndescription: Test web browser behavior\n---\n\nSECRET GUIDE BODY", { create: true });
  store.writeResource("browser-testing", "examples/example.md", "Example");
  const [entry] = store.catalog();
  assert.equal(entry.description, "Test web browser behavior");
  assert.equal(Object.hasOwn(entry, "content"), false);
  assert.equal(Object.hasOwn(entry, "resources"), false);
  assert.match(store.read("browser-testing").content, /SECRET GUIDE BODY/);
  assert.deepEqual(store.read("browser-testing").resources, ["examples/example.md"]);
});

test("preset selection appears in metadata catalog and full guide loads separately", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "harness-skill-state-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await fs.mkdir(path.join(directory, "db"));
  const store = createUiStateStore(path.join(directory, "db", "ui-state.sqlite"));
  t.after(() => store.close());
  store.createSkill({ name: "browser-testing", content: "---\nname: browser-testing\ndescription: Test browser behavior\n---\n\nFULL GUIDE" });
  store.setSelectedSkills(["browser-testing"]);
  const [entry] = store.getSkillCatalog();
  assert.equal(entry.selected, true);
  assert.equal(Object.hasOwn(entry, "content"), false);
  assert.match(store.getSkill("browser-testing").content, /FULL GUIDE/);
});

test("agent loads selected and explicitly mentioned guides, and offers relevant metadata", async () => {
  const catalog = [
    { id: "review-code", name: "review-code", description: "Review pull requests for defects", selected: true },
    { id: "browser-testing", name: "browser-testing", description: "Test browser behavior", selected: false },
    { id: "database-migration", name: "database-migration", description: "Migrate database schema", selected: false },
  ];
  const requests = [];
  const reads = [];
  const agent = new CodingAgent({
    client: { async createResponse(body) { requests.push(body); return { id: "r1", output_text: "Done", output: [] }; } },
    model: "test-model", root: "/workspace", tools: [{ name: "read_skill_resource", description: "Read a skill", parameters: { type: "object", properties: {} }, execute: async () => ({}) }],
    skills: catalog,
    loadSkill(id) { reads.push(id); return { ...catalog.find((entry) => entry.id === id), content: `Full instructions for ${id}` }; },
  });
  await agent.run("Use $browser-testing to test the browser checkout flow.");
  assert.deepEqual(reads, ["review-code", "browser-testing"]);
  assert.match(requests[0].instructions, /Full instructions for browser-testing/);
  assert.match(requests[0].instructions, /Full instructions for review-code/);
  assert.doesNotMatch(requests[0].instructions, /Full instructions for database-migration/);
  assert.match(requests[0].instructions, /browser-testing: Test browser behavior/);
});

test("turning off discovery keeps manual and explicit skills without offering catalog search", async () => {
  const catalog = [
    { id: "review-code", name: "review-code", description: "Review code", selected: true },
    { id: "browser-testing", name: "browser-testing", description: "Test browser behavior", selected: false },
  ];
  const requests = [];
  const reads = [];
  const agent = new CodingAgent({
    client: { async createResponse(body) { requests.push(body); return { id: "r1", output_text: "Done", output: [] }; } },
    model: "test-model", root: "/workspace",
    tools: [{ name: "read_skill_resource", description: "Read a skill", parameters: { type: "object", properties: {} }, execute: async () => ({}) }],
    skills: catalog, skillAutoDiscovery: false,
    loadSkill(id) { reads.push(id); return { ...catalog.find((entry) => entry.id === id), content: `Full instructions for ${id}` }; },
  });
  await agent.run("Test browser behavior");
  assert.deepEqual(reads, ["review-code"]);
  assert.doesNotMatch(requests[0].instructions, /Available skill guides/);
  await agent.run("Use $browser-testing to test browser behavior");
  assert.deepEqual(reads, ["review-code", "review-code", "browser-testing"]);
});

test("search and reader discover unselected guides and load only requested content", async () => {
  const catalog = [
    { id: "browser-testing", name: "browser-testing", description: "Test browser behavior", valid: true, selected: false },
    { id: "db-migration", name: "db-migration", description: "Migrate database schema", valid: true, selected: false },
  ];
  const store = {
    getSkillCatalog: () => catalog,
    getSkillResource: (skill, resource) => `${skill}/${resource} content`,
  };
  const search = createSearchSkillsTool({ store });
  const results = await search.execute({ query: "test browser" });
  assert.deepEqual(results.skills.map((skill) => skill.id), ["browser-testing"]);
  const reader = createReadSkillResourceTool({ store });
  assert.equal((await reader.execute({ skill: "browser-testing", resource: "SKILL.md" })).content, "browser-testing/SKILL.md content");
  await assert.rejects(reader.execute({ skill: "missing", resource: "SKILL.md" }), /Unknown skill/);
  assert.deepEqual(relevantSkills(catalog, "unrelated request"), []);
});
