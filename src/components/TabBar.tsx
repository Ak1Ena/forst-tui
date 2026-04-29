import React from 'react';
import { Box, Text } from 'ink';

interface Tab {
    id: string;
    label: string;
    icon?: string;
}

interface Props {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (id: string) => void;
}

export const TabBar = ({ tabs, activeTab, onTabChange }: Props) => {
    return (
        <Box flexDirection="row" borderStyle="round" borderColor="blue" paddingX={1} marginBottom={0}>
            {tabs.map((tab, index) => {
                const isActive = activeTab === tab.id;
                return (
                    <Box key={tab.id} marginRight={2}>
                        <Text 
                            color={isActive ? 'yellow' : 'white'} 
                            bold={isActive}
                            underline={isActive}
                        >
                            <Text color="blue">{index + 1}</Text> {tab.icon} {tab.label}
                        </Text>
                    </Box>
                );
            })}
            <Box flexGrow={1} />
            <Text color="gray" italic>
                Ctrl+S: Settings | Ctrl+R: Sessions | 1-3: Switch Tabs
            </Text>
        </Box>
    );
};
