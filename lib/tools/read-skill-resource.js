export function createReadSkillResourceTool({ store }) {
  return {
    name: "read_skill_resource",
    description: "Load SKILL.md instructions or a supporting file from an installed skill folder. Use the skill catalog in your instructions to choose relevant skills.",
    parameters: {
      type: "object",
      properties: {
        skill: { type: "string", description: "Skill folder name." },
        resource: { type: "string", description: "SKILL.md or a path such as references/guide.md." },
      },
      required: ["skill", "resource"],
      additionalProperties: false,
    },
    async execute({ skill, resource }) {
      if (!store?.getSkillResource) throw new Error("Skill storage is unavailable.");
      const entry = store.getSkillCatalog?.().find((item) => item.id === skill);
      if (entry?.valid === false) throw new Error(`Skill metadata is invalid: ${skill}`);
      if (!entry && !store.getSelectedSkills?.().some((item) => item.id === skill)) throw new Error(`Unknown skill: ${skill}`);
      const content = store.getSkillResource(skill, resource);
      if (content.length > 60_000) throw new Error("Skill file is too large to load into model context.");
      return { skill, resource, content };
    },
  };
}
