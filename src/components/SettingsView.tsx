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

    const fieldMapping: Record<string, string> = {
        'Name': 'name',
        'Type': 'type',
        'Model': 'model',
        'API Key': 'apiKey',
        'Base URL': 'baseUrl'
    };

    const providerTypes = ['gemini', 'openai', 'openrouter', 'ollama'];
    const [typeIndex, setTypeIndex] = useState(0);

    useInput((input, key) => {
        if (editField) {
            if (key.escape) {
                setEditField(null);
            }
            if (editField === 'type') {
                if (key.upArrow) setTypeIndex(prev => (prev - 1 + providerTypes.length) % providerTypes.length);
                if (key.downArrow) setTypeIndex(prev => (prev + 1) % providerTypes.length);
                if (key.return) {
                    handleSaveType(providerTypes[typeIndex]);
                }
            }
            return;
        }

        if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
        if (key.downArrow) setSelectedIndex(Math.min(4, selectedIndex + 1));
        if (key.return) {
            const fields = ['name', 'type', 'model', 'apiKey', 'baseUrl'];
            const field = fields[selectedIndex];
            setEditField(field);
            if (field === 'type') {
                setTypeIndex(providerTypes.indexOf(activeProvider.type || 'gemini'));
            } else {
                setTempValue((activeProvider as any)[field] || '');
            }
        }
    });

    const handleSaveType = (newType: string) => {
        const updatedProviders = [...settings.providers];
        updatedProviders[0].type = newType as any;
        const newSettings = { ...settings, providers: updatedProviders };
        setSettings(newSettings);
        configManager.save(newSettings);
        setEditField(null);
    };

    const handleSaveField = () => {
        if (editField && editField !== 'type') {
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
        const fieldKey = fieldMapping[label];
        const isEditing = editField === fieldKey;

        return (
            <Box flexDirection="row" key={label}>
                <Text color={isSelected ? 'cyan' : 'white'}>
                    {isSelected ? '> ' : '  '}
                    <Text bold>{label}: </Text>
                </Text>
                {isEditing ? (
                    fieldKey === 'type' ? (
                        <Box flexDirection="row">
                            {providerTypes.map((t, i) => (
                                <Box key={t} marginLeft={i === 0 ? 0 : 2}>
                                    <Text color={typeIndex === i ? 'yellow' : 'gray'} underline={typeIndex === i}>
                                        {t.toUpperCase()}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    ) : (
                        <TextInput 
                            value={tempValue} 
                            onChange={setTempValue} 
                            onSubmit={handleSaveField} 
                        />
                    )
                ) : (
                    <Text color="gray">
                        {label === 'API Key' && value ? '********' : 
                         label === 'Type' ? (value || 'gemini').toUpperCase() :
                         value || '(empty)'}
                    </Text>
                )}
            </Box>
        );
    };

    return (
        <Box flexDirection="column" borderStyle="double" borderColor="magenta" padding={1} width="100%" height="100%">
            <Text bold color="magenta">⚙️ SETTINGS (Ctrl+S or ESC to close)</Text>
            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginBottom={1} />
            
            <Box marginBottom={1}>
                <Text color="yellow">Editing: {activeProvider.name}</Text>
            </Box>
            
            {renderField('Name', activeProvider.name, 0)}
            {renderField('Type', activeProvider.type, 1)}
            {renderField('Model', activeProvider.model, 2)}
            {renderField('API Key', activeProvider.apiKey || '', 3)}
            {renderField('Base URL', activeProvider.baseUrl || '', 4)}

            <Box marginTop={2} flexDirection="column">
                <Text dimColor>Use ↑/↓ to navigate, Enter to edit, Enter to save.</Text>
                <Text dimColor>Changes are saved to settings.config.json automatically.</Text>
            </Box>
        </Box>
    );
};
