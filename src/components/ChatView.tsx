import React, { useState, useMemo, useEffect } from 'react';
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
    useEffect(() => {
        setScrollOffset(0);
    }, [messages.length]);

    // Group messages for cleaner display
    const groupedMessages = useMemo(() => {
        const groups: any[] = [];
        messages.forEach((msg) => {
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

    useInput((input, key) => {
        if (key.upArrow) {
            setScrollOffset(prev => Math.min(prev + 1, Math.max(0, groupedMessages.length - 2)));
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

    // Calculate visible groups based on available rows
    // This is still message-based, but we limit the viewport
    const visibleGroups = useMemo(() => {
        // Show approximately enough messages to fill the height
        const itemsToDisplay = Math.floor(height / 3); 
        const end = groupedMessages.length - scrollOffset;
        const start = Math.max(0, end - itemsToDisplay);
        return groupedMessages.slice(start, end);
    }, [groupedMessages, scrollOffset, height]);

    return (
        <Box flexDirection="row" height={height} width="100%">
            <Box flexDirection="column" flexGrow={1} paddingX={1}>
                {messages.length === 0 ? (
                    <Text italic color="gray">No messages yet. Start a conversation!</Text>
                ) : (
                    visibleGroups.map((group, index) => {
                        if (group.role === 'tool_group') {
                            return (
                                <Box key={index} flexDirection="row" marginBottom={1}>
                                    <Text>🛠️ </Text>
                                    <Box flexDirection="row" flexWrap="wrap">
                                        {group.tools.map((t: any, i: number) => (
                                            <Text key={i} color="gray" italic>[{t.name || 'tool'}]</Text>
                                        ))}
                                    </Box>
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

            {/* Simple Scrollbar */}
            <Box flexDirection="column" width={1} alignItems="center">
                <Text color="blue">▲</Text>
                <Box flexGrow={1} justifyContent="center">
                    <Text color="gray">┃</Text>
                </Box>
                <Text color={scrollOffset > 0 ? 'yellow' : 'blue'}>▼</Text>
            </Box>
        </Box>
    );
};
