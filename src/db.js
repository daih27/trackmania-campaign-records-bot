import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { log } from './utils.js';

dotenv.config();

const dbPath = process.env.DB_PATH || './data/trackmania.db';

/**
 * Ensures the data directory exists for the database file
 * Creates the directory recursively if it doesn't exist
 */
const ensureDataDir = () => {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

/**
 * Runs database migrations to add new columns/tables to existing databases
 * @param {Database} db - Database connection
 */
async function runMigrations(db) {
    const guildSettingsColumns = await db.all("PRAGMA table_info(guild_settings)");
    const hasToTDChannel = guildSettingsColumns.some(col => col.name === 'totd_channel_id');
    const hasToTDAnnouncements = guildSettingsColumns.some(col => col.name === 'totd_announcements_enabled');

    if (!hasToTDChannel) {
        log('Adding totd_channel_id column to guild_settings table');
        await db.run('ALTER TABLE guild_settings ADD COLUMN totd_channel_id TEXT');
    }

    if (!hasToTDAnnouncements) {
        log('Adding totd_announcements_enabled column to guild_settings table');
        await db.run('ALTER TABLE guild_settings ADD COLUMN totd_announcements_enabled BOOLEAN DEFAULT 0');
    }

    const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='totd_maps'");
    if (tables.length === 0) {
        log('Creating totd_maps table');
        await db.exec(`
            CREATE TABLE totd_maps (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              map_uid TEXT NOT NULL UNIQUE,
              map_id TEXT,
              name TEXT,
              campaign_id INTEGER,
              start_timestamp INTEGER,
              end_timestamp INTEGER,
              thumbnail_url TEXT,
              last_checked TIMESTAMP DEFAULT (datetime('now'))
            );
        `);
    }

    const totdRecordsTables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='totd_records'");
    if (totdRecordsTables.length === 0) {
        log('Creating totd_records table');
        await db.exec(`
            CREATE TABLE totd_records (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              player_id INTEGER NOT NULL,
              map_id INTEGER NOT NULL,
              time_ms INTEGER NOT NULL,
              position INTEGER,
              recorded_at TIMESTAMP DEFAULT (datetime('now')),
              FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
              FOREIGN KEY(map_id) REFERENCES totd_maps(id) ON DELETE CASCADE,
              UNIQUE(player_id, map_id)
            );
        `);
    }

    const globalSettingsColumns = await db.all("PRAGMA table_info(global_settings)");
    const hasTotdCheckInterval = globalSettingsColumns.some(col => col.name === 'totd_check_interval_ms');

    if (!hasTotdCheckInterval && globalSettingsColumns.length > 0) {
        log('Adding totd_check_interval_ms column to global_settings table');
        await db.run('ALTER TABLE global_settings ADD COLUMN totd_check_interval_ms INTEGER DEFAULT 3600000');
    }
}

/**
 * Initializes the SQLite database and creates all necessary tables if they don't exist
 * Sets up foreign key constraints and creates tables for players, maps, records, and guild settings
 * @returns {Promise<Database>} Initialized database connection
 */
export async function initDatabase() {
    ensureDataDir();

    const db = await sqlite.open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    await db.run('PRAGMA foreign_keys = ON');

    await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      username TEXT,
      registered_at TIMESTAMP DEFAULT (datetime('now')),
      updated_at TIMESTAMP DEFAULT (datetime('now')),
      UNIQUE(discord_id, guild_id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_players_guild_id ON players(guild_id);
    CREATE INDEX IF NOT EXISTS idx_players_account_id ON players(account_id);
    
    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_uid TEXT NOT NULL UNIQUE,
      map_id TEXT,
      name TEXT,
      season_uid TEXT,
      thumbnail_url TEXT,
      last_checked TIMESTAMP DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      recorded_at TIMESTAMP DEFAULT (datetime('now')),
      announced BOOLEAN DEFAULT 0,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE,
      UNIQUE(player_id, map_id)
    );
    
    CREATE TABLE IF NOT EXISTS record_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      previous_time_ms INTEGER,
      recorded_at TIMESTAMP DEFAULT (datetime('now')),
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS guild_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL UNIQUE,
      language TEXT DEFAULT 'en',
      records_channel_id TEXT,
      weekly_shorts_channel_id TEXT,
      totd_channel_id TEXT,
      default_zone_id TEXT,
      min_world_position INTEGER DEFAULT 5000,
      campaign_announcements_enabled BOOLEAN DEFAULT 1,
      weekly_shorts_announcements_enabled BOOLEAN DEFAULT 1,
      totd_announcements_enabled BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT (datetime('now')),
      updated_at TIMESTAMP DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS weekly_short_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_uid TEXT NOT NULL UNIQUE,
      map_id TEXT,
      name TEXT,
      season_uid TEXT,
      position INTEGER,
      thumbnail_url TEXT,
      last_checked TIMESTAMP DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS weekly_short_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      position INTEGER,
      timestamp INTEGER,
      recorded_at TIMESTAMP DEFAULT (datetime('now')),
      announced BOOLEAN DEFAULT 0,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES weekly_short_maps(id) ON DELETE CASCADE,
      UNIQUE(player_id, map_id)
    );
    
    CREATE TABLE IF NOT EXISTS weekly_short_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      position INTEGER,
      previous_position INTEGER,
      timestamp INTEGER,
      recorded_at TIMESTAMP DEFAULT (datetime('now')),
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES weekly_short_maps(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS guild_announcement_status (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      record_id INTEGER,
      weekly_short_record_id INTEGER,
      ineligible_for_announcement BOOLEAN DEFAULT 0,
      existed_before_registration BOOLEAN DEFAULT 0,
      created_at TIMESTAMP DEFAULT (datetime('now')),
      FOREIGN KEY(record_id) REFERENCES records(id) ON DELETE CASCADE,
      FOREIGN KEY(weekly_short_record_id) REFERENCES weekly_short_records(id) ON DELETE CASCADE,
      UNIQUE(guild_id, record_id),
      UNIQUE(guild_id, weekly_short_record_id)
    );
    
    CREATE TABLE IF NOT EXISTS totd_maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_uid TEXT NOT NULL UNIQUE,
      map_id TEXT,
      name TEXT,
      campaign_id INTEGER,
      start_timestamp INTEGER,
      end_timestamp INTEGER,
      thumbnail_url TEXT,
      last_checked TIMESTAMP DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS totd_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      position INTEGER,
      recorded_at TIMESTAMP DEFAULT (datetime('now')),
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES totd_maps(id) ON DELETE CASCADE,
      UNIQUE(player_id, map_id)
    );

    CREATE TABLE IF NOT EXISTS global_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_check_interval_ms INTEGER DEFAULT 900000,
      weekly_shorts_check_interval_ms INTEGER DEFAULT 1080000,
      totd_check_interval_ms INTEGER DEFAULT 3600000,
      authorized_users TEXT DEFAULT '',
      created_at TIMESTAMP DEFAULT (datetime('now')),
      updated_at TIMESTAMP DEFAULT (datetime('now'))
    );
  `);

    await runMigrations(db);

    return db;
}

let dbInstance = null;

/**
 * Gets the database connection, initializing it if necessary
 * Uses singleton pattern to ensure only one database connection exists
 * @returns {Promise<Database>} Database connection instance
 */
export async function getDb() {
    if (!dbInstance) {
        dbInstance = await initDatabase();
    }
    return dbInstance;
}

/**
 * Gets the global settings, creating a default row if none exists
 * @returns {Promise<Object>} Global settings object
 */
export async function getGlobalSettings() {
    const db = await getDb();
    
    let settings = await db.get('SELECT * FROM global_settings WHERE id = 1');
    
    if (!settings) {
        await db.run(`
            INSERT INTO global_settings (
                campaign_check_interval_ms, 
                weekly_shorts_check_interval_ms,
                authorized_users
            ) VALUES (?, ?, ?)
        `, [900000, 1080000, '']);
        
        settings = await db.get('SELECT * FROM global_settings WHERE id = 1');
    }
    
    return settings;
}

/**
 * Updates the campaign check interval
 * @param {number} intervalMs - New interval in milliseconds
 * @returns {Promise<boolean>} Success status
 */
export async function setCampaignCheckInterval(intervalMs) {
    try {
        const db = await getDb();
        await getGlobalSettings();
        
        await db.run(`
            UPDATE global_settings 
            SET campaign_check_interval_ms = ?, updated_at = datetime('now')
            WHERE id = 1
        `, [intervalMs]);
        
        return true;
    } catch (error) {
        log(`Error setting campaign check interval: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Updates the weekly shorts check interval
 * @param {number} intervalMs - New interval in milliseconds
 * @returns {Promise<boolean>} Success status
 */
