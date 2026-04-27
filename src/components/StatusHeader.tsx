import React from 'react';
import { Box, Text } from 'ink';
import { InteractionMode } from '../core/AppContext.js';

interface Props {
    provider: string;
    model: string;
    agentState: string;
    interactionMode?: InteractionMode;
    plannerMode?: boolean;
}

export const StatusHeader = ({ provider, model, agentState, interactionMode = 'yolo', plannerMode }: Props) => {
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
                <Box marginRight={2}>
                    <Text color="magenta" bold>{getModeLabel()}</Text>
                </Box>
                <Text color={getStatusColor()}>● {agentState.toUpperCase()}</Text>
            </Box>
        </Box>
    );
};
