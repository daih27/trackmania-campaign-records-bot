import { makeRateLimitedRequest } from './api.js';
import { ensureToken, invalidateTokens } from './auth.js';
import { formatTime, log } from './utils.js';
import { getDb } from './db.js';
import { getGuildPlayers } from './playerManager.js';
import { getTranslations, formatString } from './localization/index.js';
import { EmbedBuilder } from 'discord.js';
import { getZoneName, getZoneNamesForCountry } from './config/zones.js';
import { getDisplayNamesBatch } from './oauth.js';
import { tmOAuthClientId, tmOAuthClientSecret, TRACKMANIA_ICON_URL } from './config.js';
import { getMinWorldPosition } from './guildSettings.js';


/**
 * Creates a Discord embed for displaying season/campaign leaderboard data
 * @param {string} seasonName - The season/campaign name
 * @param {string} countryCode - The country zone ID
 * @param {Array} records - The leaderboard records
 * @param {Object} playerNames - Mapping of account IDs to display names
 * @param {Object} t - Translation strings
 * @returns {Promise<EmbedBuilder>} Discord embed for the season leaderboard
 */
export async function createSeasonLeaderboardEmbed(seasonName, countryCode, records, playerNames, t) {
    const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
    const embed = new EmbedBuilder()
        .setTitle(formatString(t.embeds.seasonLeaderboard?.title || '🏆 {country} Season Leaderboard: {season}', {
            country: countryName,
            season: seasonName
        }))
        .setColor(0x00BFFF)
        .setAuthor({ name: `Trackmania Campaign Records`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(formatString(t.embeds.seasonLeaderboard?.description || 'Top {count} {country} players in the current season:', {
            count: records.length,
            country: countryName
        }))
        .setTimestamp(new Date());

    if (records.length === 0) {
        embed.addFields({
            name: formatString(t.embeds.seasonLeaderboard?.noRecords || 'No {country} Records', { country: countryName }),
            value: formatString(t.embeds.seasonLeaderboard?.noRecordsDesc || 'No records found for {country} players in this season.', { country: countryName }),
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
                value: `${t.embeds.seasonLeaderboard?.points || 'Points'}: **${points.toLocaleString()}${pointsDifferential}**\n${t.embeds.seasonLeaderboard?.position || 'Position'}: #${record.position} ${t.embeds.seasonLeaderboard?.worldwide || 'worldwide'}`,
                inline: false
            });
        });
    }

    return embed;
}
/**
 * Fetches leaderboard data for a specific season/campaign filtered by country
 * @param {string} seasonUid - The season/campaign UID
 * @param {string} countryCode - The country zone ID
 * @param {number} limit - Number of records to retrieve
 * @returns {Promise<Array>} Array of leaderboard records for the specified country
 */
