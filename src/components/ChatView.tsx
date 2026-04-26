import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import { Message } from '../core/AppContext.js';
import { CodeBlock } from './CodeBlock.js';

interface Props {
    messages: Message[];
    height?: number;
}

export const ChatView = ({ messages, height = 20 }: Props) => {
    const [scrollOffset, setScrollOffset] = useState(0);

    // Reset scroll to bottom when new messages arrive
    React.useEffect(() => {
        setScrollOffset(0);
    }, [messages.length]);

    useInput((input, key) => {
        if (key.upArrow) {
            setScrollOffset(prev => Math.min(prev + 1, Math.max(0, messages.length - 5)));
        }
        if (key.downArrow) {
            setScrollOffset(prev => Math.max(0, prev - 1));
        }
    });

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
                if (parts[i].trim()) {
                    elements.push(<Text key={i}>{parts[i]}</Text>);
                }
            } else if (i % 3 === 1) {
                continue;
            } else {
                const language = parts[i - 1];
                const code = parts[i];
                elements.push(<CodeBlock key={i} code={code} language={language} />);
            }
        }

        return elements;
    };

    // Calculate visible messages (simplified viewport)
    // We show the last N messages minus the scroll offset
    const visibleMessages = useMemo(() => {
        const start = Math.max(0, messages.length - height - scrollOffset);
        const end = Math.max(0, messages.length - scrollOffset);
        return messages.slice(start, end);
    }, [messages, scrollOffset, height]);

    return (
        <Box flexDirection="column" paddingX={1} height={height}>
            {scrollOffset > 0 && (
                <Box justifyContent="center">
                    <Text color="yellow">↑ More messages ({scrollOffset} hidden) ↑</Text>
                </Box>
            )}
            
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                visibleMessages.map((msg, index) => (
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
