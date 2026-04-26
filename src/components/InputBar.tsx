import React, { useState } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
    onSubmit: (value: string) => void;
    placeholder?: string;
}

export const InputBar = ({ onSubmit, placeholder = "Type a message..." }: Props) => {
    const [query, setQuery] = useState('');

    const handleSubmit = (value: string) => {
        if (value.trim()) {
            onSubmit(value);
            setQuery('');
        }
    };

    return (
        <Box borderStyle="single" paddingX={1}>
            <Box marginRight={1}>
                <Text bold color="cyan">></Text>
            </Box>
            <TextInput
                value={query}
                onChange={setQuery}
                onSubmit={handleSubmit}
                placeholder={placeholder}
            />
        </Box>
    );
};
