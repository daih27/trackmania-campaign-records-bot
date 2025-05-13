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

/**
 * Logs a message with timestamp and level to console
 * Automatically routes to console.log, console.warn, or console.error based on level
 * @param {string} message - Message to log
 * @param {string} level - Log level ('info', 'warn', 'error')
 */
export function log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
        case 'error':
            console.error(formattedMessage);
            break;
        case 'warn':
            console.warn(formattedMessage);
            break;
        default:
            console.log(formattedMessage);
    }
}