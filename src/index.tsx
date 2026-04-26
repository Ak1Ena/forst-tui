import React, {useEffect, useState, useCallback} from 'react';
import {render, Box, useInput, Text} from 'ink';
import {initSchema} from './database/schema.js';
import {AppProvider, useAppContext} from './core/AppContext.js';
import {heartbeat} from './core/Heartbeat.js';
import {systemMonitorTask} from './core/monitors/SystemMonitor.js';
import {ChatView} from './components/ChatView.js';
import {InputBar} from './components/InputBar.js';
import {ToolStatus} from './components/ToolStatus.js';
import {StatusHeader} from './components/StatusHeader.js';
import {Sidebar} from './components/Sidebar.js';
import {SettingsView} from './components/SettingsView.js';
import {GeminiProvider} from './core/providers/GeminiProvider.js';
import {saveMessage, getMessages} from './database/messages.js';
import {VectorMemory} from './database/vectorStore.js';
import {configManager} from './core/ConfigManager.js';
import {ProviderFactory} from './core/providers/ProviderFactory.js';
import {getTools} from './tools/index.js';

const App = () => {
    const {state, dispatch} = useAppContext();
    const [tasks, setTasks] = useState<{name: string, enabled: boolean}[]>([]);
    const [systemStats, setSystemStats] = useState({ cpu: '0.00', memory: '0.00' });
    const [view, setView] = useState<'chat' | 'settings'>('chat');

    // Initialize Provider from Config
    const [activeProvider, setActiveProvider] = useState<{instance: any, config: any, error: string | null}>(() => {
        try {
            const config = configManager.getActiveProvider();
            if (!config || (!config.apiKey && config.type !== 'ollama')) {
                return { instance: null, config: config || null, error: 'Missing API Key' };
            }
            return {
                instance: ProviderFactory.create(config),
                config,
                error: null
            };
        } catch (e: any) {
            return { instance: null, config: configManager.getActiveProvider() || null, error: e.message };
        }
    });

    const [vectorMemory, setVectorMemory] = useState(() => new VectorMemory(activeProvider.config?.apiKey || ''));

    useInput((input, key) => {
        // Handle Ctrl+S toggle globally
        if (input === 's' && key.ctrl) {
            setView(prev => {
                const nextView = prev === 'chat' ? 'settings' : 'chat';
                if (nextView === 'chat') {
                    try {
                        const config = configManager.getActiveProvider();
                        if (config && (config.apiKey || config.type === 'ollama')) {
                            setActiveProvider({
                                instance: ProviderFactory.create(config),
                                config,
                                error: null
                            });
                            const newVM = new VectorMemory(config.apiKey || '');
                            newVM.init();
                            setVectorMemory(newVM);
                        }
                    } catch (e: any) {
                        setActiveProvider(prev => ({ ...prev, error: e.message }));
                    }
                }
                return nextView;
            });
            return;
        }

        // Only handle other global shortcuts if NOT in settings view
        if (view === 'chat') {
            if (input === 'l' && key.ctrl) {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
            }
        }
    });

    useEffect(() => {
        initSchema();
        vectorMemory.init();
        
        const initialMessages = getMessages();
        dispatch({ type: 'SET_MESSAGES', payload: initialMessages });

        heartbeat.registerTask(systemMonitorTask);
        heartbeat.enableTask('system-monitor');
        setTasks(heartbeat.getTasks().map(t => ({ name: t.name, enabled: t.enabled })));

        const handleResult = ({id, result}: {id: string, result: any}) => {
            if (id === 'system-monitor') {
                setSystemStats(result);
            }
        };

        heartbeat.on('task-result', handleResult);

        return () => {
            heartbeat.off('task-result', handleResult);
            heartbeat.disableTask('system-monitor');
        };
    }, [vectorMemory]);

    const handleSendMessage = useCallback(async (text: string) => {
        if (!activeProvider.instance) {
            dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: '⚠️ Provider not configured. Press Ctrl+S to set your API Key.' } });
            return;
        }

        if (text.startsWith('/')) {
            const command = text.slice(1).toLowerCase();
            if (command === 'clear') {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
                return;
            }
            if (command === 'help') {
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Available commands: /clear, /help, /tasks' } });
                return;
            }
            if (command === 'tasks') {
                const taskList = tasks.map(t => `${t.name}: ${t.enabled ? 'Enabled' : 'Disabled'}`).join('\n');
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Background Tasks:\n${taskList}` } });
                return;
            }
        }

        let userMsg = { role: 'user' as const, content: text };
        dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
        saveMessage(userMsg);
        await vectorMemory.addMessage(text, { role: 'user', timestamp: Date.now() });

        let currentMessages = [...state.messages, userMsg];
        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            dispatch({ type: 'SET_AGENT_STATE', payload: iteration === 0 ? 'thinking' : 'acting' });
            
            try {
                const response = await activeProvider.instance.chat(currentMessages, getTools());
                dispatch({ type: 'ADD_MESSAGE', payload: response });
                saveMessage(response);
                currentMessages.push(response);

                if (response.tool_calls && response.tool_calls.length > 0) {
                    dispatch({ type: 'SET_AGENT_STATE', payload: 'acting' });
                    
                    for (const toolCall of response.tool_calls) {
                        const tool = getTools().find(t => t.name === toolCall.name);
                        if (tool) {
                            dispatch({ type: 'START_TOOL', payload: toolCall.name });
                            const result = await tool.invoke(toolCall.args);
                            const toolMsg = { 
                                role: 'tool' as const, 
                                content: typeof result === 'string' ? result : JSON.stringify(result),
                                tool_call_id: toolCall.id,
                                name: toolCall.name
                            };
                            dispatch({ type: 'ADD_MESSAGE', payload: toolMsg });
                            dispatch({ type: 'STOP_TOOL', payload: toolCall.name });
                            currentMessages.push(toolMsg);
                        }
                    }
                    iteration++;
                    continue; 
                }
                
                await vectorMemory.addMessage(response.content, { role: 'assistant', timestamp: Date.now() });
                break; 
            } catch (error: any) {
                const errorMsg = { role: 'system' as const, content: `Error: ${error.message}` };
                dispatch({ type: 'ADD_MESSAGE', payload: errorMsg });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'error' });
                break;
            }
        }
        dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
    }, [activeProvider, state.messages, vectorMemory, tasks, dispatch]);

    return (
        <Box flexDirection="column" height="100%">
            {view === 'settings' ? (
                <SettingsView onClose={() => setView('chat')} />
            ) : (
                <>
                    <StatusHeader 
                        provider={activeProvider.config?.name || 'None'} 
                        model={activeProvider.config?.model || 'None'} 
                        agentState={activeProvider.error ? 'error' : state.agentState} 
                    />
                    
                    <Box flexGrow={1} flexDirection="row" marginTop={1}>
                        <Box flexGrow={1} borderStyle="single" borderColor={activeProvider.error ? 'red' : 'blue'} flexDirection="column">
                            {activeProvider.error && (
                                <Box padding={1} backgroundColor="red">
                                    <Text color="white" bold>⚠️ {activeProvider.error}. Press Ctrl+S to configure.</Text>
                                </Box>
                            )}
                            <ChatView messages={state.messages} />
                        </Box>
                        
                        <Sidebar systemStats={systemStats} tasks={tasks} />
                    </Box>

                    <ToolStatus activeTools={state.activeTools} agentState={state.agentState} />
                    
                    <Box marginTop={0}>
                        <InputBar onSubmit={handleSendMessage} />
                    </Box>
                </>
            )}
        </Box>
    );
};

render(
    <AppProvider>
        <App />
    </AppProvider>
);
