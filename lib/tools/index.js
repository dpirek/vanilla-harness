import { createCurlTool } from "./curl.js";
import { createListFilesTool } from "./list-files.js";
import { createReadFileTool } from "./read-file.js";
import { createRunCommandTool } from "./run-command.js";
import { createSearchFilesTool } from "./search-files.js";
import { createWorkspaceContext } from "./workspace-context.js";
import { createWriteFileTool } from "./write-file.js";

function createTools({ root, approve = async () => false }) {
  const context = createWorkspaceContext({ root, approve });
  return [
    createListFilesTool(context),
    createReadFileTool(context),
    createWriteFileTool(context),
    createSearchFilesTool(context),
    createCurlTool(context),
    createRunCommandTool(context),
  ];
}

export { createTools };
