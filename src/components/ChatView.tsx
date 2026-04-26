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
                    elements.push(<Text key={i} wrap="wrap">{parts[i]}</Text>);
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

    // Helper to group messages (consecutive tools together)
    const groupedMessages = useMemo(() => {
        const groups: any[] = [];
        messages.forEach((msg, i) => {
            if (msg.role === 'tool' && groups.length > 0 && groups[groups.length - 1].role === 'tool_group') {
                groups[groups.length - 1].tools.push(msg);
            } else if (msg.role === 'tool') {
                groups.push({ role: 'tool_group', tools: [msg] });
            } else {
                groups.push(msg);
            }
        });
        return groups;
    }, [messages]);

    // Calculate visible groups
    const visibleGroups = useMemo(() => {
        const start = Math.max(0, groupedMessages.length - height - scrollOffset);
        const end = Math.max(0, groupedMessages.length - scrollOffset);
        return groupedMessages.slice(start, end);
    }, [groupedMessages, scrollOffset, height]);

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
                visibleGroups.map((group, index) => {
                    if (group.role === 'tool_group') {
                        return (
                            <Box key={index} flexDirection="row" marginBottom={1}>
                                <Text>🛠️ </Text>
                                {group.tools.map((t: any, i: number) => (
                                    <Text key={i} color="gray" italic>[{t.name || 'tool'}]</Text>
                                ))}
                            </Box>
                        );
                    }

                    return (
                        <Box key={index} flexDirection="column" marginBottom={1}>
                            <Box flexDirection="row">
                                <Text wrap="wrap">{getIcon(group.role)} </Text>
                                <Text bold wrap="wrap" color={group.role === 'user' ? 'blue' : group.role === 'assistant' ? 'green' : 'yellow'}>
                                    {group.role.toUpperCase()}
                                </Text>
                            </Box>
                            <Box paddingLeft={3} flexDirection="column">
                                {renderContent(group.content)}
                            </Box>
                        </Box>
                    );
                })
            )}
        </Box>
    );
};
