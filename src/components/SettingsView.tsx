import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { configManager, ProviderConfig, AppSettings } from '../core/ConfigManager.js';

interface Props {
    onClose: () => void;
}

export const SettingsView = ({ onClose }: Props) => {
    const [settings, setSettings] = useState(configManager.getSettings());
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [editField, setEditField] = useState<string | null>(null);
    const [tempValue, setTempValue] = useState('');
    const [restartRequired, setRestartRequired] = useState(false);
    const [deleteStatus, setDeleteStatus] = useState<string | null>(null);

    const activeProvider = settings.providers[0]; // For now, edit the first one

    const fieldMapping: Record<string, string> = {
        'Name': 'name',
        'Type': 'type',
        'Model': 'model',
        'API Key': 'apiKey',
        'Base URL': 'baseUrl',
        'Interaction Mode': 'interactionMode',
        'Recursion Limit': 'recursionLimit',
        'Short-term Memory': 'shortTermMemoryLimit',
        'Coworker Planner': 'plannerMode',
        'Memory (Related Context)': 'memoryInjection',
        'System Prompt': 'systemPromptInjection',
        'Embedding Mode': 'embeddingMode',
        'Delete Local Model': 'deleteModel'
    };

    const providerTypes = ['gemini', 'openai', 'anthropic', 'openrouter', 'ollama'];
    const interactionModes = ['approval', 'auto-accept', 'yolo'];
    const embeddingModes = ['local', 'cloud', 'none'];
    const booleanOptions = ['enabled', 'disabled'];
    const [typeIndex, setTypeIndex] = useState(0);
    const [modeIndex, setModeIndex] = useState(0);
    const [embIndex, setEmbIndex] = useState(0);
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
            if (editField === 'embeddingMode') {
                if (key.upArrow) setEmbIndex(prev => (prev - 1 + embeddingModes.length) % embeddingModes.length);
                if (key.downArrow) setEmbIndex(prev => (prev + 1) % embeddingModes.length);
                if (key.return) {
                    handleSaveEnum('embeddingMode', embeddingModes[embIndex]);
                }
            }
            if (editField === 'plannerMode' || editField === 'memoryInjection' || editField === 'systemPromptInjection') {
                if (key.upArrow || key.downArrow) setBoolIndex(prev => 1 - prev);
                if (key.return) {
                    handleSaveEnum(editField, boolIndex === 0);
                }
            }
            return;
        }

        const fields = ['name', 'type', 'model', 'apiKey', 'baseUrl', 'interactionMode', 'recursionLimit', 'shortTermMemoryLimit', 'plannerMode', 'memoryInjection', 'systemPromptInjection', 'embeddingMode', 'deleteModel'];
        if (key.upArrow) setSelectedIndex(Math.max(0, selectedIndex - 1));
        if (key.downArrow) setSelectedIndex(Math.min(fields.length - 1, selectedIndex + 1));
        if (key.return) {
            const field = fields[selectedIndex];
            if (field === 'deleteModel') {
                setDeleteStatus('Deleting...');
                import('../database/vectorStore.js').then(({ vectorMemory }) => {
                    vectorMemory.deleteLocalModel().then(() => {
                        setDeleteStatus('DELETED');
                        setTimeout(() => setDeleteStatus(null), 3000);
                    }).catch(() => {
                        setDeleteStatus('ERROR');
                        setTimeout(() => setDeleteStatus(null), 3000);
                    });
                });
                return;
            }
            setEditField(field);
            if (field === 'type') {
                setTypeIndex(providerTypes.indexOf(activeProvider.type || 'gemini'));
            } else if (field === 'interactionMode') {
                setModeIndex(interactionModes.indexOf(settings.interactionMode || 'yolo'));
            } else if (field === 'embeddingMode') {
                setEmbIndex(embeddingModes.indexOf(settings.embeddingMode || 'local'));
            } else if (field === 'plannerMode' || field === 'memoryInjection' || field === 'systemPromptInjection') {
                setBoolIndex(settings[field as keyof AppSettings] ? 0 : 1);
            } else if (field === 'recursionLimit') {
                setTempValue(String(settings.recursionLimit || 50));
            } else if (field === 'shortTermMemoryLimit') {
                setTempValue(String(settings.shortTermMemoryLimit || 12));
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

        if (field === 'embeddingMode') {
            setRestartRequired(true);
        }

        setSettings(newSettings);
        configManager.save(newSettings);
        setEditField(null);
    };

    const handleSaveField = () => {
        if (editField && editField !== 'type' && editField !== 'interactionMode' && editField !== 'embeddingMode' && editField !== 'plannerMode') {
            if (editField === 'recursionLimit') {
                const newSettings = { ...settings, recursionLimit: parseInt(tempValue) || 50 };
                setSettings(newSettings);
                configManager.save(newSettings);
            } else if (editField === 'shortTermMemoryLimit') {
                const newSettings = { ...settings, shortTermMemoryLimit: parseInt(tempValue) || 12 };
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
                    ) : fieldKey === 'embeddingMode' ? (
                        <Box flexDirection="row">
                            {embeddingModes.map((m, i) => (
                                <Box key={m} marginLeft={i === 0 ? 0 : 2}>
                                    <Text color={embIndex === i ? 'yellow' : 'gray'} underline={embIndex === i}>
                                        {m.toUpperCase()}
                                    </Text>
                                </Box>
                            ))}
                        </Box>
                    ) : (fieldKey === 'plannerMode' || fieldKey === 'memoryInjection' || fieldKey === 'systemPromptInjection') ? (
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
                         label === 'Embedding Mode' ? (value || 'local').toUpperCase() :
                         label === 'Delete Local Model' ? (deleteStatus || 'PRESS ENTER TO DELETE') :
                         (label === 'Coworker Planner' || label === 'Memory (Related Context)' || label === 'System Prompt') ? (value ? 'ENABLED' : 'DISABLED') :
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
            {renderField('Short-term Memory', String(settings.shortTermMemoryLimit), 7)}
            {renderField('Coworker Planner', settings.plannerMode, 8)}
            {renderField('Memory (Related Context)', settings.memoryInjection, 9)}
            {renderField('System Prompt', settings.systemPromptInjection, 10)}
            {renderField('Embedding Mode', settings.embeddingMode, 11)}
            {renderField('Delete Local Model', '', 12)}

            {restartRequired && (
                <Box marginTop={1} paddingX={1} backgroundColor="yellow">
                    <Text color="black" bold>⚠️ Restart required to apply Embedding Mode changes.</Text>
                </Box>
            )}

            <Box marginTop={2} flexDirection="column">
                <Text dimColor>Use ↑/↓ to navigate, Enter to edit, Enter to save.</Text>
                <Text dimColor>Changes are saved to settings.config.json automatically.</Text>
            </Box>
        </Box>
    );
};
