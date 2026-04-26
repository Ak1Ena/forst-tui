import React from 'react';
import { Box, Text } from 'ink';
import { Message } from '../core/AppContext.js';

import { CodeBlock } from './CodeBlock.js';

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

    const renderContent = (content: string) => {
        const parts = content.split(/```(\w+)?\n([\s\S]*?)\n```/g);
        const elements = [];

        for (let i = 0; i < parts.length; i++) {
            if (i % 3 === 0) {
                // Text part
                if (parts[i].trim()) {
                    elements.push(<Text key={i}>{parts[i]}</Text>);
                }
            } else if (i % 3 === 1) {
                // Language part (captured but skipped in this iteration)
                continue;
            } else {
                // Code part
                const language = parts[i - 1];
                const code = parts[i];
                elements.push(<CodeBlock key={i} code={code} language={language} />);
            }
        }

        return elements;
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
                        <Box paddingLeft={3} flexDirection="column">
                            {msg.role === 'tool' ? (
                                <Text color="gray" italic>[{msg.name || 'tool_result'}]</Text>
                            ) : (
                                renderContent(msg.content)
                            )}
                        </Box>
                    </Box>
                ))
            )}
        </Box>
    );
};
