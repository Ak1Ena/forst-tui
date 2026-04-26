import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

interface Session {
    id: number;
    name: string;
    created_at: string;
}

interface Props {
    sessions: Session[];
    currentSessionId: number;
    onSelect: (id: number) => void;
    onClose: () => void;
}

export const SessionListView = ({ sessions, currentSessionId, onSelect, onClose }: Props) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    useInput((input, key) => {
        if (key.escape) {
            onClose();
        }
        if (key.upArrow) {
            setSelectedIndex(prev => Math.max(0, prev - 1));
        }
        if (key.downArrow) {
            setSelectedIndex(prev => Math.min(sessions.length - 1, prev + 1));
        }
        if (key.return) {
            onSelect(sessions[selectedIndex].id);
            onClose();
        }
    });

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={1}>
            <Text bold color="magenta">Select Session (Esc to Close)</Text>
            <Box flexDirection="column" marginTop={1}>
                {sessions.map((session, index) => (
                    <Box key={session.id}>
                        <Text color={index === selectedIndex ? 'cyan' : undefined}>
                            {index === selectedIndex ? '> ' : '  '}
                            {session.id === currentSessionId ? '(Current) ' : ''}
                            [{session.id}] {session.name} 
                            <Text color="gray"> - {session.created_at}</Text>
                        </Text>
                    </Box>
                ))}
            </Box>
        </Box>
    );
};
