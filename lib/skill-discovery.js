const STOP_WORDS = new Set([
  "about", "after", "also", "and", "are", "build", "can", "code", "create", "for", "from", "have", "help", "into", "make", "need", "that", "the", "their", "this", "use", "using", "when", "with", "work", "your",
]);

function words(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]{3,}/g)?.filter((word) => !STOP_WORDS.has(word)) || []);
}

function relevantSkills(catalog, prompt, limit = 12, minimumScore = 4) {
  const text = String(typeof prompt === "string" ? prompt : prompt?.text || "").toLowerCase();
  const promptWords = words(text);
  return (Array.isArray(catalog) ? catalog : [])
    .filter((skill) => skill?.valid !== false && skill?.id)
    .map((skill) => {
      const id = String(skill.id).toLowerCase();
      const name = String(skill.name || id).toLowerCase();
      const explicit = text.includes(`$${id}`) || text.includes(`/${id}`) || text.includes(`skill:${id}`);
      const named = text.includes(name) || text.includes(id.replaceAll("-", " "));
      const nameHits = [...words(name)].filter((word) => promptWords.has(word)).length;
      const descriptionHits = [...words(skill.description)].filter((word) => promptWords.has(word)).length;
      const score = (explicit ? 100 : 0) + (named ? 20 : 0) + nameHits * 4 + Math.min(descriptionHits, 5);
      return { skill, score, explicit };
    })
    .filter(({ score }) => score >= minimumScore)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, limit);
}

function skillCatalogInstructions(matches, total, canSearch = true) {
  if (!total) return "";
  const lines = matches.map(({ skill }) => `- ${skill.id}: ${String(skill.description || "").replace(/\s+/g, " ").slice(0, 350)}`);
  const selection = lines.length ? `Likely matches:\n${lines.join("\n")}` : "No likely match was found from the current request.";
  return `Available skill guides in /skills (${total} installed). ${selection}\n${canSearch ? "Use search_skills to find other guides by task or topic. " : ""}Use read_skill_resource with resource "SKILL.md" to load a guide when its description fits the task. Read supporting files only as needed. Skill scripts are optional helpers, not commands to run automatically.`;
}

export { relevantSkills, skillCatalogInstructions };
