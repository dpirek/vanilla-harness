import { execFileAsync, MAX_OUTPUT, objectSchema } from "./shared.js";

function createRunCommandTool({ approve, workspace }) {
  return {
    name: "run_command",
    validatesWorkspace: true,
    description: "Run a shell command in the workspace. Use for inspection, tests, and builds.",
    parameters: objectSchema({
      command: { type: "string", description: "Shell command to execute." },
      timeout_ms: {
        type: ["integer", "null"],
        description: "Timeout in milliseconds, or null for 120000.",
      },
    }),
    async execute({ command, timeout_ms: timeout }) {
      // The caller controls whether command execution is authorized.
      if (!(await approve(`command: ${command}`))) {
        return { ok: false, error: "User denied command." };
      }
      try {
        const result = await execFileAsync(
          process.env.SHELL || "/bin/sh",
          ["-lc", command],
          {
            cwd: workspace,
            timeout: timeout || 120_000,
            maxBuffer: MAX_OUTPUT * 2,
            env: process.env,
          },
        );
        return {
          ok: true,
          stdout: result.stdout.slice(0, MAX_OUTPUT),
          stderr: result.stderr.slice(0, MAX_OUTPUT),
        };
      } catch (error) {
        return {
          ok: false,
          exit_code: error.code,
          signal: error.signal,
          stdout: String(error.stdout || "").slice(0, MAX_OUTPUT),
          stderr: String(error.stderr || error.message).slice(0, MAX_OUTPUT),
        };
      }
    },
  };
}

export { createRunCommandTool };
