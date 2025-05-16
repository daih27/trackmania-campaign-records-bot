import { makeRateLimitedRequest } from './api.js';
import { ensureToken, invalidateTokens } from './auth.js';
import { log } from './utils.js';
import { getDb } from './db.js';
import { getGuildPlayers } from './playerManager.js';
import { getTranslations } from './localization/index.js';
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
        .setTitle(t.embeds.seasonLeaderboard.title
            .replace('{country}', countryName)
            .replace('{season}', `Weekly Shorts: ${seasonName}`))
        .setColor(0xFF6B6B)
        .setAuthor({ name: `Trackmania Weekly Shorts`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(t.embeds.seasonLeaderboard.description
            .replace('{count}', records.length)
            .replace('{country}', countryName))
        .setTimestamp(new Date());

    if (records.length === 0) {
        embed.addFields({
            name: t.embeds.seasonLeaderboard.noRecords.replace('{country}', countryName),
            value: t.embeds.seasonLeaderboard.noRecordsDesc.replace('{country}', countryName),
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
                value: `${t.embeds.seasonLeaderboard.points}: **${points.toLocaleString()}${pointsDifferential}**\n${t.embeds.seasonLeaderboard.position}: #${record.position} ${t.embeds.seasonLeaderboard.worldwide}`,
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
        .setTitle(t.embeds.countryLeaderboard.title
            .replace('{country}', countryName)
            .replace('{mapName}', `Weekly Short: ${mapName || mapUid}`))
        .setColor(0xFF6B6B)
        .setAuthor({ name: `Trackmania Weekly Shorts`, iconURL: TRACKMANIA_ICON_URL })
        .setDescription(t.embeds.countryLeaderboard.description
            .replace('{count}', records.length)
            .replace('{country}', countryName))
        .setTimestamp(new Date());

    if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (records.length === 0) {
        embed.addFields({
            name: t.embeds.countryLeaderboard.noRecords.replace('{country}', countryName),
            value: t.embeds.countryLeaderboard.noRecordsDesc.replace('{country}', countryName),
            inline: false
        });
    } else {
        records.forEach((record, index) => {
            const playerName = playerNames[record.accountId] || 'Unknown Player';
            const position = record.position || (index + 1);

            embed.addFields({
                name: `#${index + 1}: ${playerName}`,
                value: `${t.embeds.countryLeaderboard.position}: **#${position}** ${t.embeds.countryLeaderboard.worldwide}`,
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
 * Creates a Discord embed for a weekly short personal best announcement
 * @param {Object} record - The record to announce
 * @param {Object} t - Translation strings
 * @returns {EmbedBuilder} Discord embed for the announcement
 */
export function createWeeklyShortEmbed(record, t) {
    const isImprovement = record.previous_position !== null;
    const emoji = '🏆';

    const recordType = isImprovement
        ? t.embeds.newRecord.newPersonalBest
        : t.embeds.newRecord.firstRecord;

    const embed = new EmbedBuilder()
        .setTitle(t.embeds.newRecord.title.replace('{emoji}', emoji))
        .setColor(0xFF6B6B)
        .setDescription(t.embeds.newRecord.description
            .replace('{username}', record.username || 'Player')
            .replace('{discordId}', record.discord_id)
            .replace('{recordType}', recordType))
        .setAuthor({ name: 'Trackmania Weekly Shorts', iconURL: TRACKMANIA_ICON_URL })
        .addFields(
            { name: t.embeds.newRecord.map, value: `**${record.map_name || 'Unknown Map'}**`, inline: false },
            { name: t.embeds.newRecord.worldPosition, value: `**#${record.position}**`, inline: true }
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
            { name: t.embeds.newRecord.previous, value: `#${record.previous_position}`, inline: true },
            { name: t.embeds.newRecord.worldPosition, value: changeText, inline: true }
        );
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString();
    const timeStr = now.toLocaleTimeString();

    embed.setTimestamp(now)
        .setFooter({
            text: t.embeds.newRecord.footer
                .replace('{date}', dateStr)
                .replace('{time}', timeStr)
        });

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

        const guilds = client.guilds.cache;
        const guildPlayerMap = new Map();
        const allAccountIds = new Set();

        for (const [guildId, guild] of guilds) {
            const guildPlayers = await getGuildPlayers(guildId);
            if (guildPlayers.length > 0) {
                guildPlayerMap.set(guildId, guildPlayers);
                guildPlayers.forEach(p => allAccountIds.add(p.account_id));
            }
        }

        if (allAccountIds.size === 0) {
            log('No players registered across all guilds, skipping weekly shorts check');
            return;
        }

        const campaign = await fetchCurrentWeeklyShort();
        const seasonUid = campaign.seasonUid;
        const mapUids = campaign.playlist.map(m => m.mapUid);

        log(`Fetching info for ${mapUids.length} weekly short maps`);
        log(`Checking weekly shorts for ${allAccountIds.size} unique players across ${guildPlayerMap.size} guilds`);
        const mapList = await fetchMapInfo(mapUids);
        const accountIds = Array.from(allAccountIds);

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

        const maxPositionToCheck = lowestMinPosition;

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

            const recordsData = recordResponse.data && Array.isArray(recordResponse.data) ? recordResponse.data : [];
            log(`Retrieved ${recordsData.length} records for map ${mapName}`);

            const currentRecords = {};
            const playersWithNewRecords = [];

            if (recordsData && recordsData.length > 0) {
                for (const record of recordsData) {
                    if (!record.removed) {
                        const accountId = record.accountId;
                        const recordTimestamp = record.timestamp ? new Date(record.timestamp).getTime() : 0;

                        let player = null;
                        for (const [guildId, guildPlayers] of guildPlayerMap) {
                            player = guildPlayers.find(p => p.account_id === accountId);
                            if (player) break;
                        }

                        if (!player) {
                            log(`Unknown player with accountId ${accountId}`, 'warn');
                            continue;
                        }

                        const existingDbRecord = await db.get(
                            `SELECT id, position, timestamp FROM weekly_short_records 
                             WHERE player_id = ? AND map_id = ?`,
                            [player.id, dbMapId]
                        );

                        if (existingDbRecord && existingDbRecord.timestamp >= recordTimestamp) {
                            log(`Record for ${accountId} on map ${mapPosition + 1} already exists with same or newer timestamp - skipping`);
                            continue;
                        }

                        let registeredAt;
                        if (player.registered_at) {
                            if (typeof player.registered_at === 'string') {
                                const utcString = player.registered_at.endsWith('Z') ?
                                    player.registered_at :
                                    player.registered_at.replace(' ', 'T') + 'Z';
                                registeredAt = new Date(utcString);
                            } else if (player.registered_at instanceof Date) {
                                registeredAt = new Date(Date.UTC(
                                    player.registered_at.getUTCFullYear(),
                                    player.registered_at.getUTCMonth(),
                                    player.registered_at.getUTCDate(),
                                    player.registered_at.getUTCHours(),
                                    player.registered_at.getUTCMinutes(),
                                    player.registered_at.getUTCSeconds(),
                                    player.registered_at.getUTCMilliseconds()
                                ));
                            } else {
                                registeredAt = new Date(player.registered_at);
                            }
                        } else {
                            registeredAt = new Date();
                        }

                        const recordDate = new Date(recordTimestamp);
                        const existedBeforeRegistration = recordDate < registeredAt;

                        log(`Timestamp comparison for ${accountId}: ${recordDate.toISOString()} < ${registeredAt.toISOString()} = ${existedBeforeRegistration}`);

                        if (existedBeforeRegistration) {
                            let recordId = existingDbRecord?.id;

                            if (!existingDbRecord) {
                                const result = await db.run(
                                    `INSERT INTO weekly_short_records (player_id, map_id, position, timestamp, announced) 
                                     VALUES (?, ?, ?, ?, 0)`,
                                    [player.id, dbMapId, null, recordTimestamp]
                                );
                                recordId = result.lastID;

                                await db.run(
                                    `INSERT INTO weekly_short_history (player_id, map_id, position, previous_position, timestamp) 
                                     VALUES (?, ?, ?, ?, ?)`,
                                    [player.id, dbMapId, null, null, recordTimestamp]
                                );

                                log(`Added pre-existing record for ${accountId} on map ${mapPosition + 1} without position`);
                            }

                            for (const [guildId, _] of guilds) {
                                await db.run(
                                    `INSERT OR IGNORE INTO guild_announcement_status 
                                     (guild_id, weekly_short_record_id, ineligible_for_announcement, existed_before_registration) 
                                     VALUES (?, ?, 1, 1)`,
                                    [guildId, recordId]
                                );
                            }

                            log(`Marked pre-existing record for ${accountId} on map ${mapPosition + 1} as ineligible for all guilds`);
                            continue;
                        }

                        playersWithNewRecords.push(accountId);

                        currentRecords[accountId] = {
                            timestamp: recordTimestamp,
                            time: record.recordScore?.time || record.time
                        };

                        log(`Player ${accountId} has a new/improved record set after registration (timestamp: ${recordTimestamp})`);
                    }
                }
            }

            if (playersWithNewRecords.length === 0) {
                log(`No eligible new records on map ${mapPosition + 1} - skipping position checks`);
                continue;
            }

            log(`Fetching positions for ${playersWithNewRecords.length} eligible new records (max position: ${maxPositionToCheck})`);
            const playerPositions = await getWeeklyShortPlayerPositions(mapUid, seasonUid, playersWithNewRecords, maxPositionToCheck);

            for (const accountId of playersWithNewRecords) {
                let player = null;
                for (const [guildId, guildPlayers] of guildPlayerMap) {
                    player = guildPlayers.find(p => p.account_id === accountId);
                    if (player) break;
                }
                const timestamp = currentRecords[accountId].timestamp;
                const playerPosition = playerPositions[accountId];

                const existingDbRecord = await db.get(
                    `SELECT id, position, timestamp FROM weekly_short_records 
                     WHERE player_id = ? AND map_id = ?`,
                    [player.id, dbMapId]
                );

                const position = playerPosition ? playerPosition.position : null;

                if (!playerPosition) {
                    log(`Position not found for valid record by ${accountId} on map ${mapPosition + 1}, using fallback position ${position}`);
                }

                if (existingDbRecord) {
                    const previousPosition = existingDbRecord.position;

                    await db.run(
                        `INSERT INTO weekly_short_history (player_id, map_id, position, previous_position, timestamp) 
                         VALUES (?, ?, ?, ?, ?)`,
                        [player.id, dbMapId, position, previousPosition, timestamp]
                    );

                    await db.run(
                        `UPDATE weekly_short_records 
                         SET position = ?, timestamp = ?, recorded_at = datetime('now'), announced = 0
                         WHERE player_id = ? AND map_id = ?`,
                        [position, timestamp, player.id, dbMapId]
                    );

                    log(`Updated record for ${accountId} on map ${mapPosition + 1}: #${position} (previous: #${previousPosition})`);
                } else {
                    await db.run(
                        `INSERT INTO weekly_short_history (player_id, map_id, position, previous_position, timestamp) 
                         VALUES (?, ?, ?, ?, ?)`,
                        [player.id, dbMapId, position, null, timestamp]
                    );

                    await db.run(
                        `INSERT INTO weekly_short_records (player_id, map_id, position, timestamp, announced) 
                         VALUES (?, ?, ?, ?, 0)`,
                        [player.id, dbMapId, position, timestamp]
                    );

                    log(`Added new record for ${accountId} on map ${mapPosition + 1}: #${position}`);
                }

                if (position > maxPositionToCheck) {
                    for (const [guildId, _] of guilds) {
                        const recordId = existingDbRecord?.id || await db.get(
                            'SELECT id FROM weekly_short_records WHERE player_id = ? AND map_id = ?',
                            [player.id, dbMapId]
                        ).id;

                        await db.run(
                            `INSERT OR IGNORE INTO guild_announcement_status (guild_id, weekly_short_record_id, ineligible_for_announcement) 
                             VALUES (?, ?, 1)`,
                            [guildId, recordId]
                        );
                    }

                    log(`Position ${position} by ${accountId} exceeds minimum threshold (${maxPositionToCheck}) - marked as ineligible`);
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
 * @param {string} guildId - Guild ID to check eligibility for (optional)
 * @returns {Promise<Array>} Array of unannounced records
 */
async function getUnannouncedWeeklyShorts(db, guildId = null) {
    let query = `
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
            r.announced = 0`;

    const params = [];

    if (guildId) {
        query += `
            AND NOT EXISTS (
                SELECT 1 FROM guild_announcement_status gas
                WHERE gas.weekly_short_record_id = r.id 
                AND gas.guild_id = ?
                AND (gas.ineligible_for_announcement = 1 OR gas.existed_before_registration = 1)
            )`;
        params.push(guildId);
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
                const displayNames = await getDisplayNamesBatch(accountIdsNeedingNames);
                records.forEach(record => {
                    if (record.account_id && displayNames[record.account_id]) {
                        record.username = displayNames[record.account_id];
                    }
                });

                for (const accountId of accountIdsNeedingNames) {
                    if (displayNames[accountId]) {
                        await db.run(
                            'UPDATE players SET username = ?, updated_at = datetime(\'now\') WHERE account_id = ?',
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

    await db.run(
        `DELETE FROM guild_announcement_status WHERE weekly_short_record_id IN (${placeholders})`,
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
        const guilds = client.guilds.cache;
        const allGloballyUnannounced = await getUnannouncedWeeklyShorts(db);

        if (allGloballyUnannounced.length === 0) {
            log('No new weekly short positions to announce');
            return;
        }

        log(`Found ${allGloballyUnannounced.length} weekly short updates to process`);

        const announcedInAnyGuild = new Set();

        for (const [guildId, guild] of guilds) {
            const guildEligibleRecords = await getUnannouncedWeeklyShorts(db, guildId);

            if (guildEligibleRecords.length === 0) {
                log(`No eligible weekly shorts for guild ${guildId}`);
                continue;
            }

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

            if (!channel) {
                log(`No available channel for guild ${guildId}`);
                continue;
            }

            const maxPositionThreshold = await getMinWorldPosition(guildId);
            const t = await getTranslations(guildId);

            for (const record of guildEligibleRecords) {
                if (!record.position) {
                    log(`Weekly short for ${record.username} has no position, skipping announcement in guild ${guildId}`);
                    await db.run(
                        `INSERT OR IGNORE INTO guild_announcement_status (guild_id, weekly_short_record_id, ineligible_for_announcement) 
                         VALUES (?, ?, 1)`,
                        [guildId, record.record_id]
                    );
                    continue;
                } else if (record.position > maxPositionThreshold) {
                    log(`Weekly short position by ${record.username} (#${record.position}) does not meet position threshold (top ${maxPositionThreshold}) for guild ${guildId}`);
                    await db.run(
                        `INSERT OR IGNORE INTO guild_announcement_status (guild_id, weekly_short_record_id, ineligible_for_announcement) 
                         VALUES (?, ?, 1)`,
                        [guildId, record.record_id]
                    );
                    continue;
                }

                const embed = createWeeklyShortEmbed(record, t);

                try {
                    await channel.send({ embeds: [embed] });
                    announcedInAnyGuild.add(record.record_id);
                    log(`Announced weekly short update for ${record.username} in guild ${guildId}`);
                } catch (sendError) {
                    log(`Failed to send weekly short announcement in guild ${guildId}: ${sendError.message}`, 'error');
                }

                await new Promise(r => setTimeout(r, 250));
            }
        }

        if (announcedInAnyGuild.size > 0) {
            await markWeeklyShortsAsAnnounced(db, Array.from(announcedInAnyGuild));
        }

    } catch (error) {
        log(`Error announcing weekly shorts: ${error.message}`, 'error');
    }
}