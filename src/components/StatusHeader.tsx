import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    tasks: { name: string; enabled: boolean }[];
}

export const StatusHeader = ({ tasks }: Props) => {
    return (
        <Box borderStyle="round" paddingX={1} flexDirection="row" justifyContent="space-between">
            <Text bold color="green">forst-tui</Text>
            <Box>
                {tasks.map((task, i) => (
                    <Box key={i} marginLeft={2}>
                        <Text color={task.enabled ? 'green' : 'gray'}>
                            ● {task.name}
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
