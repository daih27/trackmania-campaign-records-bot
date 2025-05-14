import { makeRateLimitedRequest } from './api.js';
import { ensureToken, invalidateTokens } from './auth.js';
import { log } from './utils.js';
import { getDb } from './db.js';
import { getPlayers } from './playerManager.js';
import { getTranslations, formatString } from './localization/index.js';
import { EmbedBuilder } from 'discord.js';
import { getZoneName, getZoneNamesForCountry } from './config/zones.js';
import { getDisplayNamesBatch } from './oauth.js';
import { tmOAuthClientId, tmOAuthClientSecret, TRACKMANIA_ICON_URL } from './config.js';
import { fetchMapInfo } from './recordTracker.js';
import { getMinWorldPosition } from './guildSettings.js';

/**
 * Fetches leaderboard data for a weekly short season filtered by country
 * @param {string} seasonUid - The season UID
 * @param {string} countryCode - The country zone ID
 * @param {number} limit - Number of records to retrieve
 * @returns {Promise<Array>} Array of leaderboard records for the specified country
 */
export async function fetchWeeklyShortSeasonLeaderboard(seasonUid, countryCode, limit = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    const zoneNames = await getZoneNamesForCountry(countryCode);
    if (zoneNames.size === 0) {
        const countryName = await getZoneName(countryCode);
        log(`No zones found for country code: ${countryCode} (${countryName})`, 'warn');
        return [];
    }

    const countryName = await getZoneName(countryCode);
    log(`Fetching weekly short season leaderboard for ${countryName} (zones: ${Array.from(zoneNames).join(', ')})`);

    let countryRecords = [];
    let offset = 0;
    const maxOffset = 10000;

    while (countryRecords.length < limit && offset < maxOffset) {
        const leaderboardRes = await makeRateLimitedRequest({
            method: 'get',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/${seasonUid}/top?length=100&onlyWorld=true&offset=${offset}`,
            headers: { Authorization: `nadeo_v1 t=${liveToken}` }
        });

        if (!leaderboardRes.data?.tops || !leaderboardRes.data.tops[0]?.top?.length) {
            break;
        }

        const worldTop = leaderboardRes.data.tops[0].top;
        const batchCountryRecords = worldTop.filter(record =>
            zoneNames.has(record.zoneName));

        countryRecords.push(...batchCountryRecords);
        offset += 100;
    }

    const result = countryRecords
        .sort((a, b) => a.position - b.position)
        .slice(0, limit);

    log(`Found ${result.length} ${countryName} players in weekly short season leaderboard`);
    return result;
}

/**
 * Fetches country leaderboard for a specific weekly short map
 * @param {string} mapUid - The map UID
 * @param {string} seasonUid - The season UID
 * @param {string} countryCode - The country zone ID
 * @param {number} limit - Number of records to retrieve
 * @returns {Promise<Array>} Leaderboard for the specified country
 */
export async function fetchWeeklyShortCountryLeaderboard(mapUid, seasonUid, countryCode, limit = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    const zoneNames = await getZoneNamesForCountry(countryCode);
    if (zoneNames.size === 0) {
        const countryName = await getZoneName(countryCode);
        log(`No zones found for country code: ${countryCode} (${countryName})`, 'warn');
        return [];
    }

    const countryName = await getZoneName(countryCode);
    log(`Searching for ${countryName} players in weekly short map ${mapUid} (zones: ${Array.from(zoneNames).join(', ')})`);

    let countryRecords = [];
    let offset = 0;
    const maxOffset = 10000;

    while (countryRecords.length < limit && offset < maxOffset) {
        const leaderboardRes = await makeRateLimitedRequest({
            method: 'get',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/${seasonUid}/map/${mapUid}/top?length=100&onlyWorld=true&offset=${offset}`,
            headers: { Authorization: `nadeo_v1 t=${liveToken}` }
        });

        if (!leaderboardRes.data?.tops || !leaderboardRes.data.tops[0]?.top?.length) {
            break;
        }

        const worldTop = leaderboardRes.data.tops[0].top;
        const batchCountryRecords = worldTop.filter(record =>
            zoneNames.has(record.zoneName));

        countryRecords.push(...batchCountryRecords);
        offset += 100;
    }

    const result = countryRecords
        .sort((a, b) => a.position - b.position)
        .slice(0, limit);

    log(`Found ${result.length} ${countryName} players in weekly short map leaderboard`);
    return result;
}

