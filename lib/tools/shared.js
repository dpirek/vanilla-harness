import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT = 100_000;
const MAX_CURL_BODY = 1_000_000;

// Responses API tools require JSON schemas. This helper keeps each tool
// definition compact while still requiring explicit arguments.
function objectSchema(properties, required = Object.keys(properties)) {
  return { type: "object", properties, required, additionalProperties: false };
}

export { execFileAsync, MAX_CURL_BODY, MAX_OUTPUT, objectSchema };
