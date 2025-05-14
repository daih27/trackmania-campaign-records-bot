import { makeRateLimitedRequest } from './api.js';
import { ensureToken, invalidateTokens } from './auth.js';
import { formatTime, log } from './utils.js';
import { getDb } from './db.js';
import { getPlayers } from './playerManager.js';
import { getTranslations, formatString } from './localization/index.js';
import { EmbedBuilder } from 'discord.js';
import { REGIONS, getCountryName } from './config/regions.js';
import { getDisplayNamesBatch } from './oauth.js';
import { tmOAuthClientId, tmOAuthClientSecret, TRACKMANIA_ICON_URL } from './config.js';
import { getMinWorldPosition } from './guildSettings.js';


/**
 * Creates a Discord embed for displaying season/campaign leaderboard data
 * @param {string} seasonName - The season/campaign name
 * @param {string} countryCode - The country code (e.g., 'CHI')
 * @param {Array} records - The leaderboard records
 * @param {Object} playerNames - Mapping of account IDs to display names
 * @param {Object} t - Translation strings
 * @returns {EmbedBuilder} Discord embed for the season leaderboard
 */
export function createSeasonLeaderboardEmbed(seasonName, countryCode = 'CHI', records, playerNames, t) {
    const countryName = getCountryName(countryCode);
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
 * @param {string} countryCode - The country code (e.g., 'CHI')
 * @param {number} limit - Number of records to retrieve
 * @returns {Promise<Array>} Array of leaderboard records for the specified country
 */
export async function fetchSeasonLeaderboard(seasonUid, countryCode = 'CHI', limit = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    const regions = REGIONS[countryCode] || [];
    if (regions.length === 0) {
        log(`No regions found for country code: ${countryCode} (${getCountryName(countryCode)})`, 'warn');
        return [];
    }

    log(`Fetching season leaderboard for ${getCountryName(countryCode)}`);

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
            regions.includes(record.zoneName));

        countryRecords.push(...batchCountryRecords);
        offset += 100;
    }

    const result = countryRecords
        .sort((a, b) => a.position - b.position)
        .slice(0, limit);

    log(`Found ${result.length} ${getCountryName(countryCode)} players in season leaderboard`);
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
 * @param {string} countryCode The country code (e.g., 'CHI')
 * @param {number} length Number of records to retrieve
 * @returns {Promise<Array>} Leaderboard for the specified country
 */
export async function fetchCountryLeaderboard(mapUid, countryCode = 'CHI', length = 5) {
    const liveToken = await ensureToken('NadeoLiveServices');

    const regions = REGIONS[countryCode] || [];
    if (regions.length === 0) {
        log(`No regions found for country code: ${countryCode} (${getCountryName(countryCode)})`, 'warn');
        return [];
    }

    log(`Searching for ${getCountryName(countryCode)} players (regions: ${regions.join(', ')})`);

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
            regions.includes(record.zoneName));

        countryRecords.push(...batchCountryRecords);
        offset += 100;
    }

    const result = countryRecords
        .sort((a, b) => a.position - b.position)
        .slice(0, length);

    log(`Found ${result.length} ${getCountryName(countryCode)} players out of ${countryRecords.length} total after searching`);
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
 * Handles both new records and improvements to existing records
 * @param {Database} db - Database connection
 * @param {number} playerId - Player database ID
 * @param {number} mapId - Map database ID
 * @param {number} timeMs - Record time in milliseconds
 * @returns {Object} Result object indicating if record was improved or is new
 */
