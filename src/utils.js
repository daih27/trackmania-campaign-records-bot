/**
 * Formats time in milliseconds to a human-readable format
 * @param {number} timeMs - Time in milliseconds
 * @param {boolean} showAsImprovement - Whether to format as improvement (with parentheses and minus)
 * @returns {string} Formatted time string (e.g., "1:23.456" or "(-1:23.456)")
 */
export function formatTime(timeMs, showAsImprovement = false) {
    const totalSeconds = Math.floor(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = timeMs % 1000;

    let formattedTime;
    if (minutes > 0) {
        formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    } else {
        formattedTime = `${seconds}.${milliseconds.toString().padStart(3, '0')}`;
    }

    return showAsImprovement ? `(-${formattedTime})` : formattedTime;
}

const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    silent: 4
};

let currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

/**
 * Sets the minimum log level for output
 * @param {string} level - Log level ('debug', 'info', 'warn', 'error', 'silent')
 */
export function setLogLevel(level) {
    if (level in LOG_LEVELS) {
        currentLogLevel = LOG_LEVELS[level];
    }
}

/**
 * Gets the current log level
 * @returns {string} Current log level name
 */
export function getLogLevel() {
    return Object.keys(LOG_LEVELS).find(key => LOG_LEVELS[key] === currentLogLevel) || 'info';
}

/**
 * Logs a message with timestamp and level to console
 * Automatically routes to console.log, console.warn, or console.error based on level
 * Only logs if the message level meets the current minimum log level
 * @param {string} message - Message to log
 * @param {string} level - Log level ('debug', 'info', 'warn', 'error')
 */
export function log(message, level = 'info') {
    if (LOG_LEVELS[level] < currentLogLevel) {
        return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
        case 'error':
            console.error(formattedMessage);
            break;
        case 'warn':
            console.warn(formattedMessage);
            break;
        case 'debug':
        case 'info':
        default:
            console.log(formattedMessage);
    }
}