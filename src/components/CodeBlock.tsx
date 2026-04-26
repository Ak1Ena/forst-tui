import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    code: string;
    language?: string;
}

export const CodeBlock = ({ code, language }: Props) => {
    // Simple syntax highlighter based on regex
    const highlight = (text: string) => {
        return text.split('\n').map((line, i) => {
            // Highlight keywords
            const parts = line.split(/(\s+)/);
            return (
                <Box key={i}>
                    {parts.map((part, j) => {
                        if (/^(const|let|var|function|return|if|else|for|while|import|export|from|class|extends|async|await)$/.test(part)) {
                            return <Text key={j} color="blue">{part}</Text>;
                        }
                        if (/^('|").*('|")$/.test(part)) {
                            return <Text key={j} color="green">{part}</Text>;
                        }
                        if (/^[0-9]+$/.test(part)) {
                            return <Text key={j} color="yellow">{part}</Text>;
                        }
                        if (/^\/\/.*$/.test(part)) {
                            return <Text key={j} color="gray" italic>{part}</Text>;
                        }
                        return <Text key={j}>{part}</Text>;
                    })}
                </Box>
            );
        });
    };

    return (
        <Box flexDirection="column" paddingX={1} marginY={1} borderStyle="round" borderColor="gray" backgroundColor="#1e1e1e" width="100%">
            {language && (
                <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginBottom={1}>
                    <Text bold color="yellow">{language.toUpperCase()}</Text>
                </Box>
            )}
            {highlight(code)}
        </Box>
    );
};
