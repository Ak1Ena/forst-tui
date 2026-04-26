import React, {useEffect, useState} from 'react';
import {render, Box, useInput} from 'ink';
import {initSchema} from './database/schema.js';
import {AppProvider, useAppContext} from './core/AppContext.js';
import {heartbeat} from './core/Heartbeat.js';
import {systemMonitorTask} from './core/monitors/SystemMonitor.js';
import {ChatView} from './components/ChatView.js';
import {InputBar} from './components/InputBar.js';
import {ToolStatus} from './components/ToolStatus.js';
import {StatusHeader} from './components/StatusHeader.js';
import {Sidebar} from './components/Sidebar.js';
import {GeminiProvider} from './core/providers/GeminiProvider.js';
import {saveMessage, getMessages} from './database/messages.js';
import {VectorMemory} from './database/vectorStore.js';

const App = () => {
    const {state, dispatch} = useAppContext();
    const [tasks, setTasks] = useState<{name: string, enabled: boolean}[]>([]);
    const [systemStats, setSystemStats] = useState({ cpu: '0.00', memory: '0.00' });

    useInput((input, key) => {
        if (input === 'l' && key.ctrl) {
            dispatch({ type: 'SET_MESSAGES', payload: [] });
        }
    });
    
    // Initialize Provider (Mocking API key for now)
    const apiKey = process.env['GOOGLE_GENERATIVE_AI_API_KEY'] || 'mock-key';
    const provider = new GeminiProvider({
        apiKey: apiKey,
        model: 'gemini-pro'
    });

    const [vectorMemory] = useState(() => new VectorMemory(apiKey));

    useEffect(() => {
        initSchema();
        vectorMemory.init();
        
        // Load initial messages
        const initialMessages = getMessages();
        dispatch({ type: 'SET_MESSAGES', payload: initialMessages });

        // Register background tasks
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
    }, []);

    const handleSendMessage = async (text: string) => {
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

        const userMsg = { role: 'user' as const, content: text };
        dispatch({ type: 'ADD_MESSAGE', payload: userMsg });
        saveMessage(userMsg);
        await vectorMemory.addMessage(text, { role: 'user', timestamp: Date.now() });

        dispatch({ type: 'SET_AGENT_STATE', payload: 'thinking' });
        
        try {
            // Simplified agent call
            const response = await provider.chat([...state.messages, userMsg]);
            
            dispatch({ type: 'ADD_MESSAGE', payload: response });
            saveMessage(response);
            await vectorMemory.addMessage(response.content, { role: 'assistant', timestamp: Date.now() });
        } catch (error: any) {
            const errorMsg = { role: 'system' as const, content: `Error: ${error.message}` };
            dispatch({ type: 'ADD_MESSAGE', payload: errorMsg });
            dispatch({ type: 'SET_AGENT_STATE', payload: 'error' });
        } finally {
            dispatch({ type: 'SET_AGENT_STATE', payload: 'idle' });
        }
    };

    return (
        <Box flexDirection="column" height="100%">
            <StatusHeader 
                provider="Gemini" 
                model="gemini-pro" 
                agentState={state.agentState} 
            />
            
            <Box flexGrow={1} flexDirection="row" marginTop={1}>
                <Box flexGrow={1} borderStyle="single" borderColor="blue">
                    <ChatView messages={state.messages} />
                </Box>
                
                <Sidebar systemStats={systemStats} tasks={tasks} />
            </Box>

            <ToolStatus activeTools={state.activeTools} agentState={state.agentState} />
            
            <Box marginTop={0}>
                <InputBar onSubmit={handleSendMessage} />
            </Box>
        </Box>
    );
};

render(
    <AppProvider>
        <App />
    </AppProvider>
);
