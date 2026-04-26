import { runCommandTool } from "./system/run_command.js";
import { readFilesTool } from "./system/read_files.js";
import { searchTool } from "./web/search.js";
import { discordSendMessageTool } from "./integrations/discord.js";

export type ToolDefinition = any; // Loosen type for mixed tool sources

export const registry: any[] = [
    runCommandTool,
    readFilesTool,
    searchTool,
    discordSendMessageTool
];

export const registerTool = (tool: ToolDefinition) => {
    registry.push(tool);
};

export const getTools = () => {
    return registry;
};
