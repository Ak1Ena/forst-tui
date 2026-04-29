import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import { Message, Task } from '../core/AppContext.js';

interface Props {
    messages: Message[];
    height: number;
    scrollOffset: number;
    taskQueue?: Task[];
}

const ensureString = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if ('text' in part) return part.text;
                return JSON.stringify(part);
            }
            return '';
        }).join('');
    }
    if (content && typeof content === 'object') return JSON.stringify(content);
    return String(content || '');
};

type LineSegment = {
    text: string;
    color?: string;
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    backgroundColor?: string;
};

interface ChatLine {
    segments: LineSegment[];
}

const parseLineSegments = (line: string, baseProps: Partial<LineSegment> = {}): LineSegment[] => {
    const segments: LineSegment[] = [];
    // Regex for bold (**), italic (*), inline code (`), and strikethrough (~~)
    const regex = /(\*\*.*?\*\*|\*.*?\*|~~.*?~~|`.*?`)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(line)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ ...baseProps, text: line.slice(lastIndex, match.index) });
        }

        const part = match[0];
        if (part.startsWith('**') && part.endsWith('**')) {
            segments.push({ ...baseProps, text: part.slice(2, -2), bold: true });
        } else if (part.startsWith('~~') && part.endsWith('~~')) {
            segments.push({ ...baseProps, text: part.slice(2, -2), strikethrough: true });
        } else if (part.startsWith('*') && part.endsWith('*')) {
            segments.push({ ...baseProps, text: part.slice(1, -1), italic: true });
        } else if (part.startsWith('`') && part.endsWith('`')) {
            segments.push({ ...baseProps, text: part.slice(1, -1), backgroundColor: 'white', color: 'black' });
        }
        
        lastIndex = regex.lastIndex;
    }

    if (lastIndex < line.length) {
        segments.push({ ...baseProps, text: line.slice(lastIndex) });
    }

    return segments.length > 0 ? segments : [{ ...baseProps, text: line }];
};

export const ChatView = ({ messages, height, scrollOffset, taskQueue = [] }: Props) => {
    const getIcon = (role: string) => {
        switch (role) {
            case 'user': return '👤';
            case 'assistant': return '🤖';
            case 'system': return '⚙️';
            case 'tool': return '🛠️';
            default: return '•';
        }
    };

    const breadcrumbs = useMemo(() => {
        const activeTask = taskQueue.find(t => t.status === 'in-progress');
        if (!activeTask) return null;

        return (
            <Box paddingX={1} marginBottom={1} borderStyle="round" borderColor="gray">
                <Text color="cyan" bold>📍 {activeTask.description}</Text>
                {messages.length > 0 && messages[messages.length - 1].role === 'tool' && (
                    <Text color="gray"> › 🛠️ {messages[messages.length - 1].name}</Text>
                )}
            </Box>
        );
    }, [taskQueue, messages]);

    // Helper to generate all lines for the chat
    const allLines = useMemo(() => {
        const lines: ChatLine[] = [];

        messages.forEach((msg, msgIndex) => {
            const isFirstTool = msg.role === 'tool' && (msgIndex === 0 || messages[msgIndex - 1].role !== 'tool');
            
            if (msg.role !== 'tool' || isFirstTool) {
                const roleColor = msg.role === 'user' ? 'blue' : msg.role === 'assistant' ? 'green' : 'yellow';
                lines.push({ 
                    segments: [{
                        text: `${getIcon(msg.role)} ${msg.role.toUpperCase()}`, 
                        color: roleColor, 
                        bold: true 
                    }]
                });
            }

            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                msg.tool_calls.forEach(tc => {
                    const argStr = typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args);
                    lines.push({ 
                        segments: [{
                            text: `   🛠️ CALL: [${tc.name}] ${argStr}`, 
                            color: 'magenta', 
                            italic: true 
                        }]
                    });
                });
            }

            const content = ensureString(msg.content);

            if (msg.role === 'tool') {
                const isEdit = msg.name === 'edit_file';
                const result = isEdit ? content : (content.length > 500 ? content.slice(0, 500) + '...' : content);
                
                lines.push({ 
                    segments: [{
                        text: `   🛠️ RESULT: [${msg.name}]`, 
                        color: 'cyan', 
                        bold: true
                    }]
                });
                result.split('\n').forEach(line => {
                    lines.push({ segments: [{ text: `     ${line}`, color: 'gray' }] });
                });
            } else if (content) {
                const parts = content.split('\n');
                let inCodeBlock = false;
                
                parts.forEach(line => {
                    if (line.startsWith('```')) {
                        inCodeBlock = !inCodeBlock;
                        lines.push({ segments: [{ text: `   ${line}`, color: 'yellow', bold: true }] });
                    } else if (inCodeBlock) {
                        lines.push({ segments: [{ text: `   ${line}`, color: 'blue' }] });
                    } else if (line.trim()) {
                        const isError = msg.role === 'system' && line.toLowerCase().includes('error');
                        const baseColor = isError ? 'red' : undefined;
                        
                        if (line.trim().startsWith('- ') || line.trim().match(/^\d+\. /)) {
                            lines.push({ segments: parseLineSegments(`   ${line}`, { color: baseColor }) });
                        } else {
                            lines.push({ segments: parseLineSegments(`   ${line}`, { color: baseColor }) });
                        }
                    } else {
                        lines.push({ segments: [{ text: '' }] });
                    }
                });
            }
            
            lines.push({ segments: [{ text: '' }] });
        });

        return lines;
    }, [messages]);

    const visibleLines = useMemo(() => {
        const totalLines = allLines.length;
        const end = Math.max(0, totalLines - scrollOffset);
        const start = Math.max(0, end - height);
        return allLines.slice(start, end);
    }, [allLines, scrollOffset, height]);

    return (
        <Box flexDirection="column" paddingX={1} height={height} overflowY="hidden">
            {breadcrumbs}
            {messages.length === 0 ? (
                <Text italic color="gray">No messages yet. Start a conversation!</Text>
            ) : (
                visibleLines.map((line, index) => (
                    <Box key={index}>
                        <Text wrap="wrap">
                            {line.segments.map((seg, sIdx) => (
                                <Text 
                                    key={sIdx}
                                    color={seg.color} 
                                    bold={seg.bold} 
                                    italic={seg.italic}
                                    strikethrough={seg.strikethrough}
                                    backgroundColor={seg.backgroundColor as any}
                                >
                                    {seg.text}
                                </Text>
                            ))}
                        </Text>
                    </Box>
                ))
            )}
        </Box>
    );
};
