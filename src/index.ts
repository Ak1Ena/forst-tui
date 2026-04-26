import React, {useEffect} from 'react';
import {render, Text} from 'ink';
import {initSchema} from './database/schema.js';
import {AppProvider} from './core/AppContext.js';

const App = () => {
    useEffect(() => {
        initSchema();
    }, []);

    return (
        <Text>
            Hello, <Text color="green">forst-tui</Text>!
        </Text>
    );
};

render(
    <AppProvider>
        <App />
    </AppProvider>
);
