import { runCommandTool } from "./system/run_command.js";
import { readFilesTool } from "./system/read_files.js";
import { listFilesTool } from "./system/list_files.js";
import { editFileTool } from "./system/edit_file.js";
import { memoryTool } from "./system/memory.js";
import { skillsTool } from "./system/skills.js";
import { searchToolsTool } from "./system/search_tools.js";
import { searchTool } from "./web/search.js";
import { discordSendMessageTool } from "./integrations/discord.js";

export type ToolDefinition = any; // Loosen type for mixed tool sources

export const registry: any[] = [
    runCommandTool,
    readFilesTool,
    listFilesTool,
    editFileTool,
    memoryTool,
    skillsTool,
    searchToolsTool,
    searchTool,
    discordSendMessageTool
];

export const registerTool = (tool: ToolDefinition) => {
    registry.push(tool);
};

export const getTools = () => {
    return registry;
};
