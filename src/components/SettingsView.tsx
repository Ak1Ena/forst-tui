import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { configManager, ProviderConfig } from '../core/ConfigManager.js';

interface Props {
    onClose: () => void;
}

export const SettingsView = ({ onClose }: Props) => {
    const [settings, setSettings] = useState(configManager.getSettings());
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [editField, setEditField] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState('');

    const activeProvider = settings.providers[0]; // For now, edit the first one

    useInput((input, key) => {
        if (key.escape || (input === 's' && key.ctrl)) {
            onClose();
        }

        if (!editField) {
            if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
            if (key.downArrow) setSelectedIndex(Math.min(3, selectedIndex + 1));
            if (key.return) {
                const fields = ['name', 'model', 'apiKey', 'baseUrl'];
                setEditField(fields[selectedIndex]);
                setTempValue((activeProvider as any)[fields[selectedIndex]] || '');
            }
        }
    });

    const handleSaveField = () => {
        if (editField) {
            const updatedProviders = [...settings.providers];
            (updatedProviders[0] as any)[editField] = tempValue;
            const newSettings = { ...settings, providers: updatedProviders };
            setSettings(newSettings);
            configManager.save(newSettings);
            setEditField(null);
        }
    };

    const renderField = (label: string, value: string, index: number) => {
        const isSelected = selectedIndex === index;
        return (
            <Box flexDirection="row">
                <Text color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '> ' : '  '}
                    <Text bold>{label}: </Text>
                </Text>
                {editField === label.toLowerCase().replace(' ', '') ? (
                    <TextInput value={tempValue} onChange={setTempValue} onSubmit={handleSaveField} />
                ) : (
                    <Text color="gray">{label === 'API Key' ? '********' : value || '(empty)'}</Text>
                )}
            </Box>
        );
    };

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width="100%" height="100%">
            <Text bold color="magenta">⚙️ SETTINGS (Ctrl+S or ESC to close)</Text>
            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginBottom={1} />
            
            <Text color="yellow" marginBottom={1}>Editing: {activeProvider.name}</Text>
            
            {renderField('Name', activeProvider.name, 0)}
            {renderField('Model', activeProvider.model, 1)}
            {renderField('API Key', activeProvider.apiKey || '', 2)}
            {renderField('Base URL', activeProvider.baseUrl || '', 3)}

            <Box marginTop={2} flexDirection="column">
                <Text dimColor>Use ↑/↓ to navigate, Enter to edit, Enter to save.</Text>
                <Text dimColor>Changes are saved to settings.config.json automatically.</Text>
            </Box>
        </Box>
    );
};
