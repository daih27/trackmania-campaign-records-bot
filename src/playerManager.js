import { getDb } from './db.js';
import { log } from './utils.js';
import { getDisplayNames } from './oauth.js';
import { tmOAuthClientId, tmOAuthClientSecret } from './config.js';

/**
 * Gets all registered players for a specific guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Array>} Array of player objects with their account information
 */
export async function getGuildPlayers(guildId) {
    const db = await getDb();
    const players = await db.all('SELECT * FROM players WHERE guild_id = ?', guildId);
    return players;
}

/**
 * Gets a player record by their Discord ID and Guild ID
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Discord guild ID  
 * @returns {Promise<Object|null>} Player object or null if not found
 */
export async function getPlayerByDiscordId(discordId, guildId) {
    const db = await getDb();
    return await db.get('SELECT * FROM players WHERE discord_id = ? AND guild_id = ?', discordId, guildId);
}

/**
 * Gets a player record by their Trackmania account ID and Guild ID
 * @param {string} accountId - Trackmania account ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object|null>} Player object or null if not found
 */
export async function getPlayerByAccountId(accountId, guildId) {
    const db = await getDb();
    return await db.get('SELECT * FROM players WHERE account_id = ? AND guild_id = ?', accountId, guildId);
}

/**
 * Registers a new player or updates an existing one
 * Links a Discord user to their Trackmania account for a specific guild
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @param {string} accountId - Trackmania account ID
 * @param {string} username - Optional username (defaults to Discord username)
 * @returns {Promise<Object>} Result object with success status and player data
 */
export async function registerPlayer(discordId, guildId, accountId, username = null) {
    const db = await getDb();

    try {
        const existingPlayer = await getPlayerByDiscordId(discordId, guildId);

        if (existingPlayer) {
            await db.run(
                'UPDATE players SET account_id = ?, username = ?, updated_at = datetime(\'now\') WHERE discord_id = ? AND guild_id = ?',
                [accountId, username, discordId, guildId]
            );
            log(`Updated player with Discord ID ${discordId} in guild ${guildId}`);
            return { success: true, updated: true, player: await getPlayerByDiscordId(discordId, guildId) };
        } else {
            await db.run(
                'INSERT INTO players (discord_id, guild_id, account_id, username) VALUES (?, ?, ?, ?)',
                [discordId, guildId, accountId, username]
            );
            log(`Registered new player with Discord ID ${discordId} in guild ${guildId}`);
            return { success: true, updated: false, player: await getPlayerByDiscordId(discordId, guildId) };
        }
    } catch (error) {
        log(`Error registering player: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

/**
 * Unregisters a player by removing their Discord ID association for a specific guild
 * @param {string} discordId - Discord user ID
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<Object>} Result object with success status
 */
export async function unregisterPlayer(discordId, guildId) {
    const db = await getDb();

    try {
        const player = await getPlayerByDiscordId(discordId, guildId);
        if (!player) {
            return { success: false, error: 'Player not found' };
        }

        await db.run('DELETE FROM players WHERE discord_id = ? AND guild_id = ?', discordId, guildId);
        log(`Unregistered player with Discord ID ${discordId} from guild ${guildId}`);
        return { success: true };
    } catch (error) {
        log(`Error unregistering player: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

/**
 * Lists all players with their statistics including record counts and map completion
 * @returns {Promise<Array>} Array of player objects with aggregated statistics
 */
export async function getPlayersWithStats() {
    const db = await getDb();

    const query = `
    SELECT 
      p.id, 
      p.discord_id, 
      p.account_id, 
      p.username,
      COUNT(DISTINCT r.map_id) AS map_count,
      (SELECT COUNT(*) FROM maps) AS total_maps,
      (SELECT COUNT(*) FROM record_history WHERE player_id = p.id) AS record_count
    FROM 
      players p
    LEFT JOIN 
      records r ON p.id = r.player_id
    GROUP BY 
      p.id
    ORDER BY 
      map_count DESC, username
  `;

    try {
        return await db.all(query);
    } catch (error) {
        log(`Error getting player stats: ${error.message}`, 'error');
        return [];
    }
}

/**
 * Updates player display names from Trackmania OAuth API
 * Legacy function - kept for backward compatibility
 * @returns {Promise<Object>} Result of batch update operation
 * @deprecated Use batchUpdatePlayerDisplayNames instead
 */
export async function updatePlayerDisplayNames() {
    return batchUpdatePlayerDisplayNames();
}

/**
 * Batch updates player display names from the Trackmania OAuth API
 * Updates names for players without proper usernames or with outdated data
 * Can be called periodically to keep display names current
 * @returns {Promise<Object>} Result object with success status and update count
 */
export async function batchUpdatePlayerDisplayNames() {
    if (!tmOAuthClientId || !tmOAuthClientSecret) {
        log('OAuth credentials not configured. Skipping display name update.', 'warn');
        return { success: false, error: 'OAuth not configured' };
    }

    try {
        const db = await getDb();
        const players = await db.all(`
            SELECT id, account_id 
            FROM players 
            WHERE account_id IS NOT NULL 
            AND (username IS NULL OR username = account_id OR updated_at < datetime('now', '-7 days'))
        `);
        
        if (players.length === 0) {
            log('No players need display name updates');
            return { success: true, updated: 0 };
        }

        const accountIds = players.map(p => p.account_id);
        
        log(`Fetching display names for ${accountIds.length} players`);
        
        const displayNames = await getDisplayNames(accountIds);
        
        let updateCount = 0;
        for (const player of players) {
            const displayName = displayNames[player.account_id];
            if (displayName) {
                await db.run(
                    'UPDATE players SET username = ?, updated_at = datetime(\'now\') WHERE id = ?',
                    [displayName, player.id]
                );
                updateCount++;
            }
        }
        
        log(`Updated ${updateCount} player display names`);
        return { success: true, updated: updateCount };
    } catch (error) {
        log(`Error updating player display names: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

/**
 * Gets a player record and updates their display name if OAuth is configured
 * Fetches the latest display name from Trackmania API and updates the database
 * @param {string} accountId - Trackmania account ID
 * @returns {Promise<Object|null>} Player object with updated display name or null if not found
 */
export async function getPlayerWithDisplayName(accountId) {
    const db = await getDb();
    const player = await getPlayerByAccountId(accountId);
    
    if (!player) {
        return null;
    }
    
    if (tmOAuthClientId && tmOAuthClientSecret) {
        try {
            const displayNames = await getDisplayNames([accountId]);
            const displayName = displayNames[accountId];
            
            if (displayName && displayName !== player.username) {
                await db.run(
                    'UPDATE players SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [displayName, player.id]
                );
                player.username = displayName;
            }
        } catch (error) {
            log(`Error fetching display name for ${accountId}: ${error.message}`, 'warn');
        }
    }
    
    return player;
}