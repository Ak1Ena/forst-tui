import React from 'react';
import { Box, Text } from 'ink';
import { AnimatedSpinner } from './AnimatedSpinner.js';

interface Props {
    activeTools: string[];
    agentState: string;
}

export const ToolStatus = ({ activeTools, agentState }: Props) => {
    if (agentState === 'idle' && activeTools.length === 0) return null;

    return (
        <Box paddingX={1} flexDirection="row">
            <AnimatedSpinner />
            <Text color="yellow" bold>[{agentState.toUpperCase()}] </Text>
            {activeTools.length > 0 && (
                <Text color="gray">
                    Running: {activeTools.join(', ')}...
                </Text>
            )}
        </Box>
    );
};
