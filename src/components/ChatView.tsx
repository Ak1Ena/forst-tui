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

    // Helper to generate all lines for the chat
    const allLines = useMemo(() => {
        const lines: { text: string; color?: string; bold?: boolean; italic?: boolean }[] = [];

        messages.forEach((msg, msgIndex) => {
            // Header for non-tool messages or first tool in a group
            const isFirstTool = msg.role === 'tool' && (msgIndex === 0 || messages[msgIndex - 1].role !== 'tool');
            
            if (msg.role !== 'tool' || isFirstTool) {
                const roleColor = msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow';
                lines.push({ 
                    text: `${getIcon(msg.role)} ${msg.role.toUpperCase()}`, 
                    color: roleColor, 
                    bold: true 
                });
            }

            if (msg.role === 'tool') {
                lines.push({ 
                    text: `  🛠️ [${msg.name}] ${typeof msg.args === 'string' ? msg.args : JSON.stringify(msg.args || '')}`, 
                    color: 'gray', 
                    italic: true 
                });
            } else {
                // Split content into lines and handle code blocks
                const parts = msg.content.split('\n');
                let inCodeBlock = false;
                
                parts.forEach(line => {
                    if (line.startsWith('```')) {
                        inCodeBlock = !inCodeBlock;
                        lines.push({ text: `   ${line}`, color: 'yellow', bold: true });
                    } else if (inCodeBlock) {
                        lines.push({ text: `   ${line}`, color: 'blue' }); // Blue for code content
                    } else if (line.trim()) {
                        const isError = msg.role === 'system' && line.toLowerCase().includes('error');
                        lines.push({ text: `   ${line}`, color: isError ? 'red' : undefined });
                    } else {
                        lines.push({ text: '' });
                    }
                });
            }
            
            // Spacing between messages
            lines.push({ text: '' });
        });

        return lines;
    }, [messages]);

    // Viewport calculation
    const visibleLines = useMemo(() => {
        const totalLines = allLines.length;
        const end = Math.max(0, totalLines - scrollOffset);
        const start = Math.max(0, end - height);
        return allLines.slice(start, end);
    }, [allLines, scrollOffset, height]);

    return (
        <Box flexDirection="column" paddingX={1} height={height} overflowY="hidden">
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                visibleLines.map((line, index) => (
                    <Box key={index}>
                        <Text 
                            color={line.color} 
                            bold={line.bold} 
                            italic={line.italic} 
                            wrap="wrap"
                        >
                            {line.text}
                        </Text>
                    </Box>
                ))
            )}
        </Box>
    );
};
