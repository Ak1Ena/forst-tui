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
        'Base URL': 'baseUrl',
        'Interaction Mode': 'interactionMode',
        'Recursion Limit': 'recursionLimit',
        'Coworker Planner': 'plannerMode'
    };

    const providerTypes = ['gemini', 'openai', 'anthropic', 'openrouter', 'ollama'];
    const interactionModes = ['approval', 'auto-accept', 'yolo'];
    const booleanOptions = ['enabled', 'disabled'];
    const [typeIndex, setTypeIndex] = useState(0);
    const [modeIndex, setModeIndex] = useState(0);
    const [boolIndex, setBoolIndex] = useState(0);

    useInput((input, key) => {
        if (editField) {
            if (key.escape) {
                setEditField(null);
            }
            if (editField === 'type') {
                if (key.upArrow) setTypeIndex(prev => (prev - 1 + providerTypes.length) % providerTypes.length);
                if (key.downArrow) setTypeIndex(prev => (prev + 1) % providerTypes.length);
                if (key.return) {
                    handleSaveEnum('providers', providerTypes[typeIndex]);
                }
            }
            if (editField === 'interactionMode') {
                if (key.upArrow) setModeIndex(prev => (prev - 1 + interactionModes.length) % interactionModes.length);
                if (key.downArrow) setModeIndex(prev => (prev + 1) % interactionModes.length);
                if (key.return) {
                    handleSaveEnum('interactionMode', interactionModes[modeIndex]);
                }
            }
            if (editField === 'plannerMode') {
                if (key.upArrow || key.downArrow) setBoolIndex(prev => 1 - prev);
                if (key.return) {
                    handleSaveEnum('plannerMode', boolIndex === 0);
                }
            }
            return;
        }

        if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
        if (key.downArrow) setSelectedIndex(Math.min(7, selectedIndex + 1));
        if (key.return) {
            const fields = ['name', 'type', 'model', 'apiKey', 'baseUrl', 'interactionMode', 'recursionLimit', 'plannerMode'];
            const field = fields[selectedIndex];
            setEditField(field);
            if (field === 'type') {
                setTypeIndex(providerTypes.indexOf(activeProvider.type || 'gemini'));
            } else if (field === 'interactionMode') {
                setModeIndex(interactionModes.indexOf(settings.interactionMode || 'yolo'));
            } else if (field === 'plannerMode') {
                setBoolIndex(settings.plannerMode ? 0 : 1);
            } else if (field === 'recursionLimit') {
                setTempValue(String(settings.recursionLimit || 50));
            } else {
                setTempValue((activeProvider as any)[field] || '');
            }
        }
    });

    const handleSaveEnum = (field: string, value: any) => {
        let newSettings = { ...settings };
        if (field === 'providers') {
            const updatedProviders = [...settings.providers];
            updatedProviders[0].type = value;
            newSettings.providers = updatedProviders;
        } else {
            (newSettings as any)[field] = value;
        }
        setSettings(newSettings);
        configManager.save(newSettings);
        setEditField(null);
    };

    const handleSaveField = () => {
        if (editField && editField !== 'type' && editField !== 'interactionMode' && editField !== 'plannerMode') {
            if (editField === 'recursionLimit') {
                const newSettings = { ...settings, recursionLimit: parseInt(tempValue) || 50 };
                setSettings(newSettings);
                configManager.save(newSettings);
            } else {
                const updatedProviders = [...settings.providers];
                (updatedProviders[0] as any)[editField] = tempValue;
                const newSettings = { ...settings, providers: updatedProviders };
                setSettings(newSettings);
                configManager.save(newSettings);
            }
            setEditField(null);
        }
    };

    const renderField = (label: string, value: any, index: number) => {
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
                    ) : fieldKey === 'interactionMode' ? (
                        <Box flexDirection="row">
                            {interactionModes.map((m, i) => (
                                <Box key={m} marginLeft={i === 0 ? 0 : 2}>
                                    <Text color={modeIndex === i ? 'yellow' : 'gray'} underline={modeIndex === i}>
                                        {m.toUpperCase()}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    ) : fieldKey === 'plannerMode' ? (
                        <Box flexDirection="row">
                            {booleanOptions.map((opt, i) => (
                                <Box key={opt} marginLeft={i === 0 ? 0 : 2}>
                                    <Text color={boolIndex === i ? 'yellow' : 'gray'} underline={boolIndex === i}>
                                        {opt.toUpperCase()}
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
                         label === 'Interaction Mode' ? (value || 'yolo').toUpperCase() :
                         label === 'Coworker Planner' ? (value ? 'ENABLED' : 'DISABLED') :
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
            
            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginY={1} />
            
            {renderField('Interaction Mode', settings.interactionMode, 5)}
            {renderField('Recursion Limit', String(settings.recursionLimit), 6)}
            {renderField('Coworker Planner', settings.plannerMode, 7)}

            <Box marginTop={2} flexDirection="column">
                <Text dimColor>Use ↑/↓ to navigate, Enter to edit, Enter to save.</Text>
                <Text dimColor>Changes are saved to settings.config.json automatically.</Text>
            </Box>
        </Box>
    );
};
