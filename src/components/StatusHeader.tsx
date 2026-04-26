import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    provider: string;
    model: string;
    agentState: string;
}

export const StatusHeader = ({ provider, model, agentState }: Props) => {
    const getStatusColor = () => {
        switch (agentState) {
            case 'thinking': return 'yellow';
            case 'acting': return 'cyan';
            case 'error': return 'red';
            default: return 'green';
        }
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
                <Text color={getStatusColor()}>● {agentState.toUpperCase()}</Text>
            </Box>
        </Box>
    );
};
