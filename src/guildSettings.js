import { getDb } from './db.js';
import { log } from './utils.js';
import { getAvailableCountries } from './config/zones.js';

/**
 * Get the default zone ID for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string>} - Default zone ID for the guild
 */
export async function getDefaultCountry(guildId) {
    try {
        const db = await getDb();

        let guild = await db.get('SELECT default_zone_id as default_zone_id FROM guild_settings WHERE guild_id = ?', guildId);

        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, default_zone_id) VALUES (?, ?)',
                [guildId, '301e7e43-7e13-11e8-8060-e284abfd2bc4']
            );
            return '301e7e43-7e13-11e8-8060-e284abfd2bc4';
        }

        return guild.default_zone_id || '301e7e43-7e13-11e8-8060-e284abfd2bc4';
    } catch (error) {
        log(`Error getting default country: ${error.message}`, 'error');
        return '301e7e43-7e13-11e8-8060-e284abfd2bc4';
    }
}

/**
 * Set the default zone ID for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} zoneId - Zone ID to set as default
 * @returns {Promise<boolean>} - Success status
 */
export async function setDefaultCountry(guildId, zoneId) {
    try {
        const countries = await getAvailableCountries();
        const validCountry = countries.find(c => c.value === zoneId);
        if (!validCountry) {
            log(`Invalid zone ID: ${zoneId}`, 'warn');
            return false;
        }

        const db = await getDb();

        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);

        if (guild) {

            await db.run(
                'UPDATE guild_settings SET default_zone_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [zoneId, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, default_zone_id) VALUES (?, ?)',
                [guildId, zoneId]
            );
        }

        return true;
    } catch (error) {
        log(`Error setting default country: ${error.message}`, 'error');
        return false;
    }
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

/**
 * Toggle campaign announcements for a guild
 * @param {string} guildId - Discord guild ID
 * @param {boolean} enabled - Whether to enable or disable campaign announcements
 * @returns {Promise<boolean>} - Success status
 */
export async function toggleCampaignAnnouncements(guildId, enabled) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);

        if (guild) {
            await db.run(
                'UPDATE guild_settings SET campaign_announcements_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [enabled ? 1 : 0, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, campaign_announcements_enabled) VALUES (?, ?)',
                [guildId, enabled ? 1 : 0]
            );
        }

        return true;
    } catch (error) {
        log(`Error toggling campaign announcements: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Toggle weekly shorts announcements for a guild
 * @param {string} guildId - Discord guild ID
 * @param {boolean} enabled - Whether to enable or disable weekly shorts announcements
 * @returns {Promise<boolean>} - Success status
 */
export async function toggleWeeklyShortsAnnouncements(guildId, enabled) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);

        if (guild) {
            await db.run(
                'UPDATE guild_settings SET weekly_shorts_announcements_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [enabled ? 1 : 0, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, weekly_shorts_announcements_enabled) VALUES (?, ?)',
                [guildId, enabled ? 1 : 0]
            );
        }

        return true;
    } catch (error) {
        log(`Error toggling weekly shorts announcements: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Get campaign announcements status for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} - Whether campaign announcements are enabled
 */
export async function getCampaignAnnouncementsStatus(guildId) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT campaign_announcements_enabled FROM guild_settings WHERE guild_id = ?', guildId);

        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, campaign_announcements_enabled) VALUES (?, 1)',
                [guildId]
            );
            return true;
        }

        return guild.campaign_announcements_enabled === 1;
    } catch (error) {
        log(`Error getting campaign announcements status: ${error.message}`, 'error');
        return true;
    }
}

/**
 * Get weekly shorts announcements status for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} - Whether weekly shorts announcements are enabled
 */
