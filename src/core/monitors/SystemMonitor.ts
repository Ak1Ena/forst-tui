import si from 'systeminformation';
import { BackgroundTask } from '../Heartbeat.js';

export const systemMonitorTask: BackgroundTask = {
    id: 'system-monitor',
    name: 'System Monitor',
    description: 'Monitors CPU and Memory usage.',
    interval: 5000,
    execute: async () => {
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        return {
            cpu: cpu.currentLoad.toFixed(2),
            memory: (mem.active / mem.total * 100).toFixed(2)
        };
    }
};
