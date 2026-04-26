import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../core/AppContext.js';

interface Props {
    messages: Message[];
}

export const ChatView = ({ messages }: Props) => {
    return (
        <Box flexDirection="column" paddingX={1}>
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                messages.map((msg, index) => (
                    <Box key={index} flexDirection="column" marginBottom={1}>
                        <Text bold color={msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow'}>
                            {msg.role.toUpperCase()}
                        </Text>
                        <Text>{msg.content}</Text>
                    </Box>
                ))
            )}
        </Box>
    );
};