export async function getWeeklyShortsAnnouncementsStatus(guildId) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT weekly_shorts_announcements_enabled FROM guild_settings WHERE guild_id = ?', guildId);

        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, weekly_shorts_announcements_enabled) VALUES (?, 1)',
                [guildId]
            );
            return true;
        }

        return guild.weekly_shorts_announcements_enabled === 1;
    } catch (error) {
        log(`Error getting weekly shorts announcements status: ${error.message}`, 'error');
        return true;
    }
}

/**
 * Check if any guild has campaign announcements enabled
 * @returns {Promise<boolean>} - Whether any guild has campaign announcements enabled
 */
export async function isAnyCampaignAnnouncementsEnabled() {
    try {
        const db = await getDb();

        const result = await db.get(
            'SELECT COUNT(*) as count FROM guild_settings WHERE campaign_announcements_enabled = 1'
        );

        return result && result.count > 0;
    } catch (error) {
        log(`Error checking if any campaign announcements are enabled: ${error.message}`, 'error');
        return true;
    }
}

/**
 * Check if any guild has weekly shorts announcements enabled
 * @returns {Promise<boolean>} - Whether any guild has weekly shorts announcements enabled
 */
export async function isAnyWeeklyShortsAnnouncementsEnabled() {
    try {
        const db = await getDb();

        const result = await db.get(
            'SELECT COUNT(*) as count FROM guild_settings WHERE weekly_shorts_announcements_enabled = 1'
        );

        return result && result.count > 0;
    } catch (error) {
        log(`Error checking if any weekly shorts announcements are enabled: ${error.message}`, 'error');
        return true;
    }
}

/**
 * Set the TOTD announcement channel for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} channelId - Discord channel ID
 * @returns {Promise<boolean>} - Success status
 */
export async function setTOTDAnnouncementChannel(guildId, channelId) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);

        if (guild) {
            await db.run(
                'UPDATE guild_settings SET totd_channel_id = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [channelId, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, totd_channel_id) VALUES (?, ?)',
                [guildId, channelId]
            );
        }

        return true;
    } catch (error) {
        log(`Error setting TOTD announcement channel: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Toggle TOTD announcements for a guild
 * @param {string} guildId - Discord guild ID
 * @param {boolean} enabled - Whether to enable or disable TOTD announcements
 * @returns {Promise<boolean>} - Success status
 */
export async function toggleTOTDAnnouncements(guildId, enabled) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT id FROM guild_settings WHERE guild_id = ?', guildId);

        if (guild) {
            await db.run(
                'UPDATE guild_settings SET totd_announcements_enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?',
                [enabled ? 1 : 0, guildId]
            );
        } else {
            await db.run(
                'INSERT INTO guild_settings (guild_id, totd_announcements_enabled) VALUES (?, ?)',
                [guildId, enabled ? 1 : 0]
            );
        }

        return true;
    } catch (error) {
        log(`Error toggling TOTD announcements: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Get TOTD announcements status for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<boolean>} - Whether TOTD announcements are enabled
 */
export async function getTOTDAnnouncementsStatus(guildId) {
    try {
        const db = await getDb();

        const guild = await db.get('SELECT totd_announcements_enabled FROM guild_settings WHERE guild_id = ?', guildId);

        if (!guild) {
            await db.run(
                'INSERT INTO guild_settings (guild_id, totd_announcements_enabled) VALUES (?, 0)',
                [guildId]
            );
            return false;
        }

        return guild.totd_announcements_enabled === 1;
    } catch (error) {
        log(`Error getting TOTD announcements status: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Check if any guild has TOTD announcements enabled
 * @returns {Promise<boolean>} - Whether any guild has TOTD announcements enabled
 */
export async function isAnyTOTDAnnouncementsEnabled() {
    try {
        const db = await getDb();

        const result = await db.get(
            'SELECT COUNT(*) as count FROM guild_settings WHERE totd_announcements_enabled = 1'
        );

        return result && result.count > 0;
    } catch (error) {
        log(`Error checking if any TOTD announcements are enabled: ${error.message}`, 'error');
        return false;
    }
}
