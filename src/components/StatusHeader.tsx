import React from 'react';
import { Box, Text } from 'ink';
import { InteractionMode, TokenUsage, ToolStat } from '../core/AppContext.js';

interface Props {
    provider: string;
    model: string;
    agentState: string;
    interactionMode?: InteractionMode;
    plannerMode?: boolean;
    totalUsage?: TokenUsage;
    toolStats?: Record<string, ToolStat>;
}

export const StatusHeader = ({ provider, model, agentState, interactionMode = 'yolo', plannerMode, totalUsage, toolStats }: Props) => {
    const getStatusColor = () => {
        switch (agentState) {
            case 'thinking': return 'yellow';
            case 'acting': return 'cyan';
            case 'error': return 'red';
            case 'awaiting_approval': return 'magenta';
            default: return 'green';
        }
    };

    const getModeLabel = () => {
        let label = '';
        switch (interactionMode) {
            case 'approval': label = '🛡️ APPROVAL'; break;
            case 'auto-accept': label = '⚡ AUTO-ACCEPT'; break;
            case 'yolo': label = '🔥 YOLO'; break;
            default: label = String(interactionMode).toUpperCase();
        }
        return plannerMode ? `${label} + 📋 PLANNER` : label;
    };

    const getTopToolDisplay = () => {
        if (!toolStats || Object.keys(toolStats).length === 0) return null;
        const sorted = Object.entries(toolStats).sort((a, b) => b[1].calls - a[1].calls);
        const [name, stat] = sorted[0];
        const avg = Math.round(stat.totalMs / stat.calls);
        return `🛠 ${name} ×${stat.calls} (${avg}ms avg)`;
    };

    const topToolDisplay = getTopToolDisplay();

    return (
        <Box borderStyle="round" paddingX={1} flexDirection="row" justifyContent="space-between" borderColor="blue">
            <Box>
                <Text bold color="green">forst-tui</Text>
                <Text color="gray"> | </Text>
                <Text color="blue">{provider}</Text>
                <Text color="gray"> (</Text>
                <Text italic color="gray">{model}</Text>
                <Text color="gray">)</Text>
            </Box>
            <Box>
                {topToolDisplay && (
                    <Box marginRight={2}>
                        <Text color="cyan">{topToolDisplay}</Text>
                    </Box>
                )}
                {totalUsage && totalUsage.total > 0 && (
                    <Box marginRight={2}>
                        <Text color="gray">Tokens: </Text>
                        <Text color="white">{totalUsage.input}</Text>
                        <Text color="gray">i / </Text>
                        <Text color="white">{totalUsage.output}</Text>
                        <Text color="gray">o (</Text>
                        <Text color="yellow">{totalUsage.total}</Text>
                        <Text color="gray">)</Text>
                        {totalUsage.cached > 0 && (
                            <>
                                <Text color="gray"> | </Text>
                                <Text color="cyan">💾 {totalUsage.cached} cached</Text>
                            </>
                        )}
                    </Box>
                )}
                <Box marginRight={2}>
                    <Text color="magenta" bold>{getModeLabel()}</Text>
                </Box>
                <Text color={getStatusColor()}>● {agentState.toUpperCase()}</Text>
            </Box>
        </Box>
    );
};
