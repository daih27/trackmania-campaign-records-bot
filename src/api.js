import axios from 'axios';
import { MIN_REQUEST_INTERVAL } from './config.js';
import { log } from './utils.js';
import { apiQueue } from './utils/taskQueue.js';

let lastRequestTime = 0;

/**
 * Makes a rate-limited request to ensure responsible API usage
 * Now uses the task queue to prevent blocking
 */
export async function makeRateLimitedRequest(config) {
    return apiQueue.enqueue(async () => {
        const now = Date.now();
        const timeToWait = Math.max(0, MIN_REQUEST_INTERVAL - (now - lastRequestTime));

        if (timeToWait > 0) {
            await new Promise(r => setTimeout(r, timeToWait));
        }

        lastRequestTime = Date.now();

        try {
            log(`Making API request to: ${config.url}`);
            const response = await axios(config);
            return response;
        } catch (error) {
            const status = error.response?.status;
            const data = error.response?.data;

            log(`API request failed: ${status} - ${error.message}`, 'error');
            if (data) {
                log(`Response data: ${JSON.stringify(data)}`, 'error');
            }

            throw error;
        }
    }, `API request to ${config.url}`);
}
