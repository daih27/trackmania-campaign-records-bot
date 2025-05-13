import { initDatabase, getDb } from './db.js';
import { initBot } from './bot.js';
import { log } from './utils.js';
import fs from 'fs';
import path from 'path';

/**
 * Initializes the logging system by creating a logs directory and setting up console overrides
 * to write logs to both the console and a log file
 */
function initializeLogging() {
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `bot-${new Date().toISOString().split('T')[0]}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });

    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;

    console.log = function (...args) {
        const message = args.join(' ');
        logStream.write(`[${new Date().toISOString()}] [INFO] ${message}\n`);
        originalConsoleLog.apply(console, args);
    };

    console.error = function (...args) {
        const message = args.join(' ');
        logStream.write(`[${new Date().toISOString()}] [ERROR] ${message}\n`);
        originalConsoleError.apply(console, args);
    };

    console.warn = function (...args) {
        const message = args.join(' ');
        logStream.write(`[${new Date().toISOString()}] [WARN] ${message}\n`);
        originalConsoleWarn.apply(console, args);
    };

    return logStream;
}

const logStream = initializeLogging();

/**
 * Sets up process-level error handlers for uncaught exceptions and unhandled promise rejections
 */
function setupErrorHandlers() {
    process.on('uncaughtException', (error) => {
        log(`UNCAUGHT EXCEPTION: ${error.message}`, 'error');
        log(error.stack || 'No stack trace available', 'error');
    });

    process.on('unhandledRejection', (reason, promise) => {
        log(`UNHANDLED PROMISE REJECTION: ${reason}`, 'error');
    });
}

setupErrorHandlers();

let botClient = null;

/**
 * Main application initialization function that sets up the database and Discord bot
 * Also handles error recovery and automatic reconnection
 */
async function initializeApp() {
    try {
        log('Starting Trackmania Record Tracker...');

        await initDatabase();
        log('Database initialized successfully');

        botClient = initBot();
        log('Bot initialized successfully');

        botClient.on('error', async (error) => {
            log(`Discord client error: ${error.message}`, 'error');

            if (!botClient.isReady()) {
                log('Bot disconnected, attempting to reconnect...', 'warn');

                setTimeout(async () => {
                    try {
                        if (!botClient.isReady()) {
                            await botClient.login(botClient.token);
                            log('Bot reconnected successfully');
                        }
                    } catch (reconnectError) {
                        log(`Failed to reconnect: ${reconnectError.message}`, 'error');
                    }
                }, 10000);
            }
        });

        setInterval(() => {
            if (botClient && !botClient.isReady()) {
                log('Bot is not connected, attempting to reconnect...', 'warn');

                try {
                    botClient.login(botClient.token);
                } catch (error) {
                    log(`Error during reconnect attempt: ${error.message}`, 'error');
                }
            }
        }, 60000);

        /**
         * Handles graceful shutdown when the process receives SIGINT or SIGTERM signals
         * Closes database connections, destroys the Discord client, and ends log streams
         */
        const shutdownHandler = async () => {
            log('Shutting down gracefully...', 'warn');

            try {
                const db = await getDb();
                await db.close();
                log('Database connection closed');
            } catch (error) {
                log(`Error closing database: ${error.message}`, 'error');
            }

            try {
                if (botClient) {
                    botClient.destroy();
                    log('Bot client destroyed');
                }
            } catch (error) {
                log(`Error destroying bot client: ${error.message}`, 'error');
            }

            logStream.end();
            process.exit(0);
        };

        process.on('SIGINT', shutdownHandler);
        process.on('SIGTERM', shutdownHandler);

    } catch (error) {
        log(`Error starting application: ${error.message}`, 'error');
        log(error.stack || 'No stack trace available', 'error');

        log('Restarting application in 10 seconds...', 'warn');
        setTimeout(initializeApp, 10000);
    }
}

initializeApp();

/**
 * Watchdog timer that logs a heartbeat message every hour to confirm the application is still running
 */
setInterval(() => {
    log('Watchdog timer triggered - application is still running', 'info');
}, 3600000);