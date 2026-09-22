export function createReadSkillResourceTool({ store }) {
  return {
    name: "read_skill_resource",
    description: "Read a supporting file from an installed skill folder (scripts, references, templates, or examples).",
    parameters: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill folder name." },
        resource: { type: "string", description: "Path relative to the skill folder, for example references/guide.md." },
      },
      required: ["skill", "resource"],
      additionalProperties: false,
    },
    async execute({ skill, resource }) {
      if (!store?.getSkillResource) throw new Error("Skill storage is unavailable.");
      if (!store.getSelectedSkills().some((entry) => entry.id === skill)) throw new Error(`Skill is not selected: ${skill}`);
      return { skill, resource, content: store.getSkillResource(skill, resource) };
    },
  };
}
