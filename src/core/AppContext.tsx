import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export type Message = {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    id?: number;
    tool_calls?: any[];
    tool_call_id?: string;
    name?: string;
    args?: any;
};

export type AgentState = 'idle' | 'thinking' | 'acting' | 'error' | 'awaiting_approval';

export type InteractionMode = 'approval' | 'auto-accept' | 'yolo';

export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'failed';

export type Task = {
    id: string;
    description: string;
    status: TaskStatus;
};

export type TokenUsage = {
    input: number;
    output: number;
    total: number;
};

interface State {
    messages: Message[];
    agentState: AgentState;
    activeTools: string[];
    interactionMode: InteractionMode;
    pendingToolCall?: any;
    taskQueue: Task[];
    totalUsage: TokenUsage;
}

type Action =
    | { type: 'ADD_MESSAGE'; payload: Message }
    | { type: 'SET_MESSAGES'; payload: Message[] }
    | { type: 'SET_AGENT_STATE'; payload: AgentState }
    | { type: 'START_TOOL'; payload: string }
    | { type: 'STOP_TOOL'; payload: string }
    | { type: 'SET_INTERACTION_MODE'; payload: InteractionMode }
    | { type: 'SET_PENDING_TOOL'; payload: any }
    | { type: 'ADD_TASK'; payload: Task }
    | { type: 'UPDATE_TASK'; payload: { id: string; status: TaskStatus } }
    | { type: 'CLEAR_QUEUE' }
    | { type: 'SET_QUEUE'; payload: Task[] }
    | { type: 'UPDATE_USAGE'; payload: Partial<TokenUsage> }
    | { type: 'RESET_USAGE' };

const initialState: State = {
    messages: [],
    agentState: 'idle',
    activeTools: [],
    interactionMode: 'yolo',
    taskQueue: [],
    totalUsage: { input: 0, output: 0, total: 0 }
};

const AppContext = createContext<{
    state: State;
    dispatch: React.Dispatch<Action>;
} | undefined>(undefined);

function appReducer(state: State, action: Action): State {
    switch (action.type) {
        case 'ADD_MESSAGE':
            return { ...state, messages: [...state.messages, action.payload] };
        case 'SET_MESSAGES':
            return { ...state, messages: action.payload };
        case 'SET_AGENT_STATE':
            return { ...state, agentState: action.payload };
        case 'START_TOOL':
            return { ...state, activeTools: [...state.activeTools, action.payload] };
        case 'STOP_TOOL':
            return { ...state, activeTools: state.activeTools.filter(t => t !== action.payload) };
        case 'SET_INTERACTION_MODE':
            return { ...state, interactionMode: action.payload };
        case 'SET_PENDING_TOOL':
            return { ...state, pendingToolCall: action.payload };
        case 'ADD_TASK':
            return { ...state, taskQueue: [...state.taskQueue, action.payload] };
        case 'UPDATE_TASK':
            return { 
                ...state, 
                taskQueue: state.taskQueue.map(t => t.id === action.payload.id ? { ...t, status: action.payload.status } : t) 
            };
        case 'CLEAR_QUEUE':
            return { ...state, taskQueue: [] };
        case 'SET_QUEUE':
            return { ...state, taskQueue: action.payload };
        case 'UPDATE_USAGE':
            const newUsage = {
                input: state.totalUsage.input + (action.payload.input || 0),
                output: state.totalUsage.output + (action.payload.output || 0),
                total: state.totalUsage.total + (action.payload.total || 0)
            };
            return { ...state, totalUsage: newUsage };
        case 'RESET_USAGE':
            return { ...state, totalUsage: { input: 0, output: 0, total: 0 } };
        default:
            return state;
    }
}

export const AppProvider = ({ children }: { children: ReactNode }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    return (
        <AppContext.Provider value={{ state, dispatch }}>
            {children}
        </AppContext.Provider>
    );
};

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within an AppProvider');
    }
    return context;
};
