import React, {useEffect, useState, useCallback, useRef, useMemo} from 'react';
import {render, Box, useInput, Text} from 'ink';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import {initSchema} from './database/schema.js';
import {AppProvider, useAppContext} from './core/AppContext.js';
import {heartbeat} from './core/Heartbeat.js';
import {systemMonitorTask} from './core/monitors/SystemMonitor.js';
import {ChatView} from './components/ChatView.js';
import {InputBar} from './components/InputBar.js';
import {ToolStatus} from './components/ToolStatus.js';
import {StatusHeader} from './components/StatusHeader.js';
import { Sidebar } from './components/Sidebar.js';
import { SettingsView } from './components/SettingsView.js';
import { SessionListView } from './components/SessionListView.js';
import { GeminiProvider } from './core/providers/GeminiProvider.js';
import { saveMessage, getMessages, createSession, getLastSession, getSessionMessageCount, getSessions } from './database/messages.js';
import {VectorMemory} from './database/vectorStore.js';
import {configManager} from './core/ConfigManager.js';
import {ProviderFactory} from './core/providers/ProviderFactory.js';
import {getTools} from './tools/index.js';
import {SYSTEM_PROMPT} from './core/Prompts.js';

const App = () => {
    const {state, dispatch} = useAppContext();
    const [tasks, setTasks] = useState<{name: string, enabled: boolean}[]>([]);
    const [systemStats, setSystemStats] = useState({ cpu: '0.00', memory: '0.00' });
    const [view, setView] = useState<'chat' | 'settings' | 'sessions'>('chat');
    const [sessionId, setSessionId] = useState<number>(0);
    const [sessionList, setSessionList] = useState<{id: number, name: string, created_at: string}[]>([]);
    const [scrollOffset, setScrollOffset] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);


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
            return { instance: null, config: configManager.getActiveProvider() || null, error: e?.message || String(e) };
        }
    });

    const [vectorMemory, setVectorMemory] = useState(() => new VectorMemory(activeProvider.config?.apiKey || ''));

    const totalLines = useMemo(() => {
        let count = 0;
        state.messages.forEach((msg, i) => {
            const isFirstTool = msg.role === 'tool' && (i === 0 || state.messages[i - 1].role !== 'tool');
            if (msg.role !== 'tool' || isFirstTool) count += 1; // Header
            
            if (msg.role === 'tool') {
                count += 1; // Tool name + args
            } else {
                count += msg.content.split('\n').length;
            }
            count += 1; // Spacing
        });
        return count;
    }, [state.messages]);

    useInput((input, key) => {
        if (key.escape && state.agentState !== 'idle') {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: '🛑 Request aborted by user.' } });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
            }
            return;
        }

        if (input === 'r' && key.ctrl) {
            setSessionList(getSessions());
            setView('sessions');
            return;
        }

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
                        setActiveProvider(prev => ({ ...prev, error: e?.message || String(e) }));
                    }
                }
                return nextView;
            });
            return;
        }

        if (view === 'chat') {
            if (input === 'l' && key.ctrl) {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
            }
            if (key.upArrow) {
                setScrollOffset(prev => Math.min(prev + 1, Math.max(0, totalLines - 5)));
            }
            if (key.downArrow) {
                setScrollOffset(prev => Math.max(0, prev - 1));
            }
        }
    });

    useEffect(() => {
        setScrollOffset(0);
    }, [state.messages.length]);

    useEffect(() => {
        initSchema();
        
        let currentSid = getLastSession();
        if (currentSid) {
            const count = getSessionMessageCount(Number(currentSid));
            if (count > 0) {
                currentSid = Number(createSession());
            }
        } else {
            currentSid = Number(createSession());
        }
        
        setSessionId(Number(currentSid));
        setSessionList(getSessions());
        const initialMessages = getMessages(Number(currentSid));
        dispatch({ type: 'SET_MESSAGES', payload: initialMessages });

        vectorMemory.init();

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

        const controller = new AbortController();
        abortControllerRef.current = controller;

        if (text.startsWith('/')) {
            const parts = text.slice(1).split(' ');
            const command = parts[0].toLowerCase();
            
            if (command === 'code') {
                const filePath = parts[1];
                if (!filePath) {
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Usage: /code <file_path>' } });
                    return;
                }
                
                try {
                    // Open vim
                    spawnSync('vim', [filePath], { stdio: 'inherit' });
                    
                    // After vim exits, show the code
                    if (fs.existsSync(filePath)) {
                        const content = fs.readFileSync(filePath, 'utf8');
                        const preview = `Edited ${filePath}:\n\`\`\`\n${content}\n\`\`\``;
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: preview } });
                    } else {
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `File ${filePath} not found after edit.` } });
                    }
                } catch (e: any) {
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Error opening vim: ${e?.message || String(e)}` } });
                }
                return;
            }

            if (command === 'session') {
                const subCommand = parts[1]?.toLowerCase();
                if (subCommand === 'list') {
                    const sess = getSessions();
                    const list = sess.map(s => `[${s.id}] ${s.name}`).join('\n');
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Sessions:\n${list}` } });
                    return;
                }
                if (subCommand === 'new') {
                    const newSid = Number(createSession());
                    setSessionId(newSid);
                    setSessionList(getSessions());
                    dispatch({ type: 'SET_MESSAGES', payload: [] });
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Switched to new session [${newSid}]` } });
                    return;
                }
                if (subCommand === 'load') {
                    const targetId = parseInt(parts[2]);
                    if (!isNaN(targetId)) {
                        setSessionId(targetId);
                        const msgs = getMessages(targetId);
                        dispatch({ type: 'SET_MESSAGES', payload: msgs });
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Resumed session [${targetId}]` } });
                        return;
                    }
                }
            }

            if (command === 'clear') {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
                return;
            }
            if (command === 'help') {
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Commands: /session [list|new|load <id>], /clear, /help, /tasks' } });
                return;
            }
        }

        let userMsg = { role: 'user' as const, content: text };
        dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
        saveMessage(sessionId, userMsg);
        await vectorMemory.addMessage(text, { role: 'user', timestamp: Date.now(), sessionId });

        const systemMsg = { role: 'system' as const, content: SYSTEM_PROMPT };
        let currentMessages = [systemMsg, ...state.messages, userMsg];
        let iteration = 0;
        const maxIterations = 5;

        while (iteration < maxIterations) {
            dispatch({ type: 'SET_AGENT_STATE', payload: iteration === 0 ? 'thinking' : 'acting' });
            
            try {
                const response = await activeProvider.instance.chat(currentMessages, getTools(), controller.signal);
                dispatch({ type: 'ADD_MESSAGE', payload: response });
                saveMessage(sessionId, response);
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
                                name: toolCall.name,
                                args: toolCall.args
                            };
                            dispatch({ type: 'ADD_MESSAGE', payload: toolMsg });
                            saveMessage(sessionId, toolMsg);
                            dispatch({ type: 'STOP_TOOL', payload: toolCall.name });
                            currentMessages.push(toolMsg);
                        }
                    }
                    iteration++;
                    continue; 
                }
                
                await vectorMemory.addMessage(response.content, { role: 'assistant', timestamp: Date.now(), sessionId });
                break; 
            } catch (error: any) {
                if (error?.name === 'AbortError') {
                    break;
                }
                const errorMsg = { role: 'system' as const, content: `Error: ${error?.message || String(error)}` };
                dispatch({ type: 'ADD_MESSAGE', payload: errorMsg });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'error' });
                break;
            }
        }
        dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
        abortControllerRef.current = null;
    }, [activeProvider, state.messages, vectorMemory, tasks, dispatch, sessionId]);

    return (
        <Box flexDirection="column" height="100%">
            {view === 'settings' ? (
                <SettingsView onClose={() => setView('chat')} />
            ) : view === 'sessions' ? (
                <SessionListView 
                    sessions={sessionList} 
                    currentSessionId={sessionId}
                    onClose={() => setView('chat')}
                    onSelect={(id) => {
                        setSessionId(id);
                        const msgs = getMessages(id);
                        dispatch({ type: 'SET_MESSAGES', payload: msgs });
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Resumed session [${id}]` } });
                        setView('chat');
                    }}
                />
            ) : (
                <>
                    <StatusHeader 
                        provider={activeProvider.config?.name || 'None'} 
                        model={activeProvider.config?.model || 'None'} 
                        agentState={activeProvider.error ? 'error' : state.agentState} 
                    />
                    
                    <Box flexGrow={1} flexDirection="row" marginTop={1}>
                        <Box flexGrow={1} borderStyle="single" borderColor={activeProvider.error ? 'red' : 'blue'} flexDirection="row">
                            <Box flexGrow={1} flexDirection="column">
                                {activeProvider.error && (
                                    <Box padding={1} backgroundColor="red">
                                        <Text color="white" bold>⚠️ {activeProvider.error}. Press Ctrl+S to configure.</Text>
                                    </Box>
                                )}
                                <ChatView 
                                    messages={state.messages} 
                                    height={process.stdout.rows - 12} 
                                    scrollOffset={scrollOffset}
                                />
                            </Box>
                            
                            {/* Scrollbar */}
                            <Box flexDirection="column" width={1} alignItems="center" paddingY={1}>
                                <Text color="blue">▲</Text>
                                <Box flexGrow={1} />
                                <Text color={scrollOffset > 0 ? 'yellow' : 'blue'}>▼</Text>
                            </Box>
                        </Box>
                        
                        <Sidebar systemStats={systemStats} tasks={tasks} sessions={sessionList} currentSessionId={sessionId} />
                    </Box>

                    <ToolStatus activeTools={state.activeTools} agentState={state.agentState} />
                    
                    <Box marginTop={0}>
                        <InputBar onSubmit={handleSendMessage} tools={getTools()} />
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
