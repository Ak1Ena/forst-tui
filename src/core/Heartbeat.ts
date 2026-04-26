import { EventEmitter } from 'events';

export type BackgroundTask = {
    id: string;
    name: string;
    description: string;
    interval: number; // in milliseconds
    execute: () => Promise<any>;
};

class Heartbeat extends EventEmitter {
    private tasks: Map<string, BackgroundTask> = new Map();
    private activeTasks: Set<string> = new Set();
    private intervals: Map<string, NodeJS.Timeout> = new Map();

    registerTask(task: BackgroundTask) {
        this.tasks.set(task.id, task);
    }

    enableTask(id: string) {
        const task = this.tasks.get(id);
        if (task && !this.activeTasks.has(id)) {
            this.activeTasks.add(id);
            const intervalId = setInterval(async () => {
                try {
                    const result = await task.execute();
                    this.emit('task-result', { id, result });
                } catch (error) {
                    this.emit('task-error', { id, error });
                }
            }, task.interval);
            this.intervals.set(id, intervalId);
        }
    }

    disableTask(id: string) {
        const intervalId = this.intervals.get(id);
        if (intervalId) {
            clearInterval(intervalId);
            this.intervals.delete(id);
            this.activeTasks.delete(id);
        }
    }

    getTasks() {
        return Array.from(this.tasks.values()).map(t => ({
            ...t,
            enabled: this.activeTasks.has(t.id)
        }));
    }
}

export const heartbeat = new Heartbeat();
