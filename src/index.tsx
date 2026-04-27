#!/usr/bin/env node
import React, {useEffect, useState, useCallback, useRef, useMemo} from 'react';
import {render, Box, useInput, Text, useStdout} from 'ink';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import {initSchema} from './database/schema.js';
import {AppProvider, useAppContext, Task} from './core/AppContext.js';
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
import {getSystemPrompt} from './core/Prompts.js';
import {createAgentWorkflow} from './core/Workflow.js';
import {HumanMessage, AIMessage, SystemMessage, ToolMessage} from '@langchain/core/messages';
import { MemorySaver } from "@langchain/langgraph";
import { Client } from "langsmith";
import { Message } from './core/AppContext.js';

const checkpointer = new MemorySaver();

/**
 * Rebuilds the LangGraph MemorySaver checkpoint from saved DB messages so the
 * LLM sees full conversation history when a session is loaded or switched.
 */
const hydrateCheckpointer = async (
    sessionId: number,
    messages: Message[],
    provider: any,
    plannerMode: boolean
) => {
    if (messages.length === 0) return;

    const appWorkflow = createAgentWorkflow(provider, checkpointer, false);
    const config = { configurable: { thread_id: sessionId.toString() } };

    // Convert DB Message records to LangChain message objects
    const langchainMessages: any[] = [
        new SystemMessage(getSystemPrompt(plannerMode))
    ];

    for (const msg of messages) {
        if (msg.role === 'user') {
            langchainMessages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
            const aiMsg = new AIMessage({
                content: msg.content || '',
                tool_calls: msg.tool_calls ?? undefined,
            });
            langchainMessages.push(aiMsg);
        } else if (msg.role === 'tool') {
            langchainMessages.push(
                new ToolMessage({
                    content: msg.content,
                    tool_call_id: msg.tool_call_id || 'unknown',
                    name: msg.name || 'tool',
                })
            );
        }
    }

    try {
        await appWorkflow.updateState(config, { messages: langchainMessages });
    } catch {
        // Non-fatal: if hydration fails the agent will still work, just without history in LLM context
    }
};

