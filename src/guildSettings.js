import { getDb } from './db.js';
import { log } from './utils.js';
import { REGIONS, COUNTRY_NAMES, getCountryName } from './config/regions.js';

/**
 * Get the default country for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string>} - Default country code for the guild (e.g., 'CHI')
 */
export async function getDefaultCountry(guildId) {
    try {
        const db = await getDb();
        
        let guild = await db.get('SELECT default_country FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, default_country) VALUES (?, ?)',
                [guildId, 'CHI']
            );
            return 'CHI';
        }
        
        return guild.default_country || 'CHI';
    } catch (error) {
        log(`Error getting default country: ${error.message}`, 'error');
        return 'CHI';
    }
}

/**
 * Set the default country for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} countryCode - Country code to set as default (e.g., 'CHI')
 * @returns {Promise<boolean>} - Success status
 */
export async function setDefaultCountry(guildId, countryCode) {
    try {
        if (!REGIONS[countryCode]) {
            log(`Invalid country code: ${countryCode}`, 'warn');
            return false;
        }
        
        const db = await getDb();
        
        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (guild) {
            await db.run(
                'UPDATE guild_settings SET default_country = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [countryCode, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, default_country) VALUES (?, ?)',
                [guildId, countryCode]
            );
        }
        
        return true;
    } catch (error) {
        log(`Error setting default country: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Get a list of available countries
 * @returns {Array<{name: string, value: string}>} - Array of country choices for dropdown
 */
export function getAvailableCountries() {
    return Object.keys(REGIONS).map(code => ({
        name: getCountryName(code),
        value: code
    }));
}

/**
 * Set the announcement channel for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<boolean>} - Success status
 */
export async function setAnnouncementChannel(guildId, channelId) {
    try {
        const db = await getDb();
        
        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (guild) {
            await db.run(
                'UPDATE guild_settings SET records_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [channelId, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, records_channel_id) VALUES (?, ?)',
                [guildId, channelId]
            );
        }
        
        return true;
    } catch (error) {
        log(`Error setting announcement channel: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Set the weekly shorts announcement channel for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<boolean>} - Success status
 */
export async function setWeeklyShortsAnnouncementChannel(guildId, channelId) {
    try {
        const db = await getDb();
        
        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (guild) {
            await db.run(
                'UPDATE guild_settings SET weekly_shorts_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [channelId, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, weekly_shorts_channel_id) VALUES (?, ?)',
                [guildId, channelId]
            );
        }
        
        return true;
    } catch (error) {
        log(`Error setting weekly shorts announcement channel: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Get the minimum world position threshold for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<number>} - Minimum world position threshold (default: 5000)
 */
export async function getMinWorldPosition(guildId) {
    try {
        const db = await getDb();
        
        let guild = await db.get('SELECT min_world_position FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, min_world_position) VALUES (?, ?)',
                [guildId, 5000]
            );
            return 5000;
        }
        
        return guild.min_world_position || 5000;
    } catch (error) {
        log(`Error getting minimum world position: ${error.message}`, 'error');
        return 5000;
    }
}

/**
 * Set the minimum world position threshold for a guild
 * @param {string} guildId - Discord guild ID
 * @param {number} position - Minimum world position threshold
 * @returns {Promise<boolean>} - Success status
 */
export async function setMinWorldPosition(guildId, position) {
    try {
        if (position < 1 || position > 100000) {
            log(`Invalid position: ${position}`, 'warn');
            return false;
        }
        
        const db = await getDb();
        
        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);
        
        if (guild) {
            await db.run(
                'UPDATE guild_settings SET min_world_position = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [position, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, min_world_position) VALUES (?, ?)',
                [guildId, position]
            );
        }
        
        return true;
    } catch (error) {
        log(`Error setting minimum world position: ${error.message}`, 'error');
        return false;
    }
}