/**
 * Gets weekly short map information from the database
 * @param {string} mapUid - The map UID to look up
 * @returns {Promise<Object|null>} Map information from database or null if not found
 */
export async function getWeeklyShortMapFromDb(mapUid) {
    const db = await getDb();
    
    try {
        const map = await db.get(
            'SELECT map_uid, map_id, name, thumbnail_url FROM weekly_short_maps WHERE map_uid = ?',
            mapUid
        );
        
        return map;
    } catch (error) {
        log(`Error getting weekly short map from database: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Creates a Discord embed for displaying weekly short season leaderboard
 * @param {string} seasonName - The season name
 * @param {string} countryCode - The country zone ID
 * @param {Array} records - The leaderboard records
 * @param {Object} playerNames - Mapping of account IDs to display names
 * @param {Object} t - Translation strings
 * @returns {Promise<EmbedBuilder>} Discord embed for the season leaderboard
 */
export async function createWeeklyShortSeasonLeaderboardEmbed(seasonName, countryCode, records, playerNames, t) {
    const countryName = await getZoneName(countryCode);
    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${countryName} Weekly Shorts: ${seasonName}`)
        .setColor(0xFF6B6B)
        .setAuthor({ name: `Trackmania Weekly Shorts`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(`Top ${records.length} ${countryName} players in the current weekly shorts`)
        .setTimestamp(new Date());

    if (records.length === 0) {
        embed.addFields({
            name: `No ${countryName} Records`,
            value: `No records found for ${countryName} players in this weekly shorts season.`,
            inline: false
        });
    } else {
        const firstPlayerPoints = records[0] ? parseInt(records[0].sp) : 0;

        records.forEach((record, index) => {
            const playerName = playerNames[record.accountId] || 'Unknown Player';
            const points = parseInt(record.sp) || 0;
            let pointsDifferential = '';

            if (index > 0 && firstPlayerPoints > 0) {
                const difference = firstPlayerPoints - points;
                pointsDifferential = ` (-${difference.toLocaleString()})`;
            }

            embed.addFields({
                name: `#${index + 1}: ${playerName}`,
                value: `Points: **${points.toLocaleString()}${pointsDifferential}**\nPosition: #${record.position} worldwide`,
                inline: false
            });
        });
    }

    return embed;
}

/**
 * Creates a Discord embed for displaying weekly short map leaderboard
 * @param {string} mapName - The map name
 * @param {string} mapUid - The map UID
 * @param {string} thumbnailUrl - Map thumbnail URL
 * @param {string} countryCode - The country zone ID
 * @param {Array} records - The leaderboard records
 * @param {Object} playerNames - Mapping of account IDs to display names
 * @param {Object} t - Translation strings
 * @returns {Promise<EmbedBuilder>} Discord embed for the map leaderboard
 */
export async function createWeeklyShortMapLeaderboardEmbed(mapName, mapUid, thumbnailUrl, countryCode, records, playerNames, t) {
    const countryName = await getZoneName(countryCode);
    const embed = new EmbedBuilder()
        .setTitle(`🏆 ${countryName} Weekly Short: ${mapName || mapUid}`)
        .setColor(0xFF6B6B)
        .setAuthor({ name: `Trackmania Weekly Shorts`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(`Top ${records.length} ${countryName} records for this weekly short map`)
        .setTimestamp(new Date());

    if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (records.length === 0) {
        embed.addFields({
            name: `No ${countryName} Records`,
            value: `No records found for ${countryName} players on this map.`,
            inline: false
        });
    } else {
        records.forEach((record, index) => {
            const playerName = playerNames[record.accountId] || 'Unknown Player';
            const position = record.position || (index + 1);

            embed.addFields({
                name: `#${index + 1}: ${playerName}`,
                value: `Position: **#${position}** worldwide`,
                inline: false
            });
        });
    }

    return embed;
}

/**
 * Gets player positions for a weekly short map using the leaderboard endpoint
 * @param {string} mapUid - The map UID
 * @param {string} seasonUid - The season UID
 * @param {string[]} accountIds - Array of account IDs to check
 * @param {number} maxPosition - Maximum position to scan (default: 10000)
 * @returns {Promise<Object>} Object with player records including positions
 */
async function getWeeklyShortPlayerPositions(mapUid, seasonUid, accountIds, maxPosition = 10000) {
    const liveToken = await ensureToken('NadeoLiveServices');

    try {
        const playerRecords = {};
        let offset = 0;
        const limit = 100;
        
        while (Object.keys(playerRecords).length < accountIds.length && offset < maxPosition) {
            const response = await makeRateLimitedRequest({
                method: 'get',
                url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/${seasonUid}/map/${mapUid}/top?length=${limit}&onlyWorld=true&offset=${offset}`,
                headers: { Authorization: `nadeo_v1 t=${liveToken}` }
            });

            if (!response.data?.tops || !response.data.tops[0]?.top?.length) {
                break;
            }

            const records = response.data.tops[0].top;
            
            for (const record of records) {
                if (accountIds.includes(record.accountId)) {
                    playerRecords[record.accountId] = {
                        position: record.position,
                        score: record.score,
                        timestamp: record.timestamp
                    };
                }
            }
            
            if (Object.keys(playerRecords).length === accountIds.length) {
                break;
            }
            
            offset += limit;
        }
        
        return playerRecords;
    } catch (error) {
        log(`Error getting weekly short player positions: ${error.message}`, 'error');
        return {};
    }
}

/**
 * Fetches the current weekly short campaign
 * @returns {Promise<Object>} Weekly short campaign data
 */
export async function fetchCurrentWeeklyShort() {
    const liveToken = await ensureToken('NadeoLiveServices');
    log('Fetching current weekly short...');

    const response = await makeRateLimitedRequest({
        method: 'get',
        url: 'https://live-services.trackmania.nadeo.live/api/campaign/weekly-shorts?offset=0&length=1',
        headers: { Authorization: `nadeo_v1 t=${liveToken}` }
    });

    const campaign = response.data.campaignList[0];
    if (!campaign) {
        throw new Error('No weekly short campaign found');
    }

    log(`Using weekly short: ${campaign.name}`);
    return campaign;
}

/**
 * Fetches the leaderboard for a specific weekly short map
 * @param {string} mapUid - The map UID
 * @param {string} seasonUid - The season UID for the weekly short
 * @param {number} length - Number of records to fetch
 * @param {number} offset - Offset for fetching records
 * @returns {Promise<Array>} Array of leaderboard records
 */
export async function fetchWeeklyShortLeaderboard(mapUid, seasonUid, length = 100, offset = 0) {
    const liveToken = await ensureToken('NadeoLiveServices');

    log(`Fetching weekly short leaderboard for map ${mapUid} (offset: ${offset}, length: ${length})`);
    
    const response = await makeRateLimitedRequest({
        method: 'get',
        url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/${seasonUid}/map/${mapUid}/top?length=${length}&onlyWorld=true&offset=${offset}`,
        headers: { Authorization: `nadeo_v1 t=${liveToken}` }
    });

    if (!response.data?.tops || !response.data.tops[0]?.top) {
        log(`No leaderboard data found for map ${mapUid} at offset ${offset}`);
        return [];
    }

    const records = response.data.tops[0].top;
    log(`Retrieved ${records.length} records from offset ${offset}`);
    return records;
}

/**
 * Stores or updates weekly short map information in the database
 * @param {Database} db - Database connection
 * @param {string} mapUid - Map's unique identifier
 * @param {string} mapId - Map's ID from the API
 * @param {string} name - Map name
 * @param {string} seasonUid - Season/campaign UID
 * @param {number} position - Map position in the campaign
 * @param {string} thumbnailUrl - Map thumbnail URL
 * @returns {Promise<number>} Database ID of the stored/updated map
 */
export async function storeWeeklyShortMap(db, mapUid, mapId, name, seasonUid, position, thumbnailUrl) {
    try {
        const existingMap = await db.get('SELECT id FROM weekly_short_maps WHERE map_uid = ?', mapUid);

        if (existingMap) {
            await db.run(
                `UPDATE weekly_short_maps
                 SET map_id = ?, name = ?, season_uid = ?, position = ?, thumbnail_url = ?, last_checked = CURRENT_TIMESTAMP
                 WHERE map_uid = ?`,
                [mapId, name, seasonUid, position, thumbnailUrl, mapUid]
            );
            return existingMap.id;
        } else {
            const result = await db.run(
                `INSERT INTO weekly_short_maps (map_uid, map_id, name, season_uid, position, thumbnail_url)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [mapUid, mapId, name, seasonUid, position, thumbnailUrl]
            );
            return result.lastID;
        }
    } catch (error) {
        log(`Error storing weekly short map: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Updates a player's record for a weekly short map based on timestamp
 * @param {Database} db - Database connection
 * @param {number} playerId - Player database ID
 * @param {number} mapId - Map database ID
 * @param {number} position - The player's position on the leaderboard
 * @param {number} timestamp - The timestamp when the record was set
 * @returns {Object} Result object indicating if it's a new personal best
 */
async function updateWeeklyShortRecord(db, playerId, mapId, position, timestamp) {
    try {
        const currentRecord = await db.get(
            'SELECT position, timestamp FROM weekly_short_records WHERE player_id = ? AND map_id = ?',
            [playerId, mapId]
        );

        if (!currentRecord) {
            await db.run(
                `INSERT INTO weekly_short_history (player_id, map_id, position, previous_position, timestamp) 
                 VALUES (?, ?, ?, ?, ?)`,
                [playerId, mapId, position, null, timestamp]
            );

            await db.run(
                `INSERT INTO weekly_short_records (player_id, map_id, position, timestamp, announced) 
                 VALUES (?, ?, ?, ?, 1)`,
                [playerId, mapId, position, timestamp]
            );

            return {
                improved: false,
                isFirstRecord: true,
                previousPosition: null
            };
        } else if (timestamp > currentRecord.timestamp) {
            await db.run(
                `INSERT INTO weekly_short_history (player_id, map_id, position, previous_position, timestamp) 
                 VALUES (?, ?, ?, ?, ?)`,
                [playerId, mapId, position, currentRecord.position, timestamp]
            );

            await db.run(
                `UPDATE weekly_short_records 
                 SET position = ?, timestamp = ?, recorded_at = CURRENT_TIMESTAMP, announced = 0
                 WHERE player_id = ? AND map_id = ?`,
                [position, timestamp, playerId, mapId]
            );

            return {
                improved: true,
                previousPosition: currentRecord.position,
                isFirstRecord: false
            };
        }
        return {
            improved: false,
            isFirstRecord: false
        };
    } catch (error) {
        log(`Error updating weekly short record: ${error.message}`, 'error');
        return {
            improved: false,
            isFirstRecord: false,
            error: error.message
        };
    }
}

/**
 * Creates a Discord embed for a weekly short personal best announcement
 * @param {Object} record - The record to announce
 * @param {Object} t - Translation strings
 * @returns {EmbedBuilder} Discord embed for the announcement
 */
export function createWeeklyShortEmbed(record, t) {
    const isImprovement = record.previous_position !== null;
    const emoji = '🏆';

    const recordType = isImprovement 
        ? 'set a new personal best' 
        : 'set their first time';

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} Weekly Short New PB!`)
        .setColor(0xFF6B6B)
        .setDescription(`**${record.username || 'Player'}** (<@${record.discord_id}>) ${recordType}`)
        .setAuthor({ name: 'Trackmania Weekly Shorts', iconURL: TRACKMANIA_ICON_URL })
        .addFields(
            { name: 'Map', value: `**${record.map_name || 'Unknown Map'}**`, inline: false },
            { name: 'Current Position', value: `**#${record.position}**`, inline: true }
        );

    if (record.thumbnail_url && record.thumbnail_url.startsWith('http')) {
        embed.setThumbnail(record.thumbnail_url);
    }

    if (record.previous_position) {
        const positionChange = record.previous_position - record.position;
        let changeText;
        if (positionChange > 0) {
            changeText = `↑ ${positionChange} places`;
        } else if (positionChange < 0) {
            changeText = `↓ ${Math.abs(positionChange)} places`;
        } else {
            changeText = '→ Same position';
        }
        
        embed.addFields(
            { name: 'Previous Position', value: `#${record.previous_position}`, inline: true },
            { name: 'Position Change', value: changeText, inline: true }
        );
    }

    embed.setTimestamp(new Date())
        .setFooter({ text: 'New personal best time set!' });

    return embed;
}

/**
 * Checks and updates weekly short positions for all tracked players
 * @param {Client} client - Discord.js client instance
 * @param {number} defaultMaxPosition - Default maximum leaderboard position to scan (default: 10000)
 */
export async function checkWeeklyShorts(client, defaultMaxPosition = 10000) {
    const db = await getDb();

    try {
        log('Starting weekly shorts check...');

        const players = await getPlayers();
        if (players.length === 0) {
            log('No players registered, skipping weekly shorts check');
            return;
        }

        const campaign = await fetchCurrentWeeklyShort();
        const seasonUid = campaign.seasonUid;
        const mapUids = campaign.playlist.map(m => m.mapUid);
        
        log(`Fetching info for ${mapUids.length} weekly short maps`);
        const mapList = await fetchMapInfo(mapUids);
        const accountIds = players.map(p => p.account_id);
        
        const guilds = client.guilds.cache;
        let lowestMinPosition = defaultMaxPosition;
        
        for (const [guildId] of guilds) {
            try {
                const minPosition = await getMinWorldPosition(guildId);
                if (minPosition < lowestMinPosition) {
                    lowestMinPosition = minPosition;
                }
            } catch (error) {
                log(`Error getting min position for guild ${guildId}: ${error.message}`, 'warn');
            }
        }
        
        log(`Using minimum position threshold: ${lowestMinPosition} (from guild settings)`);
        
        for (let i = 0; i < mapList.length; i++) {
            const map = mapList[i];
            const mapInfo = campaign.playlist[i];
            const mapUid = map.uid;
            const mapId = map.mapId;
            const mapName = map.name || `Week ${campaign.week} - Map ${mapInfo.position + 1}`;
            const mapPosition = mapInfo.position;
            const thumbnailUrl = map.thumbnailUrl;
            
            if (!mapId) {
                log(`No mapId found for map ${mapUid}, skipping`, 'warn');
                continue;
            }
            
            const dbMapId = await storeWeeklyShortMap(db, mapUid, mapId, mapName, seasonUid, mapPosition, thumbnailUrl);

            log(`Fetching current records for weekly short map ${mapName} (${mapUid})`);
            const coreToken = await ensureToken('NadeoServices');
            const recordResponse = await makeRateLimitedRequest({
                method: 'get',
                url: `https://prod.trackmania.core.nadeo.online/v2/mapRecords/?accountIdList=${accountIds.join(',')}&mapId=${mapId}&seasonId=${seasonUid}`,
                headers: { Authorization: `nadeo_v1 t=${coreToken}` }
            });

            const currentRecords = {};
            const playersWithNewRecords = [];
            
            if (recordResponse.data && Array.isArray(recordResponse.data)) {
                for (const record of recordResponse.data) {
                    if (!record.removed) {
                        const accountId = record.accountId;
                        const timestamp = record.timestamp ? new Date(record.timestamp).getTime() : 0;
                        
                        currentRecords[accountId] = {
                            timestamp,
                            time: record.recordScore?.time || record.time
                        };
                        
                        const player = players.find(p => p.account_id === accountId);
                        if (player) {
                            const existingRecord = await db.get(
                                'SELECT timestamp FROM weekly_short_records WHERE player_id = ? AND map_id = ?',
                                [player.id, dbMapId]
                            );
                            
                            if (!existingRecord || timestamp > existingRecord.timestamp) {
                                playersWithNewRecords.push(accountId);
                                log(`Player ${accountId} has a new/improved record (timestamp: ${timestamp})`);
                            }
                        }
                    }
                }
            }

            if (playersWithNewRecords.length === 0) {
                log(`No new records on map ${mapPosition + 1} - skipping position checks`);
                continue;
            }

            log(`Fetching positions for ${playersWithNewRecords.length} players with new records (max position: ${lowestMinPosition})`);
            const playerPositions = await getWeeklyShortPlayerPositions(mapUid, seasonUid, playersWithNewRecords, lowestMinPosition);

            for (const accountId of playersWithNewRecords) {
                const player = players.find(p => p.account_id === accountId);
                if (!player || !playerPositions[accountId]) continue;

                const position = playerPositions[accountId].position;
                const timestamp = currentRecords[accountId].timestamp;
                
                log(`Processing improved record: ${accountId} on map ${mapPosition + 1}: #${position} (timestamp: ${timestamp})`);
                const result = await updateWeeklyShortRecord(db, player.id, dbMapId, position, timestamp);

                if (result.isFirstRecord || result.improved) {
                    if (result.isFirstRecord) {
                        log(`First record for ${accountId} on map ${mapPosition + 1}: #${position}`);
                    } else {
                        log(`New PB for ${accountId} on map ${mapPosition + 1}: #${position} (previous: #${result.previousPosition})`);
                    }
                }
            }
        }

        await announceWeeklyShortUpdates(client, db);

        log('Weekly shorts check completed successfully');
    } catch (err) {
        log(`Error checking weekly shorts: ${err.message}`, 'error');

        if (err.response?.status === 401) {
            invalidateTokens();
            log('Refreshing Nadeo tokens and retrying...', 'warn');
            await checkWeeklyShorts(client, lowestMinPosition);
        }
    }
}



/**
 * Gets unannounced weekly short updates from the database
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of unannounced records
 */
async function getUnannouncedWeeklyShorts(db) {
    const records = await db.all(`
        SELECT 
            r.id as record_id,
            p.discord_id, 
            p.username,
            p.account_id,
            m.map_uid, 
            m.name as map_name,
            m.thumbnail_url,
            r.position,
            h.previous_position
        FROM 
            weekly_short_records r
        JOIN 
            players p ON r.player_id = p.id
        JOIN 
            weekly_short_maps m ON r.map_id = m.id
        LEFT JOIN 
            weekly_short_history h ON (
                h.player_id = r.player_id 
                AND h.map_id = r.map_id 
                AND h.recorded_at = (
                    SELECT MAX(recorded_at) 
                    FROM weekly_short_history 
                    WHERE player_id = r.player_id AND map_id = r.map_id
                )
            )
        WHERE 
            r.announced = 0
        ORDER BY 
            r.recorded_at ASC
    `);

    if (records.length > 0 && tmOAuthClientId && tmOAuthClientSecret) {
        const accountIdsNeedingNames = [...new Set(
            records
                .filter(r => r.account_id && (!r.username || r.username === r.account_id))
                .map(r => r.account_id)
        )];

        if (accountIdsNeedingNames.length > 0) {
            try {
                const displayNames = await getDisplayNamesBatch(accountIdsNeedingNames);
                records.forEach(record => {
                    if (record.account_id && displayNames[record.account_id]) {
                        record.username = displayNames[record.account_id];
                    }
                });

                for (const accountId of accountIdsNeedingNames) {
                    if (displayNames[accountId]) {
                        await db.run(
                            'UPDATE players SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
                            [displayNames[accountId], accountId]
                        );
                    }
                }
            } catch (error) {
                log(`Failed to fetch display names for weekly shorts: ${error.message}`, 'warn');
            }
        }
    }

    return records;
}

/**
 * Marks weekly short records as announced
 * @param {Database} db - Database connection
 * @param {number[]} recordIds - Array of record IDs to mark as announced
 */
async function markWeeklyShortsAsAnnounced(db, recordIds) {
    if (recordIds.length === 0) return;

    const placeholders = recordIds.map(() => '?').join(',');
    await db.run(
        `UPDATE weekly_short_records SET announced = 1 WHERE id IN (${placeholders})`,
        recordIds
    );
}

/**
 * Announces weekly short position updates to Discord channels
 * @param {Client} client - Discord.js client instance
 * @param {Database} db - Database connection
 */
async function announceWeeklyShortUpdates(client, db) {
    try {
        const records = await getUnannouncedWeeklyShorts(db);

        if (records.length === 0) {
            log('No new weekly short positions to announce');
            return;
        }

        log(`Found ${records.length} weekly short updates to announce`);

        const guilds = client.guilds.cache;
        const recordIds = [];

        for (const record of records) {
            let announced = false;

            for (const [guildId, guild] of guilds) {
                const guildSettings = await db.get('SELECT weekly_shorts_channel_id FROM guild_settings WHERE guild_id = ?', guildId);

                let channel = null;
                if (guildSettings && guildSettings.weekly_shorts_channel_id) {
                    channel = client.channels.cache.get(guildSettings.weekly_shorts_channel_id);
                } else {
                    const fallbackSettings = await db.get('SELECT records_channel_id FROM guild_settings WHERE guild_id = ?', guildId);
                    if (fallbackSettings && fallbackSettings.records_channel_id) {
                        channel = client.channels.cache.get(fallbackSettings.records_channel_id);
                    }
                }

                if (!channel) {
                    channel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages'));
                }

                if (!channel) continue;

                const minPosition = await getMinWorldPosition(guildId);
                if (record.position && record.position > minPosition) {
                    log(`Weekly short position by ${record.username} (#${record.position}) does not meet minimum position (top ${minPosition}) for guild ${guildId}`);
                    continue;
                }

                const t = await getTranslations(guildId);
                const embed = createWeeklyShortEmbed(record, t);

                try {
                    await channel.send({ embeds: [embed] });
                    announced = true;
                    log(`Announced weekly short update for ${record.username} in guild ${guildId}`);
                } catch (sendError) {
                    log(`Failed to send weekly short announcement in guild ${guildId}: ${sendError.message}`, 'error');
                }

                await new Promise(r => setTimeout(r, 250));
            }

            if (announced) {
                recordIds.push(record.record_id);
            }
        }

        await markWeeklyShortsAsAnnounced(db, recordIds);

    } catch (error) {
        log(`Error announcing weekly shorts: ${error.message}`, 'error');
    }
}