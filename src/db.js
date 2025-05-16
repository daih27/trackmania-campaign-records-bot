import * as sqlite from 'sqlite';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

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
      default_zone_id TEXT,
      min_world_position INTEGER DEFAULT 5000,
      campaign_announcements_enabled BOOLEAN DEFAULT 1,
      weekly_shorts_announcements_enabled BOOLEAN DEFAULT 1,
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
  `);

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