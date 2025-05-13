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
