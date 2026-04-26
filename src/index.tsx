#!/usr/bin/env node
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
import { saveMessage, getMessages, createSession, getLastSession, getSessionMessageCount, getSessions, updateSessionName, deleteSession } from './database/messages.js';
import {VectorMemory} from './database/vectorStore.js';
import {configManager} from './core/ConfigManager.js';
import {ProviderFactory} from './core/providers/ProviderFactory.js';
import {getTools} from './tools/index.js';
import {SYSTEM_PROMPT} from './core/Prompts.js';
import {createAgentWorkflow} from './core/Workflow.js';
import {HumanMessage, AIMessage, SystemMessage, ToolMessage} from '@langchain/core/messages';
import { Client } from "langsmith";

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
                if (subCommand === 'delete') {
                    const targetId = parseInt(parts[2]);
                    if (!isNaN(targetId)) {
                        deleteSession(targetId);
                        setSessionList(getSessions());
                        if (targetId === sessionId) {
                            const newSid = Number(createSession());
                            setSessionId(newSid);
                            dispatch({ type: 'SET_MESSAGES', payload: [] });
                        }
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Deleted session [${targetId}]` } });
                        return;
                    }
                }
            }

            if (command === 'clear') {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
                return;
            }
            if (command === 'help') {
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Commands: /session [list|new|load <id>|delete <id>], /clear, /help, /tasks, /code <file>' } });
                return;
            }
        }

        let userMsg = { role: 'user' as const, content: text };
        dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
        saveMessage(sessionId, userMsg);
        await vectorMemory.addMessage(text, { role: 'user', timestamp: Date.now(), sessionId });

        const appWorkflow = createAgentWorkflow(activeProvider.instance);
        
        // Map messages to LangChain format
        const langchainMessages = [
            new SystemMessage(SYSTEM_PROMPT),
            ...state.messages.map(m => {
                if (m.role === 'user') return new HumanMessage(m.content);
                if (m.role === 'assistant') return new AIMessage({ content: m.content, tool_calls: m.tool_calls });
                if (m.role === 'system') return new SystemMessage(m.content);
                if (m.role === 'tool') return new ToolMessage({ content: m.content, tool_call_id: m.tool_call_id || '', name: m.name });
                return new HumanMessage(m.content);
            }),
            new HumanMessage(text)
        ];

        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });

        try {
            const config = {
                configurable: { thread_id: sessionId.toString() },
                recursionLimit: 20
            };

            const stream = await appWorkflow.stream(
                { messages: langchainMessages },
                config
            );

            for await (const chunk of stream) {
                const nodeName = Object.keys(chunk)[0];
                const output = (chunk as any)[nodeName];

                if (output && output.messages) {
                    const newMsgs = output.messages;
                    for (const msg of newMsgs) {
                        let role: 'assistant' | 'tool' | 'system' = 'assistant';
                        if (msg instanceof ToolMessage) role = 'tool';
                        else if (msg instanceof SystemMessage) role = 'system';
                        else if (msg instanceof AIMessage) role = 'assistant';
                        
                        const formattedMsg = {
                            role,
                            content: (msg.content as string) || '',
                            tool_calls: (msg as any).tool_calls,
                            tool_call_id: (msg as any).tool_call_id,
                            name: (msg as any).name,
                            args: (msg as any).args
                        };
                        
                        dispatch({ type: 'ADD_MESSAGE', payload: formattedMsg });
                        saveMessage(sessionId, formattedMsg);
                        
                        if (role === 'tool') {
                            dispatch({ type: 'SET_AGENT_STATE', payload: 'acting' });
                        } else {
                            dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });
                        }

                        if (role === 'assistant' && formattedMsg.content) {
                            await vectorMemory.addMessage(formattedMsg.content, { role: 'assistant', timestamp: Date.now(), sessionId });
                        }
                    }
                }
            }

            // Automatic Titling after first response
            if (state.messages.length === 0) {
                try {
                    const titlePrompt = [
                        { role: 'system' as const, content: 'You are a session titler. Generate a very short, 3-5 word title for this conversation based on the user\'s first message. Return ONLY the title, no quotes or punctuation.' },
                        userMsg
                    ];
                    const titleResponse = await activeProvider.instance.chat(titlePrompt, []);
                    if (titleResponse.content) {
                        const newTitle = titleResponse.content.trim().slice(0, 50);
                        updateSessionName(sessionId, newTitle);
                        setSessionList(getSessions());
                    }
                } catch (e) {
                    // Ignore titling errors
                }
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Handled
            } else {
                const errorMsg = { role: 'system' as const, content: `Error: ${error?.message || String(error)}` };
                dispatch({ type: 'ADD_MESSAGE', payload: errorMsg });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'error' });
            }
        } finally {
            dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
            abortControllerRef.current = null;
        }
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
                    onDelete={(id) => {
                        deleteSession(id);
                        const updated = getSessions();
                        setSessionList(updated);
                        if (id === sessionId) {
                            // If deleting active session, create a new one
                            const newSid = Number(createSession());
                            setSessionId(newSid);
                            dispatch({ type: 'SET_MESSAGES', payload: [] });
                        }
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

console.clear();
render(
    <AppProvider>
        <App />
    </AppProvider>
);
