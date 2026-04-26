import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../core/AppContext.js';

interface Props {
    messages: Message[];
}

export const ChatView = ({ messages }: Props) => {
    const getIcon = (role: string) => {
        switch (role) {
            case 'user': return '👤';
            case 'assistant': return '🤖';
            case 'system': return '⚙️';
            case 'tool': return '🛠️';
            default: return '•';
        }
    };

    return (
        <Box flexDirection="column" paddingX={1}>
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                messages.map((msg, index) => (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                        <Box flexDirection="row">
                            <Text>{getIcon(msg.role)} </Text>
                            <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow'}>
                                {msg.role.toUpperCase()}
                            </Text>
                        </Box>
                        <Box paddingLeft={3}>
                            <Text>{msg.content}</Text>
                        </Box>
                    </Box>
                ))
            )}
        </Box>
    );
};