const App = () => {
    const {state, dispatch} = useAppContext();
    const {stdout} = useStdout();
    const [terminalSize, setTerminalSize] = useState({columns: stdout.columns || 80, rows: stdout.rows || 24});
    const [tasks, setTasks] = useState<{name: string, enabled: boolean}[]>([]);
    const [systemStats, setSystemStats] = useState({ cpu: '0.00', memory: '0.00' });
    const [view, setView] = useState<'chat' | 'settings' | 'sessions'>('chat');
    const [sessionId, setSessionId] = useState<number>(0);
    const [sessionList, setSessionList] = useState<{id: number, name: string, created_at: string}[]>([]);
    const [scrollOffset, setScrollOffset] = useState(0);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        const onResize = () => {
            setTerminalSize({columns: stdout.columns, rows: stdout.rows});
        };
        stdout.on('resize', onResize);
        return () => {
            stdout.off('resize', onResize);
        };
    }, [stdout]);


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
                        const errorMsg = e?.error?.message || e?.message || String(e);
                        setActiveProvider(prev => ({ ...prev, error: `Init Failed: ${errorMsg}` }));
                    }
                }
                return nextView;
            });
            return;
        }

        if (key.tab && key.shift) {
            const modes: ('approval' | 'auto-accept' | 'yolo')[] = ['approval', 'auto-accept', 'yolo'];
            const currentIndex = modes.indexOf(state.interactionMode);
            const nextMode = modes[(currentIndex + 1) % modes.length];
            dispatch({ type: 'SET_INTERACTION_MODE', payload: nextMode });
            return;
        }

        if (state.agentState === 'awaiting_approval') {
            if (input === 'y') {
                handleApprove();
                return;
            }
            if (input === 'n') {
                handleDeny();
                return;
            }
        }

        if (input === 'x' && key.ctrl) {
            dispatch({ type: 'CLEAR_QUEUE' });
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: '🛑 Execution stopped and queue cleared.' } });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
            }
            return;
        }

        if (view === 'chat') {
            if (input === 'l' && key.ctrl) {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
                dispatch({ type: 'CLEAR_QUEUE' });
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

        // Hydrate LangGraph checkpointer so the LLM has full session history in context
        if (initialMessages.length > 0 && activeProvider.instance) {
            hydrateCheckpointer(
                Number(currentSid),
                initialMessages,
                activeProvider.instance,
                configManager.getSettings().plannerMode
            );
        }

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

    const processStream = useCallback(async (stream: any, sessionId: number) => {
        try {
            // If in planner mode and we have pending tasks, mark the first one as in-progress
            if (configManager.getSettings().plannerMode && state.taskQueue.length > 0) {
                const firstPending = state.taskQueue.find(t => t.status === 'pending');
                if (firstPending && !state.taskQueue.some(t => t.status === 'in-progress')) {
                    dispatch({ type: 'UPDATE_TASK', payload: { id: firstPending.id, status: 'in-progress' } });
                }
            }

            for await (const chunk of stream) {
                const nodeName = Object.keys(chunk)[0];
                const output = (chunk as any)[nodeName];

                if (output && output.taskQueue) {
                    dispatch({ type: 'SET_QUEUE', payload: output.taskQueue });
                }

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
                            
                            // Task Parsing logic
                            if (formattedMsg.content.includes('PLAN:')) {
                                try {
                                    // Robust parsing for JSON blocks
                                    const planPart = formattedMsg.content.split('PLAN:')[1];
                                    const jsonMatch = planPart.match(/```json\s*([\s\S]*?)```/) || planPart.match(/\[([\s\S]*?)\]/);
                                    
                                    if (jsonMatch) {
                                        const jsonStr = jsonMatch[0].startsWith('```') ? jsonMatch[1] : jsonMatch[0];
                                        const tasks = JSON.parse(jsonStr.trim());
                                        if (Array.isArray(tasks)) {
                                            const formattedTasks = tasks.map((t: any) => ({
                                                id: String(t.id || Math.random().toString(36).slice(2, 9)),
                                                description: t.description || String(t),
                                                status: 'pending' as const
                                            }));
                                            dispatch({ type: 'SET_QUEUE', payload: formattedTasks });
                                        }
                                    }
                                } catch (e) { /* ignore parse errors */ }
                            }

                            if (formattedMsg.content.includes('COMPLETED:')) {
                                const match = formattedMsg.content.match(/COMPLETED:\s*(\w+)/);
                                if (match && match[1]) {
                                    dispatch({ type: 'UPDATE_TASK', payload: { id: match[1], status: 'completed' } });
                                }
                            }
                        }
                    }
                }
            }

            const appWorkflow = createAgentWorkflow(activeProvider.instance, checkpointer, state.interactionMode === 'approval');
            const config = { configurable: { thread_id: sessionId.toString() } };
            
            // Sync current task queue into graph state before checking
            await appWorkflow.updateState(config, { taskQueue: state.taskQueue });
            
            const graphState = await appWorkflow.getState(config);

            if (graphState.next.length > 0 && state.interactionMode === 'approval') {
                dispatch({ type: 'SET_AGENT_STATE', payload: 'awaiting_approval' });
                const lastMsg = graphState.values.messages[graphState.values.messages.length - 1];
                if (lastMsg && (lastMsg as any).tool_calls) {
                    dispatch({ type: 'SET_PENDING_TOOL', payload: (lastMsg as any).tool_calls });
                }
            } else {
                dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
            }
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Handled
            } else {
                let errorMessage = error?.message || String(error);
                if (error?.error?.message) errorMessage = `${errorMessage} - ${error.error.message}`;
                const errorMsg = { role: 'system' as const, content: `Error: ${errorMessage}` };
                dispatch({ type: 'ADD_MESSAGE', payload: errorMsg });
                dispatch({ type: 'SET_AGENT_STATE', payload: 'error' });
            }
        } finally {
            abortControllerRef.current = null;
        }
    }, [activeProvider, state.interactionMode, vectorMemory, dispatch, state.taskQueue]);

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
                    spawnSync('vim', [filePath], { stdio: 'inherit' });
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
                    dispatch({ type: 'CLEAR_QUEUE' });
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Switched to new session [${newSid}]` } });
                    return;
                }
                if (subCommand === 'load') {
                    const targetId = parseInt(parts[2]);
                    if (!isNaN(targetId)) {
                        setSessionId(targetId);
                        const msgs = getMessages(targetId);
                        dispatch({ type: 'SET_MESSAGES', payload: msgs });
                        dispatch({ type: 'CLEAR_QUEUE' });

                        // Hydrate checkpointer so LLM has full history for resumed session
                        if (msgs.length > 0 && activeProvider.instance) {
                            hydrateCheckpointer(
                                targetId,
                                msgs,
                                activeProvider.instance,
                                configManager.getSettings().plannerMode
                            );
                        }

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
                            dispatch({ type: 'CLEAR_QUEUE' });
                        }
                        dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Deleted session [${targetId}]` } });
                        return;
                    }
                }
            }

            if (command === 'task') {
                const desc = parts.slice(1).join(' ');
                if (!desc) {
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Usage: /task <description>' } });
                    return;
                }
                const newTask: Task = { id: Math.random().toString(36).slice(2, 9), description: desc, status: 'pending' };
                dispatch({ type: 'ADD_TASK', payload: newTask });
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Added task: ${desc}` } });
                return;
            }

            if (command === 'clear') {
                dispatch({ type: 'SET_MESSAGES', payload: [] });
                dispatch({ type: 'CLEAR_QUEUE' });
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

        const appWorkflow = createAgentWorkflow(
            activeProvider.instance, 
            checkpointer, 
            state.interactionMode === 'approval'
        );
        
        // Sync current task queue into graph state
        const config = {
            configurable: { thread_id: sessionId.toString() },
            recursionLimit: configManager.getSettings().recursionLimit || 50
        };
        await appWorkflow.updateState(config, { taskQueue: state.taskQueue });

        // We only pass the NEWEST message. 
        // LangGraph's MemorySaver (checkpointer) will handle the history via thread_id.
        const inputMessages: any[] = [];
        if (state.messages.length === 0) {
            inputMessages.push(new SystemMessage(getSystemPrompt(configManager.getSettings().plannerMode)));
        }
        inputMessages.push(new HumanMessage(text));

        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });

        const stream = await appWorkflow.stream({ messages: inputMessages }, config);
        await processStream(stream, sessionId);
    }, [activeProvider, state.messages, state.interactionMode, vectorMemory, tasks, dispatch, sessionId, processStream, state.taskQueue]);

    const handleApprove = useCallback(async () => {
        if (state.agentState !== 'awaiting_approval') return;
        dispatch({ type: 'SET_AGENT_STATE', payload: 'acting' });
        dispatch({ type: 'SET_PENDING_TOOL', payload: null });

        const appWorkflow = createAgentWorkflow(activeProvider.instance, checkpointer, state.interactionMode === 'approval');
        const config = {
            configurable: { thread_id: sessionId.toString() },
            recursionLimit: configManager.getSettings().recursionLimit || 50
        };

        const stream = await appWorkflow.stream(null, config);
        await processStream(stream, sessionId);
    }, [state.agentState, state.interactionMode, activeProvider, sessionId, processStream]);

    const handleDeny = useCallback(async () => {
        if (state.agentState !== 'awaiting_approval' || !state.pendingToolCall) return;
        
        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });
        
        const appWorkflow = createAgentWorkflow(activeProvider.instance, checkpointer, state.interactionMode === 'approval');
        const config = {
            configurable: { thread_id: sessionId.toString() },
            recursionLimit: configManager.getSettings().recursionLimit || 50
        };

        const toolCalls = state.pendingToolCall;
        const denialMessages = toolCalls.map((tc: any) => 
            new ToolMessage({
                content: "User denied this action.",
                tool_call_id: tc.id,
                name: tc.name
            })
        );

        await appWorkflow.updateState(config, { messages: denialMessages });
        dispatch({ type: 'SET_PENDING_TOOL', payload: null });

        const stream = await appWorkflow.stream(null, config);
        await processStream(stream, sessionId);
    }, [state.agentState, state.pendingToolCall, state.interactionMode, activeProvider, sessionId, processStream]);

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
                        dispatch({ type: 'CLEAR_QUEUE' });

                        // Hydrate checkpointer so LLM has full history for resumed session
                        if (msgs.length > 0 && activeProvider.instance) {
                            hydrateCheckpointer(
                                id,
                                msgs,
                                activeProvider.instance,
                                configManager.getSettings().plannerMode
                            );
                        }

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
                        interactionMode={state.interactionMode}
                        plannerMode={configManager.getSettings().plannerMode}
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
                                    height={terminalSize.rows - 12} 
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
                        
                        <Sidebar 
                            systemStats={systemStats} 
                            tasks={tasks} 
                            sessions={sessionList} 
                            currentSessionId={sessionId} 
                            taskQueue={state.taskQueue}
                            plannerMode={configManager.getSettings().plannerMode}
                        />
                    </Box>

                    <ToolStatus activeTools={state.activeTools} agentState={state.agentState} pendingToolCall={state.pendingToolCall} />
                    
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
