/**
 * Logging configuration for the Trackmania Records Bot
 * 
 * Log Levels (in order of verbosity):
 * - debug: All messages including detailed debugging info
 * - info: General information about bot operations (default for development)
 * - warn: Warning messages and important events (recommended for production)
 * - error: Only error messages
 * - silent: No logging output
 * 
 * Environment Variables:
 * - LOG_LEVEL: Sets the minimum log level (e.g., "warn")
 * - LOG_ROTATE_DAYS: Number of days to keep log files (default: 7)
 */

export const LOGGING_CONFIG = {
    defaultLevel: 'warn',
    rotateDays: parseInt(process.env.LOG_ROTATE_DAYS) || 7,
    
    reduceVerbosity: {
        skipRoutineSuccess: true,
        reduceApiLogs: true,
        dbOperationsErrorOnly: true
    }
};
