import { relevantSkills } from "../skill-discovery.js";

export function createSearchSkillsTool({ store }) {
  return {
    name: "search_skills",
    description: "Search installed skill names and descriptions without loading their instructions.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Task or skill keywords to search for." } },
      required: ["query"],
      additionalProperties: false,
    },
    async execute({ query }) {
      const catalog = store?.getSkillCatalog?.() || [];
      return { skills: relevantSkills(catalog, query, 20, 1).map(({ skill }) => ({ id: skill.id, description: skill.description, selected: skill.selected })) };
    },
  };
}
