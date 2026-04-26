import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Message } from '../core/AppContext.js';
import { CodeBlock } from './CodeBlock.js';

interface Props {
    messages: Message[];
    height: number;
    scrollOffset: number;
}

export const ChatView = ({ messages, height, scrollOffset }: Props) => {
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

    // Simple message-based viewport
    const visibleGroups = useMemo(() => {
        const itemsToDisplay = Math.floor(height / 4); // Assume average 4 lines per message/group
        const end = Math.max(0, groupedMessages.length - scrollOffset);
        const start = Math.max(0, end - itemsToDisplay);
        return groupedMessages.slice(start, end);
    }, [groupedMessages, scrollOffset, height]);

    return (
        <Box flexDirection="column" paddingX={1} height={height} overflowY="hidden">
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                visibleGroups.map((group, index) => {
                    if (group.role === 'tool_group') {
                        return (
                            <Box key={index} flexDirection="column" marginBottom={1}>
                                {group.tools.map((t: any, i: number) => (
                                    <Box key={i} flexDirection="row">
                                        <Text color="gray" italic>🛠️ [{t.name || 'tool'}]</Text>
                                        <Text color="dim"> {typeof t.args === 'string' ? t.args : JSON.stringify(t.args || '')}</Text>
                                    </Box>
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
