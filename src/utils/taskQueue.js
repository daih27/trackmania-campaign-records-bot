import { log } from '../utils.js';

/**
 * Simple async task queue to prevent blocking
 */
class TaskQueue {
    constructor(name = 'default', concurrency = 1) {
        this.name = name;
        this.concurrency = concurrency;
        this.queue = [];
        this.running = 0;
        this.maxQueueSize = 100;
    }

    /**
     * Add a task to the queue
     * @param {Function} task - Async function to execute
     * @param {string} description - Task description for logging
     * @returns {Promise} Promise that resolves when task completes
     */
    enqueue(task, description = 'unnamed task') {
        if (this.queue.length >= this.maxQueueSize) {
            return Promise.reject(new Error(`Queue ${this.name} is full (${this.maxQueueSize} tasks)`));
        }

        return new Promise((resolve, reject) => {
            this.queue.push({
                task,
                description,
                resolve,
                reject,
                timestamp: Date.now()
            });

            log(`Task "${description}" added to queue ${this.name} (${this.queue.length} in queue)`);
            this.process();
        });
    }

    /**
     * Process tasks in the queue
     */
    async process() {
        if (this.running >= this.concurrency || this.queue.length === 0) {
            return;
        }

        this.running++;

        const item = this.queue.shift();
        const startTime = Date.now();

        try {
            log(`Starting task "${item.description}" from queue ${this.name}`);
            const result = await item.task();
            const duration = Date.now() - startTime;
            log(`Task "${item.description}" completed in ${duration}ms`);
            item.resolve(result);
        } catch (error) {
            const duration = Date.now() - startTime;
            log(`Task "${item.description}" failed after ${duration}ms: ${error.message}`, 'error');
            item.reject(error);
        } finally {
            this.running--;
            this.process();
        }
    }

    /**
     * Get current queue status
     */
    getStatus() {
        return {
            name: this.name,
            queueLength: this.queue.length,
            running: this.running,
            concurrency: this.concurrency
        };
    }

    /**
     * Clear the queue
     */
    clear() {
        const queuedTasks = this.queue.length;
        this.queue = [];
        log(`Cleared ${queuedTasks} tasks from queue ${this.name}`);
        return queuedTasks;
    }
}

// Create separate queues for different types of operations
const recordCheckQueue = new TaskQueue('recordCheck', 1);
const commandQueue = new TaskQueue('commands', 3);
const apiQueue = new TaskQueue('api', 1);

export { recordCheckQueue, commandQueue, apiQueue };
export default TaskQueue;
