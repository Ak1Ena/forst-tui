import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { AnimatedSpinner } from './AnimatedSpinner.js';
import * as fs from 'fs';
import * as path from 'path';

interface Props {
    activeTools: string[];
    agentState: string;
    pendingToolCall?: any;
}

export const ToolStatus = ({ activeTools, agentState, pendingToolCall }: Props) => {
    const [filePreview, setFilePreview] = useState<string | null>(null);

    useEffect(() => {
        if (pendingToolCall && pendingToolCall[0]?.name === 'write_file') {
            const { filePath, content } = pendingToolCall[0].args;
            try {
                if (fs.existsSync(filePath)) {
                    const current = fs.readFileSync(filePath, 'utf8');
                    // Simple "diff" - just show first few lines of both
                    setFilePreview(`EXISTING FILE DETECTED:\n${current.slice(0, 100)}...\n\nPROPOSED CONTENT:\n${content.slice(0, 100)}...`);
                } else {
                    setFilePreview(`NEW FILE:\n${content.slice(0, 200)}...`);
                }
            } catch (e) {
                setFilePreview(null);
            }
        } else {
            setFilePreview(null);
        }
    }, [pendingToolCall]);

    if (agentState === 'idle' && activeTools.length === 0) return null;

    if (agentState === 'awaiting_approval' && pendingToolCall) {
        return (
            <Box paddingX={1} flexDirection="column" borderStyle="round" borderColor="magenta">
                <Text color="magenta" bold>🛡️ APPROVAL REQUIRED</Text>
                {pendingToolCall.map((tc: any, i: number) => (
                    <Box key={i} flexDirection="column" marginTop={1}>
                        <Text color="cyan">Tool: <Text bold>{tc.name}</Text></Text>
                        <Text color="gray">Args: {JSON.stringify(tc.args)}</Text>
                        {filePreview && (
                            <Box marginTop={1} padding={1} borderStyle="single" borderColor="gray">
                                <Text color="yellow">{filePreview}</Text>
                            </Box>
                        )}
                    </Box>
                ))}
                <Box marginTop={1}>
                    <Text>Press <Text color="green" bold>y</Text> to Approve | <Text color="red" bold>n</Text> to Deny</Text>
                </Box>
            </Box>
        );
    }

    return (
        <Box paddingX={1} flexDirection="row">
            <AnimatedSpinner />
            <Text color="yellow" bold>[{agentState.toUpperCase()}] </Text>
            {activeTools.length > 0 && (
                <Text color="gray">
                    Running: {activeTools.join(', ')}...
                </Text>
            )}
        </Box>
    );
};
