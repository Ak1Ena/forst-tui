import React from 'react';
import { Box, Text } from 'ink';

interface Props {
    systemStats?: { cpu: string; memory: string };
    tasks: { name: string; enabled: boolean }[];
    sessions?: { id: number; name: string }[];
    currentSessionId?: number;
}

export const Sidebar = ({ systemStats, tasks, sessions = [], currentSessionId }: Props) => {
    return (
        <Box flexDirection="column" paddingX={1} width={30} borderStyle="round" borderColor="gray">
            <Text bold color="cyan">📊 SYSTEM STATS</Text>
            <Box flexDirection="column" marginY={1}>
                <Text>CPU:    <Text color={Number(systemStats?.cpu) > 80 ? 'red' : 'green'}>{systemStats?.cpu || '0.00'}%</Text></Text>
                <Text>Memory: <Text color={Number(systemStats?.memory) > 80 ? 'red' : 'green'}>{systemStats?.memory || '0.00'}%</Text></Text>
            </Box>

            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginBottom={1} />

            <Text bold color="yellow">💬 SESSIONS</Text>
            <Box flexDirection="column" marginTop={1} marginBottom={1}>
                {sessions.slice(0, 5).map((s) => (
                    <Text key={s.id} color={s.id === currentSessionId ? 'green' : 'gray'}>
                        {s.id === currentSessionId ? '●' : '○'} {s.name.slice(0, 20)}
                    </Text>
                ))}
            </Box>

            <Box borderStyle="single" borderTop={false} borderLeft={false} borderRight={false} marginBottom={1} />

            <Text bold color="magenta">⚙️ BACKGROUND</Text>
            <Box flexDirection="column" marginTop={1}>
                {tasks.map((task, i) => (
                    <Box key={i} flexDirection="row">
                        <Text color={task.enabled ? 'green' : 'gray'}>
                            {task.enabled ? '●' : '○'} {task.name}
                        </Text>
                    </Box>
                ))}
            </Box>

            <Box flexGrow={1} />
            
            <Text color="gray" dimColor>v0.1.0-alpha</Text>
        </Box>
    );
};
