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
import {vectorMemory} from './database/vectorStore.js';
import {configManager} from './core/ConfigManager.js';
import {ProviderFactory} from './core/providers/ProviderFactory.js';
import {getTools} from './tools/index.js';
import {getSystemPrompt} from './core/Prompts.js';
import {createAgentWorkflow} from './core/Workflow.js';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage, filterMessages, mergeMessageRuns, BaseMessage } from '@langchain/core/messages';
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { REMOVE_ALL_MESSAGES } from "@langchain/langgraph";
import { Client } from "langsmith";
import { Message } from './core/AppContext.js';
import path from 'path';
import { GLOBAL_DIR } from './core/ConfigManager.js';

const checkpointer = SqliteSaver.fromConnString(path.join(GLOBAL_DIR, 'checkpoints.sqlite'));


const ensureString = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content.map(part => {
            if (typeof part === 'string') return part;
            if (part && typeof part === 'object') {
                if ('text' in part) return part.text;
                return JSON.stringify(part);
            }
            return '';
        }).join('');
    }
    if (content && typeof content === 'object') return JSON.stringify(content);
    return String(content || '');
};

/**
 * Background helper to sync local UI state (like aborted tool calls or task queue updates)
 * into the persistent LangGraph checkpointer.
 */
const syncGraphState = async (
    sessionId: number,
    provider: any,
    interactionMode: any,
    checkpointer: any,
    shortTermMemoryLimit: number,
    payload: { messages?: BaseMessage[], taskQueue?: Task[] }
) => {
    if (!provider) return;
    try {
        const appWorkflow = createAgentWorkflow(provider, interactionMode, checkpointer, shortTermMemoryLimit);
        const config = { configurable: { thread_id: sessionId.toString() } };
        await appWorkflow.updateState(config, payload);
    } catch (e) {
        // Silently fail background syncs
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

    const [vm] = useState(() => vectorMemory);

    const totalLines = useMemo(() => {
        let count = 0;
        state.messages.forEach((msg, i) => {
            const isFirstTool = msg.role === 'tool' && (i === 0 || state.messages[i - 1].role !== 'tool');
            if (msg.role !== 'tool' || isFirstTool) count += 1; // Header (e.g. 🤖 ASSISTANT)
            
            if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
                count += msg.tool_calls.length;
            }

            const content = ensureString(msg.content);
            if (msg.role === 'tool') {
                count += 1; // 🛠️ RESULT header
                const isEdit = msg.name === 'edit_file';
                const result = isEdit ? content : (content.length > 500 ? content.slice(0, 500) + '...' : content);
                count += result.split('\n').length;
            } else if (content) {
                count += content.split('\n').length;
            }
            count += 1; // Spacing
        });
        return count;
    }, [state.messages]);

    useInput((input, key) => {
        if (key.escape && state.agentState !== 'idle') {
            if (abortControllerRef.current) {
                try {
                    abortControllerRef.current.abort();
                } catch (e) {
                    // Ignore errors during abort
                }

                // If we aborted, any in-progress tasks should be marked as failed
                const inProgressTask = state.taskQueue.find(t => t.status === 'in-progress');
                if (inProgressTask) {
                    dispatch({ type: 'UPDATE_TASK', payload: { id: inProgressTask.id, status: 'failed' } });
                }

                // If we aborted while tools were pending, we MUST add ToolMessages to history
                // otherwise Anthropic will error on the next message in this session.
                if (state.pendingToolCall && Array.isArray(state.pendingToolCall)) {
                    const toolMessages: ToolMessage[] = [];
                    for (const tc of state.pendingToolCall) {
                        const toolMsg: Message = {
                            role: 'tool',
                            content: '🛑 Operation cancelled by user. Discard this intent and wait for next instructions.',
                            tool_call_id: tc.id,
                            name: tc.name
                        };
                        dispatch({ type: 'ADD_MESSAGE', payload: toolMsg });
                        saveMessage(sessionId, toolMsg);
                        
                        toolMessages.push(new ToolMessage({
                            content: '🛑 Operation cancelled by user. Discard this intent and wait for next instructions.',
                            tool_call_id: tc.id,
                            name: tc.name
                        }));
                    }

                    // Sync the LangGraph checkpointer state as well
                    // We also sync the taskQueue update
                    const updatedQueue = state.taskQueue.map(t => 
                        t.id === inProgressTask?.id ? { ...t, status: 'failed' as const } : t
                    );
                    syncGraphState(
                        sessionId,
                        activeProvider.instance,
                        state.interactionMode,
                        checkpointer,
                        configManager.getSettings().shortTermMemoryLimit,
                        { 
                            messages: toolMessages,
                            taskQueue: updatedQueue
                        }
                    );

                    dispatch({ type: 'SET_PENDING_TOOL', payload: null });
                } else if (inProgressTask) {
                    // Even if no tool call was pending, sync the failed task state
                    const updatedQueue = state.taskQueue.map(t => 
                        t.id === inProgressTask.id ? { ...t, status: 'failed' as const } : t
                    );
                    syncGraphState(
                        sessionId,
                        activeProvider.instance,
                        state.interactionMode,
                        checkpointer,
                        configManager.getSettings().shortTermMemoryLimit,
                        { taskQueue: updatedQueue }
                    );
                }

                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: '🛑 Operation cancelled by user.' } });
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
                            vm.init();
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
                syncGraphState(
                    sessionId,
                    activeProvider.instance,
                    state.interactionMode,
                    checkpointer,
                    configManager.getSettings().shortTermMemoryLimit,
                    { messages: [REMOVE_ALL_MESSAGES as any] }
                );
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
        dispatch({ type: 'RESET_USAGE' });
        dispatch({ type: 'SET_INTERACTION_MODE', payload: configManager.getSettings().interactionMode as any });
        const initialMessages = getMessages(Number(currentSid), configManager.getSettings().shortTermMemoryLimit * 2);
        dispatch({ type: 'SET_MESSAGES', payload: initialMessages });



        vm.init();

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
    }, [vm]);

    const processStream = useCallback(async (stream: any, sessionId: number, userMessageText?: string) => {
        let accumulatedAssistantContent = "";
        try {
            // ... (rest of logic before loop)
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
                        // Extract token usage if available
                        const usage = (msg as any).usage_metadata || (msg as any).additional_kwargs?.usage || (msg as any).response_metadata?.usage;
                        if (usage) {
                            // Anthropic: cache_read_input_tokens / cache_creation_input_tokens
                            // OpenAI: usage.prompt_tokens_details.cached_tokens
                            const cachedTokens =
                                usage.cache_read_input_tokens ||
                                (usage.prompt_tokens_details?.cached_tokens) ||
                                0;

                            dispatch({
                                type: 'UPDATE_USAGE',
                                payload: {
                                    input: usage.input_tokens || usage.prompt_tokens || 0,
                                    output: usage.output_tokens || usage.completion_tokens || 0,
                                    total: usage.total_tokens || 0,
                                    cached: cachedTokens,
                                }
                            });
                        }

                        let role: 'assistant' | 'tool' | 'system' = 'assistant';
                        if (msg instanceof ToolMessage) role = 'tool';
                        else if (msg instanceof SystemMessage) role = 'system';
                        else if (msg instanceof AIMessage) role = 'assistant';
                        
                        const content = ensureString(msg.content);
                        const formattedMsg = {
                            role,
                            content: content,
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
                            accumulatedAssistantContent += (accumulatedAssistantContent ? "\n" : "") + formattedMsg.content;
                            
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
                                                status: 'pending' as const,
                                                recursiveLimit: t.recursiveLimit,
                                                parentTaskId: t.parentTaskId
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

            // At the end of the stream, embed the exchange pair with context
            if (userMessageText && accumulatedAssistantContent) {
                // Get immediate prior context for the overlap window (+1/-1 adjacent pairs)
                // We take the last 2 messages before this exchange
                const priorMsgs = state.messages.slice(-2);
                const priorContext = priorMsgs.map(m => `${m.role.toUpperCase()}: ${ensureString(m.content)}`).join("\n");
                
                const fullChunk = (priorContext ? `--- PRIOR CONTEXT ---\n${priorContext}\n--- CURRENT TURN ---\n` : "") +
                                `USER: ${userMessageText}\nASSISTANT: ${accumulatedAssistantContent}`;
                
                await vm.addMessage(fullChunk, { 
                    role: 'exchange', 
                    timestamp: Date.now(), 
                    sessionId 
                });
            }

            const appWorkflow = createAgentWorkflow(activeProvider.instance, state.interactionMode, checkpointer, configManager.getSettings().shortTermMemoryLimit);
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
                dispatch({ type: 'RESET_STATS' });
                syncGraphState(
                    sessionId,
                    activeProvider.instance,
                    state.interactionMode,
                    checkpointer,
                    configManager.getSettings().shortTermMemoryLimit,
                    { messages: [REMOVE_ALL_MESSAGES as any] }
                );
                return;
            }
            if (command === 'mode') {
                const newMode = parts[1]?.toLowerCase();
                if (newMode === 'approval' || newMode === 'yolo' || newMode === 'auto-accept') {
                    dispatch({ type: 'SET_INTERACTION_MODE', payload: newMode as any });
                    configManager.save({ ...configManager.getSettings(), interactionMode: newMode as any });
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Interaction mode changed to ${newMode.toUpperCase()}` } });
                } else {
                    dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: `Current mode: ${state.interactionMode.toUpperCase()}. Usage: /mode [approval|yolo|auto-accept]` } });
                }
                return;
            }

            if (command === 'help') {
                dispatch({ type: 'ADD_MESSAGE', payload: { role: 'system', content: 'Commands: /session [list|new|load <id>|delete <id>], /clear, /help, /tasks, /code <file>, /mode [approval|yolo|auto-accept]' } });
                return;
            }
        }

        let userMsg = { role: 'user' as const, content: text };
        dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
        saveMessage(sessionId, userMsg);
        await vm.addMessage(text, { role: 'user', timestamp: Date.now(), sessionId });

        // Auto-rename session if it's the first message
        if (state.messages.length === 0) {
            (async () => {
                try {
                    const prompt = `Summarize this user request into a short, concise session title (max 5 words). Do not use quotes or special characters.\n\nRequest: ${text}`;
                    const response = await activeProvider.instance.chat([{ role: 'user', content: prompt }]);
                    if (response && response.content) {
                        const newName = response.content.replace(/["']/g, '').trim();
                        updateSessionName(sessionId, newName);
                        setSessionList(getSessions());
                    }
                } catch (e) {
                    // Silently fail session renaming
                }
            })();
        }

        const appWorkflow = createAgentWorkflow(
            activeProvider.instance, 
            state.interactionMode,
            checkpointer,
            configManager.getSettings().shortTermMemoryLimit
        );
        
        const config = {
            configurable: { 
                thread_id: sessionId.toString(), 
                plannerMode: configManager.getSettings().plannerMode,
                onToolCall: (name: string, ms: number) => {
                    dispatch({ type: 'UPDATE_TOOL_STATS', payload: { name, ms } });
                }
            },
            recursionLimit: configManager.getSettings().recursionLimit || 15,
            signal: abortControllerRef.current?.signal
        };

        // Pre-stream sanitization: If the graph state ends in an orphaned tool_use, 
        // we MUST resolve it before streaming, otherwise the graph will immediately
        // execute that tool before seeing the new human message.
        try {
            const currentState = await appWorkflow.getState(config);
            const history = currentState.values.messages || [];
            const lastMsg = history[history.length - 1];
            
            if (lastMsg && lastMsg._getType() === 'ai' && (lastMsg as any).tool_calls?.length) {
                const toolMessages = (lastMsg as any).tool_calls.map((tc: any) => new ToolMessage({
                    content: '🛑 Operation cancelled by user. Discard this intent.',
                    tool_call_id: tc.id,
                    name: tc.name
                }));
                await appWorkflow.updateState(config, { messages: toolMessages });
            }
        } catch (e) { /* ignore state check errors */ }

        await appWorkflow.updateState(config, { taskQueue: state.taskQueue });

        // We only pass the NEWEST message. 
        // LangGraph's MemorySaver (checkpointer) will handle the history via thread_id.
        const inputMessages: any[] = [];
        if (state.messages.length === 0) {
            inputMessages.push(new SystemMessage(getSystemPrompt(configManager.getSettings().plannerMode)));
        }
        inputMessages.push(new HumanMessage(text));

        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });

        try {
            const stream = await appWorkflow.stream({ messages: inputMessages }, config);
            await processStream(stream, sessionId, text);
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Handled in useInput and processStream
            } else {
                throw error;
            }
        }
    }, [activeProvider, state.messages, state.interactionMode, vectorMemory, tasks, dispatch, sessionId, processStream, state.taskQueue]);

    const handleApprove = useCallback(async () => {
        if (state.agentState !== 'awaiting_approval') return;
        dispatch({ type: 'SET_AGENT_STATE', payload: 'acting' });
        dispatch({ type: 'SET_PENDING_TOOL', payload: null });

        const appWorkflow = createAgentWorkflow(activeProvider.instance, state.interactionMode, checkpointer, configManager.getSettings().shortTermMemoryLimit);
        
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const config = {
            configurable: { 
                thread_id: sessionId.toString(), 
                plannerMode: configManager.getSettings().plannerMode,
                onToolCall: (name: string, ms: number) => {
                    dispatch({ type: 'UPDATE_TOOL_STATS', payload: { name, ms } });
                }
            },
            recursionLimit: configManager.getSettings().recursionLimit || 15,
            signal: controller.signal
        };

        try {
            const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user')?.content || "";
            const stream = await appWorkflow.stream(null, config);
            await processStream(stream, sessionId, ensureString(lastUserMsg));
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Handled in useInput and processStream
            } else {
                throw error;
            }
        }
    }, [state.agentState, state.interactionMode, activeProvider, sessionId, processStream]);

    const handleDeny = useCallback(async () => {
        if (state.agentState !== 'awaiting_approval' || !state.pendingToolCall) return;
        
        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });
        
        const appWorkflow = createAgentWorkflow(activeProvider.instance, state.interactionMode, checkpointer, configManager.getSettings().shortTermMemoryLimit);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const config = {
            configurable: { 
                thread_id: sessionId.toString(), 
                plannerMode: configManager.getSettings().plannerMode,
                onToolCall: (name: string, ms: number) => {
                    dispatch({ type: 'UPDATE_TOOL_STATS', payload: { name, ms } });
                }
            },
            recursionLimit: configManager.getSettings().recursionLimit || 15,
            signal: controller.signal
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

        try {
            const lastUserMsg = [...state.messages].reverse().find(m => m.role === 'user')?.content || "";
            const stream = await appWorkflow.stream(null, config);
            await processStream(stream, sessionId, ensureString(lastUserMsg));
        } catch (error: any) {
            if (error?.name === 'AbortError') {
                // Handled in useInput and processStream
            } else {
                throw error;
            }
        }
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
                        dispatch({ type: 'RESET_USAGE' });
                        const msgs = getMessages(id);
                        dispatch({ type: 'SET_MESSAGES', payload: msgs });
                        dispatch({ type: 'CLEAR_QUEUE' });


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
                            dispatch({ type: 'RESET_USAGE' });
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
                        totalUsage={state.totalUsage}
                        toolStats={state.toolStats}
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
