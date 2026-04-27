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
    onDelete: (id: number) => void;
    onClose: () => void;
}

export const SessionListView = ({ sessions, currentSessionId, onSelect, onDelete, onClose }: Props) => {
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
            if (sessions[selectedIndex]) {
                onSelect(sessions[selectedIndex].id);
            }
        }
        if (input === 'd') {
            if (sessions[selectedIndex]) {
                onDelete(sessions[selectedIndex].id);
                // Adjust selected index if we deleted the last item
                if (selectedIndex >= sessions.length - 1 && selectedIndex > 0) {
                    setSelectedIndex(selectedIndex - 1);
                }
            }
        }
    });

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" paddingX={1} minHeight={10}>
            <Text bold color="magenta">Session Manager (Esc to Close)</Text>
            
            <Box flexDirection="column" marginTop={1} flexGrow={1}>
                {sessions.length === 0 ? (
                    <Text italic color="gray">No sessions available.</Text>
                ) : (
                    sessions.map((session, index) => (
                        <Box key={session.id}>
                            <Text color={index === selectedIndex ? 'cyan' : undefined}>
                                {index === selectedIndex ? '> ' : '  '}
                                {session.id === currentSessionId ? '(Active) ' : ''}
                                [{session.id}] {session.name} 
                                <Text color="gray"> - {session.created_at}</Text>
                            </Text>
                        </Box>
                    ))
                )}
            </Box>

            <Box borderStyle="single" borderTop={true} borderLeft={false} borderRight={false} borderBottom={false} marginTop={1} paddingTop={0}>
                <Text dimColor> Shortcuts: </Text>
                <Text color="cyan" bold>Enter</Text><Text dimColor> Select | </Text>
                <Text color="red" bold>d</Text><Text dimColor> Delete | </Text>
                <Text color="yellow" bold>Esc</Text><Text dimColor> Back</Text>
            </Box>
        </Box>
    );
};
