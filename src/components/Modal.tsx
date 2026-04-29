import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
}

export const Modal = ({ title, children, onClose }: Props) => {
    return (
        <Box 
            position="absolute" 
            flexDirection="column" 
            borderStyle="double" 
            borderColor="yellow" 
            padding={1}
            backgroundColor="black"
            width={60}
            marginLeft={10}
            marginTop={5}
        >
            <Box flexDirection="row" justifyContent="space-between" marginBottom={1}>
                <Text bold color="yellow">🔹 {title}</Text>
                <Text color="gray" italic>Press ESC to close</Text>
            </Box>
            <Box flexDirection="column">
                {children}
            </Box>
            <Box marginTop={1} alignItems="center">
                <Text color="gray">──────────────────────────────</Text>
            </Box>
        </Box>
    );
};