export async function fetchSeasonLeaderboard(seasonUid, countryCode, limit = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    if (countryCode === 'world') {
        const leaderboardRes = await makeRateLimitedRequest({
            method: 'get',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/${seasonUid}/top?length=${limit}&onlyWorld=true&offset=0`,
            headers: { Authorization: `nadeo_v1 t=${liveToken}` }
        });

        if (!leaderboardRes.data?.tops || !leaderboardRes.data.tops[0]?.top?.length) {
            return [];
        }

        const worldTop = leaderboardRes.data.tops[0].top.slice(0, limit);
        log(`Found ${worldTop.length} players in world season leaderboard`, 'debug');
        return worldTop;
    }

    const zoneNames = await getZoneNamesForCountry(countryCode);
    if (zoneNames.size === 0) {
        const countryName = await getZoneName(countryCode);
        log(`No zones found for country code: ${countryCode} (${countryName})`, 'warn');
        return [];
    }

    const countryName = await getZoneName(countryCode);
    log(`Fetching season leaderboard for ${countryName} (zones: ${Array.from(zoneNames).join(', ')})`, 'debug');
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

    log(`Found ${result.length} ${countryName} players in season leaderboard`);
    return result;
}

/**
 * Fetches the current official Trackmania campaign from the API
 * @returns {Promise<Object>} Campaign data including name, maps, and UIDs
 */
export async function fetchCurrentCampaign() {
    const liveToken = await ensureToken('NadeoLiveServices');
    log('Fetching current campaign...');

    const campRes = await makeRateLimitedRequest({
        method: 'get',
        url: 'https://live-services.trackmania.nadeo.live/api/campaign/official?offset=0&length=1',
        headers: { Authorization: `nadeo_v1 t=${liveToken}` }
    });

    const campaign = campRes.data.campaignList[0];
    log(`Using campaign: ${campaign.name}`);
    log(`Campaign leaderboardGroupUid: ${campaign.leaderboardGroupUid}`);
    log(`Campaign seasonUid: ${campaign.seasonUid}`);
    log(`Campaign playlist length: ${campaign.playlist?.length || 0}`);

    return campaign;
}

/**
 * Fetches detailed information for multiple maps by their UIDs
 * @param {string[]} mapUids - Array of map UIDs to fetch
 * @returns {Promise<Array>} Array of map information objects
 */
export async function fetchMapInfo(mapUids) {
    const liveToken = await ensureToken('NadeoLiveServices');

    log(`Fetching info for ${mapUids.length} maps`);
    const infoRes = await makeRateLimitedRequest({
        method: 'get',
        url: `https://live-services.trackmania.nadeo.live/api/token/map/get-multiple?mapUidList=${mapUids.join(',')}`,
        headers: { Authorization: `nadeo_v1 t=${liveToken}` }
    });

    return infoRes.data.mapList;
}

/**
 * Fetches the world ranking position for a specific time on a map
 * @param {string} mapUid - The map UID
 * @param {number} score - The time/score to get position for (in milliseconds)
 * @returns {Promise<number|null>} World position for the given time, or null if unavailable
 */
export async function fetchRecordPosition(mapUid, score) {
    const liveToken = await ensureToken('NadeoLiveServices');

    log(`Fetching world position for time ${score} on map ${mapUid}`);

    try {
        const response = await makeRateLimitedRequest({
            method: 'post',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/map?scores[${mapUid}]=${score}`,
            headers: {
                Authorization: `nadeo_v1 t=${liveToken}`,
                'Content-Type': 'application/json'
            },
            data: {
                maps: [
                    {
                        mapUid: mapUid,
                        groupUid: "Personal_Best"
                    }
                ]
            }
        });

        if (response.data && response.data.length > 0) {
            const result = response.data[0];
            if (result && result.zones) {
                const worldZone = result.zones.find(z => z.zoneName === 'World');
                if (worldZone && worldZone.ranking) {
                    return worldZone.ranking.position;
                }
            }
        }

        log(`Could not determine world position for time ${score} on map ${mapUid}`, 'warn');
        return null;
    } catch (error) {
        log(`Error fetching position: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Fetches personal best records for multiple players on a specific map
 * @param {string} mapId - The map ID
 * @param {string[]} accountIds - Array of player account IDs
 * @returns {Promise<Array>} Array of player records for the map
 */
export async function fetchPlayerRecords(mapId, accountIds) {
    const coreToken = await ensureToken('NadeoServices');

    log(`Fetching records for map ID ${mapId}`);
    const recRes = await makeRateLimitedRequest({
        method: 'get',
        url: `https://prod.trackmania.core.nadeo.online/v2/mapRecords/?accountIdList=${accountIds.join(',')}&mapId=${mapId}`,
        headers: { Authorization: `nadeo_v1 t=${coreToken}` }
    });

    let records = [];
    if (Array.isArray(recRes.data)) {
        records = recRes.data;
    } else if (recRes.data.records && Array.isArray(recRes.data.records)) {
        records = recRes.data.records;
    } else {
        log(`Could not find records in response for map ${mapId}`, 'warn');
    }

    return records;
}

/**
 * Fetch map leaderboard for a specific country
 * @param {string} mapUid The map UID
 * @param {string} countryCode The country zone ID
 * @param {number} length Number of records to retrieve
 * @returns {Promise<Array>} Leaderboard for the specified country
 */
export async function fetchCountryLeaderboard(mapUid, countryCode, length = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    if (countryCode === 'world') {
        const leaderboardRes = await makeRateLimitedRequest({
            method: 'get',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?length=${length}&onlyWorld=true&offset=0`,
            headers: { Authorization: `nadeo_v1 t=${liveToken}` }
        });

        if (!leaderboardRes.data?.tops || !leaderboardRes.data.tops[0]?.top?.length) {
            return [];
        }

        const worldTop = leaderboardRes.data.tops[0].top.slice(0, length);
        log(`Found ${worldTop.length} players in world leaderboard`);
        return worldTop;
    }

    const zoneNames = await getZoneNamesForCountry(countryCode);
    if (zoneNames.size === 0) {
        const countryName = await getZoneName(countryCode);
        log(`No zones found for country code: ${countryCode} (${countryName})`, 'warn');
        return [];
    }

    const countryName = await getZoneName(countryCode);
    log(`Searching for ${countryName} players (zones: ${Array.from(zoneNames).join(', ')})`);

    let countryRecords = [];
    let offset = 0;
    const maxOffset = 10000;

    while (countryRecords.length < length && offset < maxOffset) {
        const leaderboardRes = await makeRateLimitedRequest({
            method: 'get',
            url: `https://live-services.trackmania.nadeo.live/api/token/leaderboard/group/Personal_Best/map/${mapUid}/top?length=100&onlyWorld=true&offset=${offset}`,
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
        .slice(0, length);

    log(`Found ${result.length} ${countryName} players out of ${countryRecords.length} total after searching`);
    return result;
}

/**
 * Fetch player display names by account IDs - Updated to use OAuth API
 * @param {string[]} accountIds Array of account IDs
 * @returns {Promise<Object>} Mapping of account IDs to display names
 */
export async function fetchPlayerNames(accountIds) {
    if (!accountIds || accountIds.length === 0) return {};

    if (tmOAuthClientId && tmOAuthClientSecret) {
        try {
            log(`Fetching display names from OAuth API for ${accountIds.length} players`);
            return await getDisplayNamesBatch(accountIds);
        } catch (oauthError) {
            log(`Failed to fetch from OAuth API: ${oauthError.message}`, 'warn');
        }
    }
}

/**
 * Updates or inserts a player's record for a specific map in the database
 * @param {Database} db - Database connection
 * @param {number} playerId - Player database ID
 * @param {number} mapId - Map database ID
 * @param {number} timeMs - Record time in milliseconds
 * @param {Date} playerRegisteredAt - When the player registered with the bot
 * @param {string|number|Date} recordTimestamp - When the record was set
 * @returns {Object} Result object indicating if record was improved or is new
 */
async function updateMapRecord(db, playerId, mapId, timeMs, playerRegisteredAt, recordTimestamp, useTimeComparison = true) {
    try {
        const currentRecord = await db.get(
            'SELECT time_ms, recorded_at FROM records WHERE player_id = ? AND map_id = ?',
            [playerId, mapId]
        );

        let recordDate;
        if (typeof recordTimestamp === 'string') {
            recordDate = new Date(recordTimestamp);
        } else if (typeof recordTimestamp === 'number') {
            recordDate = new Date(recordTimestamp);
        } else if (recordTimestamp instanceof Date) {
            recordDate = recordTimestamp;
        } else {
            recordDate = new Date();
        }

        let regDate;
        if (playerRegisteredAt instanceof Date) {
            regDate = new Date(Date.UTC(
                playerRegisteredAt.getUTCFullYear(),
                playerRegisteredAt.getUTCMonth(),
                playerRegisteredAt.getUTCDate(),
                playerRegisteredAt.getUTCHours(),
                playerRegisteredAt.getUTCMinutes(),
                playerRegisteredAt.getUTCSeconds(),
                playerRegisteredAt.getUTCMilliseconds()
            ));
        } else if (typeof playerRegisteredAt === 'string') {
            const utcString = playerRegisteredAt.endsWith('Z') ?
                playerRegisteredAt :
                playerRegisteredAt.replace(' ', 'T') + 'Z';
            regDate = new Date(utcString);
        } else {
            regDate = new Date(playerRegisteredAt);
        }

        if (!currentRecord) {
            try {
                await db.run(
                    `INSERT INTO record_history (player_id, map_id, time_ms, previous_time_ms) 
                     VALUES (?, ?, ?, ?)`,
                    [playerId, mapId, timeMs, null]
                );
            } catch (historyError) {
                log(`Warning: Failed to insert record history for player ${playerId} on map ${mapId}: ${historyError.message}`, 'warn');
            }

            const result = await db.run(
                `INSERT INTO records (player_id, map_id, time_ms, recorded_at, announced) 
                 VALUES (?, ?, ?, datetime('now', 'utc'), 0)`,
                [playerId, mapId, timeMs]
            );

            const recordId = result.lastID;

            const existedBeforeRegistration = recordDate < regDate;

            log(`New record for player ${playerId} on map ${mapId}: ${timeMs}ms (timestamp: ${recordDate.toISOString()}, registration: ${regDate.toISOString()}, pre-existing: ${existedBeforeRegistration})`);

            return {
                improved: false,
                isFirstRecord: true,
                recordId: recordId,
                existedBeforeRegistration: existedBeforeRegistration
            };
        }
        else {
            const currentRecordDate = currentRecord.recorded_at ? 
                new Date(currentRecord.recorded_at + 'Z') : 
                new Date(0);
            
            if (recordDate > currentRecordDate) {
                try {
                    await db.run(
                        `INSERT INTO record_history (player_id, map_id, time_ms, previous_time_ms) 
                         VALUES (?, ?, ?, ?)`,
                        [playerId, mapId, timeMs, currentRecord.time_ms]
                    );
                } catch (historyError) {
                    log(`Warning: Failed to insert record history for player ${playerId} on map ${mapId}: ${historyError.message}`, 'warn');
                }

                await db.run(
                    `UPDATE records 
                     SET time_ms = ?, recorded_at = datetime('now', 'utc'), announced = 0
                     WHERE player_id = ? AND map_id = ?`,
                    [timeMs, playerId, mapId]
                );

                const record = await db.get(
                    'SELECT id FROM records WHERE player_id = ? AND map_id = ?',
                    [playerId, mapId]
                );

                const existedBeforeRegistration = recordDate < regDate;
                
                if (!existedBeforeRegistration && record) {
                    try {
                        await db.run(
                            `DELETE FROM guild_announcement_status 
                             WHERE record_id = ? AND (ineligible_for_announcement = 1 OR existed_before_registration = 1)`,
                            [record.id]
                        );
                        log(`Cleared previous ineligible status for improved record ${record.id} (player ${playerId} on map ${mapId})`);
                    } catch (clearError) {
                        log(`Warning: Failed to clear previous ineligible status for record ${record.id}: ${clearError.message}`, 'warn');
                    }
                }
                
                log(`Improved record for player ${playerId} on map ${mapId}: ${timeMs}ms (was ${currentRecord.time_ms}ms, API: ${recordDate.toISOString()}, DB: ${currentRecordDate.toISOString()}, pre-existing: ${existedBeforeRegistration})`);

                return {
                    improved: true,
                    previousTime: currentRecord.time_ms,
                    isFirstRecord: false,
                    recordId: record ? record.id : null,
                    existedBeforeRegistration: existedBeforeRegistration
                };
            } else {
                log(`No improvement for player ${playerId} on map ${mapId}: API timestamp ${recordDate.toISOString()} <= DB timestamp ${currentRecordDate.toISOString()}`);
            }
        }
        return {
            improved: false,
            isFirstRecord: false
        };
    } catch (error) {
        log(`Error updating record: ${error.message}`, 'error');
        return {
            improved: false,
            isFirstRecord: false,
            error: error.message
        };
    }
}

/**
 * Stores or updates map information in the database
 * @param {Database} db - Database connection
 * @param {string} mapUid - Map's unique identifier
 * @param {string} mapId - Map's ID from the API
 * @param {string} name - Map name
 * @param {string} seasonUid - Season/campaign UID the map belongs to
 * @param {string} thumbnailUrl - URL for the map's thumbnail image
 * @returns {Promise<number>} Database ID of the stored/updated map
 */
export async function storeMap(db, mapUid, mapId, name, seasonUid, thumbnailUrl) {
    try {
        let cleanedName = name;
        const campaignMatch = name.match(/(.*\s+\d{4})\s*-\s*(\d+)/);
        if (campaignMatch) {
            const seasonName = campaignMatch[1].trim();
            const mapNumber = parseInt(campaignMatch[2]).toString().padStart(2, '0');
            cleanedName = `${seasonName} - ${mapNumber}`;
        }
        
        const existingMap = await db.get('SELECT id FROM maps WHERE map_uid = ?', mapUid);

        if (existingMap) {
            await db.run(
                `UPDATE maps
         SET map_id = ?, name = ?, season_uid = ?, thumbnail_url = ?, last_checked = CURRENT_TIMESTAMP
         WHERE map_uid = ?`,
                [mapId, cleanedName, seasonUid, thumbnailUrl, mapUid]
            );
            return existingMap.id;
        } else {
            const result = await db.run(
                `INSERT INTO maps (map_uid, map_id, name, season_uid, thumbnail_url)
         VALUES (?, ?, ?, ?, ?)`,
                [mapUid, mapId, cleanedName, seasonUid, thumbnailUrl]
            );
            return result.lastID;
        }
    } catch (error) {
        log(`Error storing map: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Retrieves all records that haven't been announced to Discord yet
 * Includes player information and previous times for improvements
 * Filters out records that are already marked as ineligible for specific guilds
 * @param {Database} db - Database connection
 * @param {string} guildId - Guild ID to check eligibility for
 * @returns {Promise<Array>} Array of unannounced record objects
 */
async function getUnannouncedRecords(db, guildId = null) {
    let query = `
    SELECT 
      r.id as record_id,
      p.discord_id, 
      p.username,
      p.account_id,
      m.map_uid, 
      m.name as map_name, 
      m.thumbnail_url,
      r.time_ms,
      r.recorded_at,
      rh.previous_time_ms
    FROM 
      records r
    JOIN 
      players p ON r.player_id = p.id
    JOIN 
      maps m ON r.map_id = m.id
    LEFT JOIN 
      record_history rh ON (
        rh.player_id = r.player_id 
        AND rh.map_id = r.map_id 
        AND rh.recorded_at = (
          SELECT MAX(recorded_at) 
          FROM record_history 
          WHERE player_id = r.player_id AND map_id = r.map_id
        )
      )
    WHERE 
      r.announced = 0`;

    const params = [];

    if (guildId) {
        query += `
      AND p.guild_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM guild_announcement_status gas
        WHERE gas.record_id = r.id 
        AND gas.guild_id = ?
        AND (gas.ineligible_for_announcement = 1 OR gas.existed_before_registration = 1)
      )`;
        params.push(guildId, guildId);
    }

    query += `
    ORDER BY 
      r.recorded_at ASC`;

    const records = await db.all(query, params);

    if (records.length > 0 && tmOAuthClientId && tmOAuthClientSecret) {
        const accountIdsNeedingNames = [...new Set(
            records
                .filter(r => r.account_id && (!r.username || r.username === r.account_id))
                .map(r => r.account_id)
        )];

        if (accountIdsNeedingNames.length > 0) {
            try {
                log(`Fetching display names for ${accountIdsNeedingNames.length} players in unannounced records`);
                const displayNames = await getDisplayNamesBatch(accountIdsNeedingNames);

                records.forEach(record => {
                    if (record.account_id && displayNames[record.account_id]) {
                        record.username = displayNames[record.account_id];
                    }
                });

                const db = await getDb();
                for (const accountId of accountIdsNeedingNames) {
                    if (displayNames[accountId]) {
                        await db.run(
                            'UPDATE players SET username = ?, updated_at = datetime(\'now\') WHERE account_id = ?',
                            [displayNames[accountId], accountId]
                        );
                    }
                }
            } catch (error) {
                log(`Failed to fetch display names for unannounced records: ${error.message}`, 'warn');
            }
        }
    }

    return records;
}


/**
 * Marks records as announced in the database to prevent duplicate announcements
 * Also cleans up guild-specific ineligibility markers for announced records
 * @param {Database} db - Database connection
 * @param {number[]} recordIds - Array of record IDs to mark as announced
 */
async function markRecordsAsAnnounced(db, recordIds) {
    if (recordIds.length === 0) return;

    try {
        const placeholders = recordIds.map(() => '?').join(',');
        
        await db.run('BEGIN TRANSACTION');
        
        const updateResult = await db.run(
            `UPDATE records SET announced = 1 WHERE id IN (${placeholders})`,
            recordIds
        );
        
        log(`Marked ${updateResult.changes} records as announced: [${recordIds.join(', ')}]`);
        
        const deleteResult = await db.run(
            `DELETE FROM guild_announcement_status WHERE record_id IN (${placeholders})`,
            recordIds
        );
        
        log(`Cleaned up ${deleteResult.changes} guild announcement status entries`);
        
        await db.run('COMMIT');
        
    } catch (error) {
        log(`Error marking records as announced: ${error.message}`, 'error');
        try {
            await db.run('ROLLBACK');
        } catch (rollbackError) {
            log(`Error rolling back transaction: ${rollbackError.message}`, 'error');
        }
        throw error;
    }
}

/**
 * Main function that checks for new records across all maps in the current campaign
 * Fetches current campaign, retrieves player records, and announces improvements
 * @param {Client} client - Discord.js client instance
 */
export async function checkRecords(client) {
    const db = await getDb();

    try {
        log('Starting record check...');

        const isAnyEnabled = await import('./guildSettings.js').then(module => module.isAnyCampaignAnnouncementsEnabled());
        const disabledGuilds = [];
        
        const guilds = client.guilds.cache;
        for (const [guildId, guild] of guilds) {
            const isEnabled = await import('./guildSettings.js').then(module => module.getCampaignAnnouncementsStatus(guildId));
            if (!isEnabled) {
                disabledGuilds.push(guildId);
            }
        }
        
        if (!isAnyEnabled) {
            log('Campaign announcements are disabled for all guilds, but continuing to scan records (will not announce)');
        } else {
            log(`Campaign announcements are disabled for ${disabledGuilds.length} guilds`);
        }

        const guildPlayerMap = new Map();
        const allAccountIds = new Set();
        let lowestMinPosition = 10000;

        for (const [guildId, guild] of guilds) {
            const guildPlayers = await getGuildPlayers(guildId);
            if (guildPlayers.length > 0) {
                guildPlayerMap.set(guildId, guildPlayers);
                guildPlayers.forEach(p => allAccountIds.add(p.account_id));

                try {
                    const minPosition = await getMinWorldPosition(guildId);
                    if (minPosition < lowestMinPosition) {
                        lowestMinPosition = minPosition;
                    }
                } catch (error) {
                    log(`Error getting min position for guild ${guildId}: ${error.message}`, 'warn');
                }
            }
        }

        if (allAccountIds.size === 0) {
            log('No players registered across all guilds, skipping record check');
            return;
        }

        log(`Using minimum position threshold: ${lowestMinPosition} (from guild settings)`);

        const campaign = await fetchCurrentCampaign();
        const seasonId = campaign.leaderboardGroupUid;
        const mapUids = campaign.playlist.map(m => m.mapUid);
        log(`Found ${mapUids.length} maps in current campaign`);
        log(`Checking records for ${allAccountIds.size} unique players across ${guildPlayerMap.size} guilds`);

        const mapList = await fetchMapInfo(mapUids);
        const accountIds = Array.from(allAccountIds);

        const playersWithUpdates = new Set();

        for (const map of mapList) {
            const mapUid = map.uid;
            const mapId = map.mapId;
            const mapName = map.name;

            if (!mapId) {
                log(`No mapId found for map ${mapUid}, skipping`, 'warn');
                continue;
            }

            const thumbnailUrl = map.thumbnailUrl;
            const dbMapId = await storeMap(db, mapUid, mapId, mapName, seasonId, thumbnailUrl);

            try {
                log(`Fetching records for map ${mapName} (${mapUid})`);

                const records = await fetchPlayerRecords(mapId, accountIds);
                log(`Found ${records.length} records for map ${mapName}`);

                for (const rec of records) {
                    const accountId = rec.accountId;

                    let time;
                    if (rec.recordScore && rec.recordScore.time) {
                        time = rec.recordScore.time;
                    } else if (rec.time) {
                        time = rec.time;
                    } else {
                        log(`Couldn't find time in record for ${accountId} on ${mapUid}`, 'warn');
                        continue;
                    }

                    let player = null;
                    let playerGuildId = null;
                    for (const [guildId, guildPlayers] of guildPlayerMap) {
                        player = guildPlayers.find(p => p.account_id === accountId);
                        if (player) {
                            playerGuildId = guildId;
                            break;
                        }
                    }

                    if (!player) {
                        log(`Unknown player with accountId ${accountId}`, 'warn');
                        continue;
                    }

                    const alreadyProcessedRecord = await db.get(
                        `SELECT r.id FROM records r 
                         WHERE r.player_id = ? AND r.map_id = ? 
                         AND r.time_ms = ? AND r.announced = 0`,
                        [player.id, dbMapId, time]
                    );

                    if (alreadyProcessedRecord) {
                        const eligibilityStatus = await db.get(
                            `SELECT COUNT(DISTINCT guild_id) as ineligible_count,
                                    (SELECT COUNT(*) FROM guild_settings) as total_guilds
                             FROM guild_announcement_status 
                             WHERE record_id = ? AND ineligible_for_announcement = 1`,
                            [alreadyProcessedRecord.id]
                        );

                        if (eligibilityStatus && eligibilityStatus.ineligible_count >= eligibilityStatus.total_guilds) {
                            log(`Record ${accountId} on ${mapName} already marked ineligible for all guilds`);
                            continue;
                        }
                    }

                    const recordTimestamp = rec.timestamp || new Date().toISOString();
                    log(`Processing record for ${accountId} on ${mapName}: ${time}ms (timestamp: ${recordTimestamp})`);

                    const guildEligibility = new Map();
                    for (const [guildId, guildPlayers] of guildPlayerMap) {
                        const guildPlayer = guildPlayers.find(p => p.account_id === accountId);
                        if (guildPlayer) {
                            let guildRegisteredAt;
                            if (guildPlayer.registered_at) {
                                if (typeof guildPlayer.registered_at === 'string') {
                                    const utcString = guildPlayer.registered_at.endsWith('Z') ?
                                        guildPlayer.registered_at :
                                        guildPlayer.registered_at.replace(' ', 'T') + 'Z';
                                    guildRegisteredAt = new Date(utcString);
                                } else if (guildPlayer.registered_at instanceof Date) {
                                    guildRegisteredAt = new Date(Date.UTC(
                                        guildPlayer.registered_at.getUTCFullYear(),
                                        guildPlayer.registered_at.getUTCMonth(),
                                        guildPlayer.registered_at.getUTCDate(),
                                        guildPlayer.registered_at.getUTCHours(),
                                        guildPlayer.registered_at.getUTCMinutes(),
                                        guildPlayer.registered_at.getUTCSeconds(),
                                        guildPlayer.registered_at.getUTCMilliseconds()
                                    ));
                                } else {
                                    guildRegisteredAt = new Date(guildPlayer.registered_at);
                                }
                            } else {
                                guildRegisteredAt = new Date();
                            }
                            
                            const recordDate = new Date(recordTimestamp);
                            const existedBeforeRegistration = recordDate < guildRegisteredAt;
                            guildEligibility.set(guildId, { existedBeforeRegistration, player: guildPlayer });
                            
                            log(`Guild ${guildId} eligibility for ${accountId}: record ${recordDate.toISOString()} vs registration ${guildRegisteredAt.toISOString()} = ${existedBeforeRegistration ? 'pre-existing' : 'eligible'}`);
                        }
                    }

                    const firstGuildPlayer = Array.from(guildEligibility.values())[0].player;
                    const result = await updateMapRecord(db, firstGuildPlayer.id, dbMapId, time, firstGuildPlayer.registered_at, recordTimestamp);

                    if (result.isFirstRecord || result.improved) {
                        playersWithUpdates.add(accountId);

                        if (result.recordId) {
                            for (const [guildId, eligibility] of guildEligibility) {
                                if (eligibility.existedBeforeRegistration) {
                                    await db.run(
                                        `INSERT OR IGNORE INTO guild_announcement_status 
                                         (guild_id, record_id, ineligible_for_announcement, existed_before_registration) 
                                         VALUES (?, ?, 1, 1)`,
                                        [guildId, result.recordId]
                                    );
                                    log(`Record for ${accountId} on ${mapName} marked as pre-existing for guild ${guildId}`);
                                } else {
                                    if (!isAnyEnabled) {
                                        await db.run(
                                            `INSERT OR IGNORE INTO guild_announcement_status 
                                             (guild_id, record_id, ineligible_for_announcement) 
                                             VALUES (?, ?, 1)`,
                                            [guildId, result.recordId]
                                        );
                                        log(`Record for ${accountId} on ${mapName} marked as ineligible for guild ${guildId} (all announcements disabled)`);
                                    } else if (disabledGuilds.includes(guildId)) {
                                        await db.run(
                                            `INSERT OR IGNORE INTO guild_announcement_status 
                                             (guild_id, record_id, ineligible_for_announcement) 
                                             VALUES (?, ?, 1)`,
                                            [guildId, result.recordId]
                                        );
                                        log(`Record for ${accountId} on ${mapName} marked as ineligible for guild ${guildId} (announcements disabled for this guild)`);
                                    }
                                }
                            }
                        }

                        if (result.isFirstRecord) {
                            const statusText = result.existedBeforeRegistration ? "(pre-existing)" : "(new)";
                            log(`New record discovered for ${accountId} on ${mapName}: ${time}ms ${statusText}`);
                        } else {
                            log(`Improved record for ${accountId} on ${mapName}: ${time}ms (previous: ${result.previousTime}ms)`);
                        }
                    }
                }
            } catch (mapError) {
                log(`Error processing map ${mapUid}: ${mapError.message}`, 'error');
            }
        }

        if (playersWithUpdates.size > 0 && tmOAuthClientId && tmOAuthClientSecret) {
            try {
                const updatedAccountIds = Array.from(playersWithUpdates);
                log(`Fetching display names for ${updatedAccountIds.length} players with updates`);

                const displayNames = await getDisplayNamesBatch(updatedAccountIds);
                for (const accountId of updatedAccountIds) {
                    if (displayNames[accountId]) {
                        for (const [guildId, guildPlayers] of guildPlayerMap) {
                            const player = guildPlayers.find(p => p.account_id === accountId);
                            if (player) {
                                await db.run(
                                    'UPDATE players SET username = ?, updated_at = datetime(\'now\') WHERE id = ?',
                                    [displayNames[accountId], player.id]
                                );
                            }
                        }
                    }
                }
            } catch (error) {
                log(`Failed to fetch display names for updated players: ${error.message}`, 'warn');
            }
        }

        await announceNewRecords(client, db);

        log('Record check completed successfully');
    } catch (err) {
        log(`Error checking records: ${err.message}`, 'error');

        if (err.response?.status === 401) {
            invalidateTokens();
            log('Refreshing Nadeo tokens and retrying...', 'warn');
            await checkRecords(client);
        }
    }
}

/**
 * Creates a Discord embed for announcing a new record or improvement
 * @param {Object} record - The record data to announce
 * @param {Object} t - Translation strings for localization
 * @param {number|null} worldPosition - The world ranking position for this time
 * @returns {EmbedBuilder} Discord embed for the record announcement
 */
export function createRecordEmbed(record, t, worldPosition = null) {
    const timeFormatted = formatTime(record.time_ms);
    const isImprovement = record.previous_time_ms !== null;

    let emoji = '🏆';

    const recordType = isImprovement ? t.embeds.newRecord.newPersonalBest : t.embeds.newRecord.firstRecord;
    
    const recordTimestamp = record.recorded_at ? new Date(record.recorded_at + 'Z') : new Date();

    const finalThumbnailUrl = record.thumbnail_url && record.thumbnail_url.startsWith('http') ? record.thumbnail_url : null;
    const embed = new EmbedBuilder()
        .setTitle(formatString(t.embeds.newRecord.title, { emoji }))
        .setColor(0x00BFFF)
        .setDescription(formatString(t.embeds.newRecord.description, {
            username: record.username || 'Player',
            discordId: record.discord_id,
            recordType
        }))
        .setAuthor({ name: 'Trackmania Campaign Records', iconURL: TRACKMANIA_ICON_URL })
        .setThumbnail(finalThumbnailUrl)
        .addFields(
            { name: t.embeds.newRecord.map, value: `**${record.map_name || record.map_uid}**`, inline: false }
        );

    let timeValue = `**${timeFormatted}**`;
    if (record.previous_time_ms) {
        const improvement = record.previous_time_ms - record.time_ms;
        const improvementFormatted = formatTime(improvement, true);
        timeValue += ` ${improvementFormatted}`;
    }

    embed.addFields(
        { name: t.embeds.newRecord.time, value: timeValue, inline: true }
    );

    if (record.previous_time_ms) {
        const prevTimeFormatted = formatTime(record.previous_time_ms);
        embed.addFields(
            { name: t.embeds.newRecord.previous, value: prevTimeFormatted, inline: true }
        );
    } else {
        embed.addFields(
            { name: '\u200b', value: '\u200b', inline: true }
        );
    }

    if (worldPosition) {
        embed.addFields(
            { name: t.embeds.newRecord.worldPosition || 'World Position', value: `**#${worldPosition}**`, inline: true }
        );
    } else {
        embed.addFields(
            { name: '\u200b', value: '\u200b', inline: true }
        );
    }

    embed.setTimestamp(recordTimestamp)
        .setFooter({
            text: formatString(t.embeds.newRecord.footer, {
                date: recordTimestamp.toLocaleDateString(),
                time: recordTimestamp.toLocaleTimeString()
            })
        });

    return embed;
}

/**
 * Create an embed for the country leaderboard
 * @param {string} mapName The map name
 * @param {string} mapUid The map UID
 * @param {string} thumbnailUrl URL for the map thumbnail
 * @param {string} countryCode The country zone ID
 * @param {Array} records The leaderboard records
 * @param {Object} playerNames Mapping of account IDs to display names
 * @param {Object} t Translation strings
 * @returns {Promise<EmbedBuilder>} The embed to display
 */
export async function createCountryLeaderboardEmbed(mapName, mapUid, thumbnailUrl, countryCode, records, playerNames, t) {
    const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
    const embed = new EmbedBuilder()
        .setTitle(formatString(t.embeds.countryLeaderboard.title, { mapName: mapName || mapUid, country: countryName }))
        .setColor(0x00BFFF)
        .setAuthor({ name: `Trackmania Campaign Records`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(formatString(t.embeds.countryLeaderboard.description, { count: records.length, country: countryName }))
        .setTimestamp(new Date());

    if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (records.length === 0) {
        embed.addFields({
            name: formatString(t.embeds.countryLeaderboard.noRecords, { country: countryName }),
            value: formatString(t.embeds.countryLeaderboard.noRecordsDesc, { country: countryName }),
            inline: false
        });
    } else {
        let firstPlayerTime = 0;
        if (records[0]) {
            const firstRecord = records[0];
            if (firstRecord.time !== undefined) {
                firstPlayerTime = firstRecord.time;
            } else if (firstRecord.score !== undefined) {
                firstPlayerTime = firstRecord.score;
            } else if (firstRecord.recordScore && firstRecord.recordScore.time !== undefined) {
                firstPlayerTime = firstRecord.recordScore.time;
            }
        }

        records.forEach((record, index) => {
            const playerName = playerNames[record.accountId] || 'Unknown Player';
            let recordScore = 0;
            if (record.time !== undefined) {
                recordScore = record.time;
            } else if (record.score !== undefined) {
                recordScore = record.score;
            } else if (record.recordScore && record.recordScore.time !== undefined) {
                recordScore = record.recordScore.time;
            }

            const timeFormatted = formatTime(recordScore);

            let timeDifferential = '';
            if (index > 0 && firstPlayerTime > 0) {
                const difference = recordScore - firstPlayerTime;
                timeDifferential = ` (+${formatTime(difference)})`;
            }

            const position = record.position || record.rank || (index + 1);

            embed.addFields({
                name: `#${index + 1}: ${playerName}`,
                value: `${t.embeds.countryLeaderboard.time}: **${timeFormatted}${timeDifferential}**\n${t.embeds.countryLeaderboard.position}: #${position} ${t.embeds.countryLeaderboard.worldwide}`,
                inline: false
            });
        });
    }

    return embed;
}

/**
 * Announces all unannounced records to appropriate Discord channels
 * Handles multi-guild support and respects configured announcement channels
 * @param {Client} client - Discord.js client instance
 * @param {Database} db - Database connection
 */
async function announceNewRecords(client, db) {
    try {
        const isAnyEnabled = await import('./guildSettings.js').then(module => module.isAnyCampaignAnnouncementsEnabled());
        if (!isAnyEnabled) {
            log('Campaign announcements are disabled for all guilds, skipping announcement phase');
            return;
        }
        
        const guilds = client.guilds.cache;
        const allGloballyUnannounced = await getUnannouncedRecords(db);

        if (allGloballyUnannounced.length === 0) {
            log('No new records to announce');
            return;
        }

        log(`Found ${allGloballyUnannounced.length} unannounced records to process`);
        
        const announcedInAnyGuild = new Set();

        for (const [guildId, guild] of guilds) {
            const isEnabled = await import('./guildSettings.js').then(module => module.getCampaignAnnouncementsStatus(guildId));
            if (!isEnabled) {
                log(`Campaign announcements are disabled for guild ${guildId}`);
                continue;
            }
            
            const guildEligibleRecords = await getUnannouncedRecords(db, guildId);

            if (guildEligibleRecords.length === 0) {
                log(`No eligible records for guild ${guildId}`);
                continue;
            }

            const guildSettings = await db.get('SELECT records_channel_id FROM guild_settings WHERE guild_id = ?', guildId);

            let channel = null;
            if (guildSettings && guildSettings.records_channel_id) {
                channel = client.channels.cache.get(guildSettings.records_channel_id);
            } else {
                channel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages'));
            }

            if (!channel) {
                log(`No available channel for guild ${guildId}`);
                continue;
            }

            const t = await getTranslations(guildId);
            const minPosition = await getMinWorldPosition(guildId);

            for (const record of guildEligibleRecords) {
                let worldPosition = null;
                
                try {
                    worldPosition = await fetchRecordPosition(record.map_uid, record.time_ms);
                    log(`World position for ${record.username} on ${record.map_name}: #${worldPosition}`);
                } catch (positionError) {
                    log(`Failed to fetch world position: ${positionError.message}`, 'warn');
                }

                if (worldPosition && worldPosition > minPosition) {
                    log(`Record by ${record.username} (#${worldPosition}) does not meet minimum position (top ${minPosition}) for guild ${guildId}`);

                    await db.run(
                        `INSERT OR IGNORE INTO guild_announcement_status (guild_id, record_id, ineligible_for_announcement) 
                         VALUES (?, ?, 1)`,
                        [guildId, record.record_id]
                    );
                    continue;
                }

                if (!worldPosition && minPosition < 10000) {
                    log(`Could not determine position for ${record.username} on ${record.map_name}, marking as ineligible for strict position requirement (${minPosition}) in guild ${guildId}`);
                    
                    await db.run(
                        `INSERT OR IGNORE INTO guild_announcement_status (guild_id, record_id, ineligible_for_announcement) 
                         VALUES (?, ?, 1)`,
                        [guildId, record.record_id]
                    );
                    continue;
                }

                const embed = createRecordEmbed(record, t, worldPosition);

                try {
                    await channel.send({ embeds: [embed] });
                    announcedInAnyGuild.add(record.record_id);
                    log(`Announced record for ${record.username} in guild ${guildId}`);
                } catch (sendError) {
                    log(`Failed to send record announcement in guild ${guildId}: ${sendError.message}`, 'error');
                    
                    await db.run(
                        `INSERT OR IGNORE INTO guild_announcement_status (guild_id, record_id, ineligible_for_announcement) 
                         VALUES (?, ?, 1)`,
                        [guildId, record.record_id]
                    );
                }

                await new Promise(r => setTimeout(r, 250));
            }
        }

        if (announcedInAnyGuild.size > 0) {
            try {
                await markRecordsAsAnnounced(db, Array.from(announcedInAnyGuild));
                log(`Successfully marked ${announcedInAnyGuild.size} records as announced globally`);
            } catch (markError) {
                log(`Failed to mark records as announced: ${markError.message}`, 'error');
                
                const recordIds = Array.from(announcedInAnyGuild);
                let successCount = 0;
                
                for (const recordId of recordIds) {
                    try {
                        await db.run('UPDATE records SET announced = 1 WHERE id = ?', [recordId]);
                        successCount++;
                    } catch (individualError) {
                        log(`Failed to mark individual record ${recordId} as announced: ${individualError.message}`, 'error');
                    }
                }
                
                log(`Individually marked ${successCount}/${recordIds.length} records as announced`);
            }
        }

        const allProcessedRecords = await db.all(`
            SELECT DISTINCT r.id 
            FROM records r 
            WHERE r.announced = 0 
            AND (
                SELECT COUNT(DISTINCT gas.guild_id) 
                FROM guild_announcement_status gas 
                WHERE gas.record_id = r.id 
                AND gas.ineligible_for_announcement = 1
            ) >= (
                SELECT COUNT(*) FROM guild_settings
            )
        `);

        if (allProcessedRecords.length > 0) {
            const recordIds = allProcessedRecords.map(r => r.id);
            try {
                await markRecordsAsAnnounced(db, recordIds);
                log(`Marked ${recordIds.length} records as announced (ineligible for all guilds)`);
            } catch (markError) {
                log(`Failed to mark ineligible records as announced: ${markError.message}`, 'error');
                
                let successCount = 0;
                for (const recordId of recordIds) {
                    try {
                        await db.run('UPDATE records SET announced = 1 WHERE id = ?', [recordId]);
                        successCount++;
                    } catch (individualError) {
                        log(`Failed to mark individual ineligible record ${recordId} as announced: ${individualError.message}`, 'error');
                    }
                }
                
                log(`Individually marked ${successCount}/${recordIds.length} ineligible records as announced`);
            }
        }

    } catch (error) {
        log(`Error announcing records: ${error.message}`, 'error');
    }
}