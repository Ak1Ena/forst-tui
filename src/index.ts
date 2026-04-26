import React, {useEffect} from 'react';
import {render, Text} from 'ink';
import {initSchema} from './database/schema.js';
import {AppProvider} from './core/AppContext.js';
import {heartbeat} from './core/Heartbeat.js';
import {systemMonitorTask} from './core/monitors/SystemMonitor.js';

const App = () => {
    useEffect(() => {
        initSchema();
        
        // Register background tasks
        heartbeat.registerTask(systemMonitorTask);
        
        // For now, enable it by default to test, 
        // but later it will be user-controllable.
        heartbeat.enableTask('system-monitor');

        const handleResult = ({id, result}: {id: string, result: any}) => {
            // This will later be dispatched to global state
            // console.log(`Task ${id} result:`, result);
        };

        heartbeat.on('task-result', handleResult);

        return () => {
            heartbeat.off('task-result', handleResult);
            heartbeat.disableTask('system-monitor');
        };
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
