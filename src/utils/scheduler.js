import { log } from '../utils.js';
import { batchUpdatePlayerDisplayNames } from '../playerManager.js';

const schedules = new Map();

/**
 * Schedule a task to run at a specific interval
 * @param {string} name - Name of the scheduled task
 * @param {number} intervalMs - Interval in milliseconds
 * @param {Function} task - Function to execute
 */
export function scheduleTask(name, intervalMs, task) {
    clearSchedule(name);

    log(`Scheduling task '${name}' to run every ${intervalMs}ms`);

    const intervalId = setInterval(async () => {
        try {
            log(`Running scheduled task: ${name}`);
            await task();
        } catch (error) {
            log(`Error in scheduled task '${name}': ${error.message}`, 'error');
        }
    }, intervalMs);

    schedules.set(name, intervalId);
}

/**
 * Clear a scheduled task
 * @param {string} name - Name of the scheduled task
 */
export function clearSchedule(name) {
    if (schedules.has(name)) {
        clearInterval(schedules.get(name));
        schedules.delete(name);
        log(`Cleared scheduled task: ${name}`);
    }
}

/**
 * Clear all scheduled tasks
 */
export function clearAllSchedules() {
    for (const [name, intervalId] of schedules) {
        clearInterval(intervalId);
        log(`Cleared scheduled task: ${name}`);
    }
    schedules.clear();
}

/**
 * Start default scheduled tasks
 * @param {Object} client - Discord client instance  
 */
export function startDefaultSchedules(client) {
    scheduleTask('updateDisplayNames', 24 * 60 * 60 * 1000, async () => {
        const result = await batchUpdatePlayerDisplayNames();
        log(`Display name update completed: ${result.updated} names updated`);
    });

    setTimeout(async () => {
        try {
            const result = await batchUpdatePlayerDisplayNames();
            log(`Initial display name update completed: ${result.updated} names updated`);
        } catch (error) {
            log(`Error in initial display name update: ${error.message}`, 'error');
        }
    }, 5000);
}
