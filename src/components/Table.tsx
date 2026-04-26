import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    headers: string[];
    data: string[][];
    headerColor?: string;
}

export const Table = ({ headers, data, headerColor = 'cyan' }: Props) => {
    // Calculate column widths
    const columnWidths = headers.map((header, i) => {
        const cellMax = Math.max(...data.map((row) => row[i]?.length || 0));
        return Math.max(header.length, cellMax) + 2;
    });

    return (
        <Box flexDirection="column" borderStyle="single" borderColor="gray" paddingX={1}>
            <Box flexDirection="row">
                {headers.map((header, i) => (
                    <Box key={i} width={columnWidths[i]}>
                        <Text bold color={headerColor}>{header.toUpperCase()}</Text>
                    </Box>
                ))}
            </Box>
            <Box borderStyle="single" borderTop={true} borderBottom={false} borderLeft={false} borderRight={false} marginTop={-1} marginBottom={0} />
            {data.map((row, i) => (
                <Box key={i} flexDirection="row">
                    {row.map((cell, j) => (
                        <Box key={j} width={columnWidths[j]}>
                            <Text>{cell}</Text>
                        </Box>
                    ))}
                </Box>
            ))}
        </Box>
    );
};