async function updateMapRecord(db, playerId, mapId, timeMs) {
    try {
        const currentRecord = await db.get(
            'SELECT time_ms FROM records WHERE player_id = ? AND map_id = ?',
            [playerId, mapId]
        );

        if (!currentRecord) {
            await db.run(
                `INSERT INTO record_history (player_id, map_id, time_ms, previous_time_ms) 
         VALUES (?, ?, ?, ?)`,
                [playerId, mapId, timeMs, null]
            );

            await db.run(
                `INSERT INTO records (player_id, map_id, time_ms, announced) 
         VALUES (?, ?, ?, 1)`,
                [playerId, mapId, timeMs]
            );

            return {
                improved: false,
                isFirstRecord: true
            };
        }
        else if (timeMs < currentRecord.time_ms) {
            await db.run(
                `INSERT INTO record_history (player_id, map_id, time_ms, previous_time_ms) 
         VALUES (?, ?, ?, ?)`,
                [playerId, mapId, timeMs, currentRecord.time_ms]
            );

            await db.run(
                `UPDATE records 
         SET time_ms = ?, recorded_at = CURRENT_TIMESTAMP, announced = 0
         WHERE player_id = ? AND map_id = ?`,
                [timeMs, playerId, mapId]
            );

            return {
                improved: true,
                previousTime: currentRecord.time_ms,
                isFirstRecord: false
            };
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
        const existingMap = await db.get('SELECT id FROM maps WHERE map_uid = ?', mapUid);

        if (existingMap) {
            await db.run(
                `UPDATE maps
         SET map_id = ?, name = ?, season_uid = ?, thumbnail_url = ?, last_checked = CURRENT_TIMESTAMP
         WHERE map_uid = ?`,
                [mapId, name, seasonUid, thumbnailUrl, mapUid]
            );
            return existingMap.id;
        } else {
            const result = await db.run(
                `INSERT INTO maps (map_uid, map_id, name, season_uid, thumbnail_url)
         VALUES (?, ?, ?, ?, ?)`,
                [mapUid, mapId, name, seasonUid, thumbnailUrl]
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
 * @param {Database} db - Database connection
 * @returns {Promise<Array>} Array of unannounced record objects
 */
async function getUnannouncedRecords(db) {
    const records = await db.all(`
    SELECT 
      r.id as record_id,
      p.discord_id, 
      p.username,
      p.account_id,
      m.map_uid, 
      m.name as map_name, 
      m.thumbnail_url,
      r.time_ms,
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
                            'UPDATE players SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE account_id = ?',
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
 * @param {Database} db - Database connection
 * @param {number[]} recordIds - Array of record IDs to mark as announced
 */
async function markRecordsAsAnnounced(db, recordIds) {
    if (recordIds.length === 0) return;

    const placeholders = recordIds.map(() => '?').join(',');
    await db.run(
        `UPDATE records SET announced = 1 WHERE id IN (${placeholders})`,
        recordIds
    );
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

        const players = await getPlayers();

        if (players.length === 0) {
            log('No players registered, skipping record check');
            return;
        }

        const campaign = await fetchCurrentCampaign();
        const seasonId = campaign.leaderboardGroupUid;
        const mapUids = campaign.playlist.map(m => m.mapUid);
        log(`Found ${mapUids.length} maps in current campaign`);

        const mapList = await fetchMapInfo(mapUids);
        const accountIds = players.map(p => p.account_id);

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

                    const player = players.find(p => p.account_id === accountId);
                    if (!player) {
                        log(`Unknown player with accountId ${accountId}`, 'warn');
                        continue;
                    }

                    log(`Processing record: ${accountId} on ${mapName}: ${time}ms`);

                    const result = await updateMapRecord(db, player.id, dbMapId, time);

                    if (result.isFirstRecord || result.improved) {
                        playersWithUpdates.add(accountId);

                        if (result.isFirstRecord) {
                            log(`First record for ${accountId} on ${mapName}: ${time}ms`);
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
                        const player = players.find(p => p.account_id === accountId);
                        if (player) {
                            await db.run(
                                'UPDATE players SET username = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                [displayNames[accountId], player.id]
                            );
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
    const now = new Date();

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

    embed.setTimestamp(new Date())
        .setFooter({
            text: formatString(t.embeds.newRecord.footer, {
                date: now.toLocaleDateString(),
                time: now.toLocaleTimeString()
            })
        });

    return embed;
}

/**
 * Create an embed for the country leaderboard
 * @param {string} mapName The map name
 * @param {string} mapUid The map UID
 * @param {string} thumbnailUrl URL for the map thumbnail
 * @param {string} countryCode The country code (e.g., 'CHI')
 * @param {Array} records The leaderboard records
 * @param {Object} playerNames Mapping of account IDs to display names
 * @param {Object} t Translation strings
 * @returns {EmbedBuilder} The embed to display
 */
export function createCountryLeaderboardEmbed(mapName, mapUid, thumbnailUrl, countryCode = 'CHI', records, playerNames, t) {
    const countryName = getCountryName(countryCode);
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
        const records = await getUnannouncedRecords(db);

        if (records.length === 0) {
            log('No new records to announce');
            return;
        }

        log(`Found ${records.length} new records to announce`);

        const guilds = client.guilds.cache;

        const recordIds = [];
        for (const record of records) {
            let announced = false;

            for (const [guildId, guild] of guilds) {
                const guildSettings = await db.get('SELECT records_channel_id FROM guild_settings WHERE guild_id = ?', guildId);

                let channel = null;
                if (guildSettings && guildSettings.records_channel_id) {
                    channel = client.channels.cache.get(guildSettings.records_channel_id);
                } else {
                    channel = guild.channels.cache.find(ch => ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages'));
                }

                if (!channel) {
                    continue;
                }

                const t = await getTranslations(guildId);

                let worldPosition = null;
                try {
                    worldPosition = await fetchRecordPosition(record.map_uid, record.time_ms);
                    log(`World position for ${record.username} on ${record.map_name}: #${worldPosition}`);
                } catch (positionError) {
                    log(`Failed to fetch world position: ${positionError.message}`, 'warn');
                }

                const minPosition = await getMinWorldPosition(guildId);
                if (worldPosition && worldPosition > minPosition) {
                    log(`Record by ${record.username} (#${worldPosition}) does not meet minimum position (top ${minPosition}) for guild ${guildId}`);
                    continue;
                }

                const embed = createRecordEmbed(record, t, worldPosition);

                try {
                    await channel.send({ embeds: [embed] });
                    announced = true;
                    log(`Announced record for ${record.username} in guild ${guildId}`);
                } catch (sendError) {
                    log(`Failed to send record announcement in guild ${guildId}: ${sendError.message}`, 'error');
                }

                await new Promise(r => setTimeout(r, 250));
            }

            if (announced) {
                recordIds.push(record.record_id);
            }
        }

        await markRecordsAsAnnounced(db, recordIds);

    } catch (error) {
        log(`Error announcing records: ${error.message}`, 'error');
    }
}