export async function setWeeklyShortsCheckInterval(intervalMs) {
    try {
        const db = await getDb();
        await getGlobalSettings();
        
        await db.run(`
            UPDATE global_settings 
            SET weekly_shorts_check_interval_ms = ?, updated_at = datetime('now')
            WHERE id = 1
        `, [intervalMs]);
        
        return true;
    } catch (error) {
        log(`Error setting weekly shorts check interval: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Adds an authorized user for global settings management
 * @param {string} userId - Discord user ID to authorize
 * @returns {Promise<boolean>} Success status
 */
export async function addAuthorizedUser(userId) {
    try {
        const db = await getDb();
        const settings = await getGlobalSettings();
        
        const authorizedUsers = settings.authorized_users ? settings.authorized_users.split(',').filter(Boolean) : [];
        
        if (!authorizedUsers.includes(userId)) {
            authorizedUsers.push(userId);
            
            await db.run(`
                UPDATE global_settings 
                SET authorized_users = ?, updated_at = datetime('now')
                WHERE id = 1
            `, [authorizedUsers.join(',')]);
        }
        
        return true;
    } catch (error) {
        log(`Error adding authorized user: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Removes an authorized user
 * @param {string} userId - Discord user ID to remove
 * @returns {Promise<boolean>} Success status
 */
export async function removeAuthorizedUser(userId) {
    try {
        const db = await getDb();
        const settings = await getGlobalSettings();
        
        const authorizedUsers = settings.authorized_users ? settings.authorized_users.split(',').filter(Boolean) : [];
        const filtered = authorizedUsers.filter(id => id !== userId);
        
        await db.run(`
            UPDATE global_settings 
            SET authorized_users = ?, updated_at = datetime('now')
            WHERE id = 1
        `, [filtered.join(',')]);
        
        return true;
    } catch (error) {
        log(`Error removing authorized user: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Checks if a user is authorized to modify global settings
 * @param {string} userId - Discord user ID to check
 * @returns {Promise<boolean>} Authorization status
 */
export async function isUserAuthorized(userId) {
    try {
        const settings = await getGlobalSettings();
        const authorizedUsers = settings.authorized_users ? settings.authorized_users.split(',').filter(Boolean) : [];
        return authorizedUsers.includes(userId);
    } catch (error) {
        log(`Error checking user authorization: ${error.message}`, 'error');
        return false;
    }
}