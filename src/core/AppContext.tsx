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

export type AgentState = 'idle' | 'thinking' | 'acting' | 'error';

interface State {
    messages: Message[];
    agentState: AgentState;
    activeTools: string[];
}

type Action =
    | { type: 'ADD_MESSAGE'; payload: Message }
    | { type: 'SET_MESSAGES'; payload: Message[] }
    | { type: 'SET_AGENT_STATE'; payload: AgentState }
    | { type: 'START_TOOL'; payload: string }
    | { type: 'STOP_TOOL'; payload: string };

const initialState: State = {
    messages: [],
    agentState: 'idle',
    activeTools: [],
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
