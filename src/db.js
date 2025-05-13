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
      discord_id TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL UNIQUE,
      username TEXT,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS maps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      map_uid TEXT NOT NULL UNIQUE,
      map_id TEXT,
      name TEXT,
      season_uid TEXT,
      thumbnail_url TEXT,
      last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id INTEGER NOT NULL,
      map_id INTEGER NOT NULL,
      time_ms INTEGER NOT NULL,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY(map_id) REFERENCES maps(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS guild_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL UNIQUE,
      language TEXT DEFAULT 'en',
      records_channel_id TEXT,
      default_country TEXT DEFAULT 'CHI', 
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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