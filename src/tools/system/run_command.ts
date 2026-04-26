import { DynamicTool } from "@langchain/core/tools";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export const runCommandTool = new DynamicTool({
    name: "run_command",
    description: "Executes a shell command on the local system. Use with caution.",
    func: async (input: string) => {
        try {
            const { stdout, stderr } = await execPromise(input);
            if (stderr) {
                return `Error: ${stderr}\nOutput: ${stdout}`;
            }
            return stdout || "Command executed successfully with no output.";
        } catch (error: any) {
            return `Execution failed: ${error.message}`;
        }
    },
});
