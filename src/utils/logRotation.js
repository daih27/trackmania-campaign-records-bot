import fs from 'fs';
import path from 'path';
import { log } from '../utils.js';
import { LOGGING_CONFIG } from '../config/logging.js';

/**
 * Cleans up old log files based on the configured retention period
 * @param {string} logsDir - Directory containing log files
 */
export function cleanupOldLogs(logsDir) {
    try {
        const files = fs.readdirSync(logsDir);
        const logFiles = files.filter(file => file.startsWith('bot-') && file.endsWith('.log'));
        
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - LOGGING_CONFIG.rotateDays);
        
        let deletedCount = 0;
        
        for (const file of logFiles) {
            const filePath = path.join(logsDir, file);
            const stats = fs.statSync(filePath);
            
            if (stats.mtime < cutoffDate) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
        
        if (deletedCount > 0) {
            log(`Cleaned up ${deletedCount} old log files`, 'debug');
        }
    } catch (error) {
        log(`Error cleaning up old logs: ${error.message}`, 'error');
    }
}

/**
 * Sets up automatic log cleanup to run daily
 * @param {string} logsDir - Directory containing log files
 */
export function setupLogCleanup(logsDir) {
    cleanupOldLogs(logsDir);
    
    setInterval(() => {
        cleanupOldLogs(logsDir);
    }, 24 * 60 * 60 * 1000); // 24 hours
}
