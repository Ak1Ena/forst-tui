import { Tool } from "@langchain/core/tools";
import { exec } from "child_process";
import { promisify } from "util";

const execPromise = promisify(exec);

export class RunCommandTool extends Tool {
    name = "run_command";
    description = "Executes a shell command (terminal/bash) on the local system. Use for system utilities (ping, curl, etc), package managers (npm, pip), git, or running scripts. Use with caution.";

    async _call(input: string, _runManager?: any, config?: any): Promise<string> {
        try {
            const signal = config?.signal;
            
            // Node.js 16+ supports AbortSignal in child_process.exec
            // We use SIGINT as the killSignal because it's the standard for cancelling CLI commands
            const { stdout, stderr } = await execPromise(input, { 
                signal,
                killSignal: 'SIGINT' 
            });

            if (stderr) {
                return `Error: ${stderr}\nOutput: ${stdout}`;
            }
            return stdout || "Command executed successfully with no output.";
        } catch (error: any) {
            if (error.name === 'AbortError' || error.signal === 'SIGINT' || error.signal === 'SIGTERM') {
                return "Command execution was cancelled.";
            }
            return `Execution failed: ${error?.message || String(error)}`;
        }
    }
}

export const runCommandTool = new RunCommandTool();
