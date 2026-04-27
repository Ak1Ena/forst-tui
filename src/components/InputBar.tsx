import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';

interface Props {
    onSubmit: (value: string) => void;
    placeholder?: string;
    tools?: { name: string; description?: string }[];
}

const COMMANDS = [
    { name: 'session list', description: 'List all sessions' },
    { name: 'session new', description: 'Create a new session' },
    { name: 'session load', description: 'Load a session by ID' },
    { name: 'task', description: 'Add a manual task to queue' },
    { name: 'code', description: 'Edit a file using vim' },
    { name: 'clear', description: 'Clear current chat' },
    { name: 'help', description: 'Show help' },
    { name: 'tasks', description: 'Show active tasks' }
];

export const InputBar = ({ onSubmit, placeholder = "Type a message...", tools = [] }: Props) => {
    const [query, setQuery] = useState('');
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const suggestions = [...COMMANDS, ...tools.map(t => ({ name: t.name, description: t.description }))];
    const filtered = query.startsWith('/') 
        ? suggestions.filter(s => s.name.startsWith(query.slice(1).toLowerCase()))
        : [];

    useEffect(() => {
        if (query.startsWith('/') && filtered.length > 0) {
            setShowSuggestions(true);
            setSelectedIndex(prev => Math.min(prev, filtered.length - 1));
        } else {
            setShowSuggestions(false);
            setSelectedIndex(0);
        }
    }, [query, filtered.length]);

    useInput((input, key) => {
        if (showSuggestions) {
            if (key.upArrow) {
                setSelectedIndex(prev => Math.max(0, prev - 1));
            }
            if (key.downArrow) {
                setSelectedIndex(prev => Math.min(filtered.length - 1, prev + 1));
            }
            if (key.tab || key.return) {
                if (filtered[selectedIndex]) {
                    setQuery('/' + filtered[selectedIndex].name + ' ');
                    setShowSuggestions(false);
                }
            }
        }
    });

    const handleSubmit = (value: string) => {
        if (showSuggestions && filtered[selectedIndex]) {
            // If suggestions are shown, return handled by useInput above for selection
            // but we need to prevent the default submit if it was a selection
            return;
        }
        if (value.trim()) {
            onSubmit(value);
            setQuery('');
        }
    };

    return (
        <Box flexDirection="column">
            {showSuggestions && (
                <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginBottom={-1}>
                    {filtered.map((s, i) => (
                        <Box key={s.name}>
                            <Text color={i === selectedIndex ? 'cyan' : undefined}>
                                {i === selectedIndex ? '> ' : '  '}
                                /{s.name}
                                {s.description ? <Text color="gray"> - {s.description}</Text> : ''}
                            </Text>
                        </Box>
                    ))}
                </Box>
            )}
            <Box borderStyle="single" paddingX={1}>
                <Box marginRight={1}>
                    <Text bold color="cyan">{'>'}</Text>
                </Box>
                <TextInput
                    value={query}
                    onChange={setQuery}
                    onSubmit={handleSubmit}
                    placeholder={placeholder}
                />
            </Box>
        </Box>
    );
};
