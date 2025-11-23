import { makeRateLimitedRequest } from './api.js';
import { ensureToken, invalidateTokens } from './auth.js';
import { formatTime, log } from './utils.js';
import { getDb } from './db.js';
import { getTranslations, formatString } from './localization/index.js';
import { EmbedBuilder } from 'discord.js';
import { TRACKMANIA_ICON_URL, tmOAuthClientId, tmOAuthClientSecret } from './config.js';
import { fetchMapInfo } from './recordTracker.js';
import { cleanMapName } from './weeklyShorts.js';
import { getDisplayNamesBatch } from './oauth.js';
import { getGuildPlayers } from './playerManager.js';

/**
 * Fetches the current Track of the Day from the Nadeo API
 * @returns {Promise<Object|null>} TOTD data or null if not found
 */
export async function fetchCurrentTOTD() {
    const liveToken = await ensureToken('NadeoLiveServices');
    log('Fetching current TOTD...');

    try {
        const response = await makeRateLimitedRequest({
            method: 'get',
            url: 'https://live-services.trackmania.nadeo.live/api/token/campaign/month?length=1&offset=0',
            headers: { Authorization: `nadeo_v1 t=${liveToken}` }
        });

        if (!response.data || !response.data.monthList || response.data.monthList.length === 0) {
            log('No TOTD data found', 'warn');
            return null;
        }

        const currentMonth = response.data.monthList[0];

        if (!currentMonth.days || currentMonth.days.length === 0) {
            log('No TOTD days found in current month', 'warn');
            return null;
        }

        const now = Date.now();
        const currentDay = currentMonth.days
            .filter(day => day.startTimestamp && day.startTimestamp * 1000 <= now && day.mapUid)
            .sort((a, b) => b.startTimestamp - a.startTimestamp)[0];

        if (!currentDay) {
            log('No active TOTD found', 'warn');
            return null;
        }

        log(`Current TOTD: ${currentDay.mapUid} (campaign ${currentDay.campaignId})`);
        log(`Start: ${new Date(currentDay.startTimestamp * 1000).toISOString()}, End: ${new Date(currentDay.endTimestamp * 1000).toISOString()}`);

        return {
            mapUid: currentDay.mapUid,
            campaignId: currentDay.campaignId,
            startTimestamp: currentDay.startTimestamp * 1000,
            endTimestamp: currentDay.endTimestamp * 1000,
            monthYear: currentMonth.month,
            seasonUid: currentMonth.seasonUid
        };
    } catch (error) {
        log(`Error fetching current TOTD: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Stores or updates TOTD map information in the database
 * @param {Database} db - Database connection
 * @param {Object} totdData - TOTD data from API
 * @param {Object} mapInfo - Map details from map info API
 * @returns {Promise<number>} Database ID of the stored/updated map
 */
async function storeTOTDMap(db, totdData, mapInfo) {
    try {
        const existingMap = await db.get('SELECT id, end_timestamp FROM totd_maps WHERE map_uid = ?', totdData.mapUid);

        if (existingMap) {
            await db.run(
                `UPDATE totd_maps
                 SET map_id = ?, name = ?, campaign_id = ?, start_timestamp = ?,
                     end_timestamp = ?, thumbnail_url = ?, last_checked = CURRENT_TIMESTAMP
                 WHERE map_uid = ?`,
                [mapInfo.mapId, mapInfo.name, totdData.campaignId, totdData.startTimestamp,
                 totdData.endTimestamp, mapInfo.thumbnailUrl, totdData.mapUid]
            );
            log(`Updated TOTD map: ${mapInfo.name}`);
            return existingMap.id;
        } else {
            const result = await db.run(
                `INSERT INTO totd_maps (map_uid, map_id, name, campaign_id, start_timestamp, end_timestamp, thumbnail_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [totdData.mapUid, mapInfo.mapId, mapInfo.name, totdData.campaignId,
                 totdData.startTimestamp, totdData.endTimestamp, mapInfo.thumbnailUrl]
            );
            log(`Stored new TOTD map: ${mapInfo.name}`);
            return result.lastID;
        }
    } catch (error) {
        log(`Error storing TOTD map: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Updates player records for a specific TOTD map
 * @param {Database} db - Database connection
 * @param {number} mapDbId - Database ID of the TOTD map
 * @param {string} mapId - API map ID
 * @param {string} mapUid - Map UID
 * @param {Array} accountIds - Array of player account IDs to check
 * @param {Map} guildPlayerMap - Map of guild IDs to player arrays
 * @returns {Promise<Object>} Summary of updates
 */
async function updateTOTDRecords(db, mapDbId, mapId, mapUid, accountIds, guildPlayerMap) {
    try {
        log(`Fetching TOTD records for ${accountIds.length} players on map ${mapUid}`);
        const records = await fetchPlayerRecords(mapId, accountIds);
        log(`Found ${records.length} records`);

        let newRecords = 0;
        let updatedRecords = 0;

        for (const rec of records) {
            const accountId = rec.accountId;

            let time;
            if (rec.recordScore && rec.recordScore.time) {
                time = rec.recordScore.time;
            } else if (rec.time) {
                time = rec.time;
            } else {
                log(`Couldn't find time in record for ${accountId}`, 'warn');
                continue;
            }

            const playersInGuilds = [];
            for (const [guildId, guildPlayers] of guildPlayerMap) {
                const player = guildPlayers.find(p => p.account_id === accountId);
                if (player) {
                    playersInGuilds.push(player);
                }
            }

            if (playersInGuilds.length === 0) {
                log(`Unknown player with accountId ${accountId}`, 'warn');
                continue;
            }

            for (const player of playersInGuilds) {
                const existingRecord = await db.get(
                    'SELECT time_ms FROM totd_records WHERE player_id = ? AND map_id = ?',
                    [player.id, mapDbId]
                );

                if (!existingRecord) {
                    await db.run(
                        'INSERT INTO totd_records (player_id, map_id, time_ms) VALUES (?, ?, ?)',
                        [player.id, mapDbId, time]
                    );
                    newRecords++;
                    log(`New TOTD record for player ${accountId} (player_id ${player.id}): ${time}ms`);
                } else if (time < existingRecord.time_ms) {
                    await db.run(
                        'UPDATE totd_records SET time_ms = ?, recorded_at = CURRENT_TIMESTAMP WHERE player_id = ? AND map_id = ?',
                        [time, player.id, mapDbId]
                    );
                    updatedRecords++;
                    log(`Updated TOTD record for player ${accountId} (player_id ${player.id}): ${time}ms (was ${existingRecord.time_ms}ms)`);
                }
            }
        }

        return { newRecords, updatedRecords };
    } catch (error) {
        log(`Error updating TOTD records: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Fetches the country leaderboard for a specific TOTD map
 * @param {string} mapUid - Map UID
 * @param {string} countryCode - Country zone ID
 * @param {number} length - Number of records to fetch (default: 5)
 * @returns {Promise<Array>} Leaderboard for the specified country
 */
export async function fetchTOTDCountryLeaderboard(mapUid, countryCode, length = 5) {
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
        log(`Found ${worldTop.length} players in world TOTD leaderboard`);
        return worldTop;
    }

    const { getZoneNamesForCountry, getZoneName } = await import('./config/zones.js');

    const zoneNames = await getZoneNamesForCountry(countryCode);
    if (zoneNames.size === 0) {
        const countryName = await getZoneName(countryCode);
        log(`No zones found for country code: ${countryCode} (${countryName})`, 'warn');
        return [];
    }

    const countryName = await getZoneName(countryCode);
    log(`Searching for ${countryName} TOTD players (zones: ${Array.from(zoneNames).join(', ')})`);

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

        const topRecords = leaderboardRes.data.tops[0].top;

        for (const record of topRecords) {
            if (record.zoneName && zoneNames.has(record.zoneName)) {
                countryRecords.push(record);
                if (countryRecords.length >= length) {
                    break;
                }
            }
        }

        offset += 100;

        if (topRecords.length < 100) {
            break;
        }
    }

    log(`Found ${countryRecords.length} ${countryName} players in TOTD leaderboard`);
    return countryRecords.slice(0, length);
}

/**
 * Creates a Discord embed for TOTD leaderboard announcement
 * @param {string} mapName - Map name
 * @param {string} mapUid - Map UID
 * @param {string} thumbnailUrl - Map thumbnail URL
 * @param {Array} leaderboard - Array of player records from API
 * @param {string} countryName - Country name
 * @param {Object} t - Translation strings
 * @returns {EmbedBuilder} Discord embed for the leaderboard
 */
export async function createTOTDLeaderboardEmbed(mapName, mapUid, thumbnailUrl, leaderboard, countryName, t) {
    const cleanedMapName = cleanMapName(mapName) || mapUid;

    const accountIds = leaderboard.map(r => r.accountId).filter(Boolean);
    let playerNames = {};

    if (accountIds.length > 0 && tmOAuthClientId && tmOAuthClientSecret) {
        try {
            playerNames = await getDisplayNamesBatch(accountIds);
        } catch (error) {
            log(`Failed to fetch display names: ${error.message}`, 'warn');
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(formatString(t.embeds.totdLeaderboard?.title || '🏁 {country} TOTD Leaderboard: {mapName}', {
            mapName: cleanedMapName,
            country: countryName
        }))
        .setColor(0xFF6B00)
        .setAuthor({ name: 'Trackmania Track of the Day', iconURL: TRACKMANIA_ICON_URL })
        .setDescription(formatString(
            t.embeds.totdLeaderboard?.description || 'Top {count} {country} times for this Track of the Day',
            { count: leaderboard.length, country: countryName }
        ));

    if (thumbnailUrl && thumbnailUrl.startsWith('http')) {
        embed.setThumbnail(thumbnailUrl);
    }

    if (leaderboard.length === 0) {
        embed.addFields({
            name: t.embeds.totdLeaderboard?.noRecords || 'No Records',
            value: formatString(
                t.embeds.totdLeaderboard?.noRecordsDesc || 'No {country} players have set a time on this TOTD.',
                { country: countryName }
            ),
            inline: false
        });
    } else {
        const firstPlayerTime = leaderboard[0]?.score || 0;

        leaderboard.forEach((record, index) => {
            const playerName = playerNames[record.accountId] || record.accountName || 'Unknown Player';
            const linkedPlayerName = record.accountId
                ? `[${playerName}](https://trackmania.io/player#/player/${record.accountId})`
                : playerName;

            const timeFormatted = formatTime(record.score);
            const position = record.position;

            let timeDifferential = '';
            if (index > 0 && firstPlayerTime > 0) {
                const difference = record.score - firstPlayerTime;
                timeDifferential = ` (+${formatTime(difference)})`;
            }

            embed.addFields({
                name: '\u200b',
                value: `**#${index + 1}: ${linkedPlayerName}**\n${t.embeds.totdLeaderboard?.time || 'Time'}: **${timeFormatted}${timeDifferential}**\n${t.embeds.totdLeaderboard?.position || 'Position'}: #${position.toLocaleString()} ${t.embeds.totdLeaderboard?.worldwide || 'worldwide'}`,
                inline: false
            });
        });
    }

    return embed;
}

/**
 * Announces TOTD leaderboard to all configured guild channels
 * @param {Client} client - Discord.js client instance
 * @param {Database} db - Database connection
 * @param {number} totdMapDbId - Database ID of the TOTD map
 */
async function announceTOTDLeaderboard(client, db, totdMapDbId) {
    try {
        const totdMap = await db.get('SELECT * FROM totd_maps WHERE id = ?', totdMapDbId);

        if (!totdMap) {
            log('TOTD map not found for announcement', 'warn');
            return;
        }

        const guilds = client.guilds.cache;

        for (const [guildId, guild] of guilds) {
            try {
                const settings = await db.get(
                    'SELECT totd_channel_id, totd_announcements_enabled FROM guild_settings WHERE guild_id = ?',
                    guildId
                );

                if (!settings || settings.totd_announcements_enabled === 0) {
                    log(`TOTD announcements disabled for guild ${guildId}`);
                    continue;
                }

                let channel = null;
                if (settings.totd_channel_id) {
                    channel = client.channels.cache.get(settings.totd_channel_id);
                }

                if (!channel) {
                    const fallbackSettings = await db.get('SELECT records_channel_id FROM guild_settings WHERE guild_id = ?', guildId);
                    if (fallbackSettings?.records_channel_id) {
                        channel = client.channels.cache.get(fallbackSettings.records_channel_id);
                    }
                }

                if (!channel) {
                    channel = guild.channels.cache.find(ch =>
                        ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages')
                    );
                }

                if (!channel) {
                    log(`No available channel for TOTD announcement in guild ${guildId}`);
                    continue;
                }

                const { getDefaultCountry } = await import('./guildSettings.js');
                const { getZoneName } = await import('./config/zones.js');

                const countryCode = await getDefaultCountry(guildId);
                const countryName = await getZoneName(countryCode);

                const leaderboard = await fetchTOTDCountryLeaderboard(totdMap.map_uid, countryCode, 5);

                if (!leaderboard || leaderboard.length === 0) {
                    log(`No TOTD leaderboard found for ${countryName} in guild ${guildId}`);
                    continue;
                }

                const t = await getTranslations(guildId);
                const embed = await createTOTDLeaderboardEmbed(
                    totdMap.name,
                    totdMap.map_uid,
                    totdMap.thumbnail_url,
                    leaderboard,
                    countryName,
                    t
                );

                await channel.send({ embeds: [embed] });
                log(`Announced TOTD leaderboard in guild ${guildId}`);

                await new Promise(r => setTimeout(r, 250));
            } catch (guildError) {
                log(`Error announcing TOTD leaderboard in guild ${guildId}: ${guildError.message}`, 'error');
            }
        }
    } catch (error) {
        log(`Error in TOTD leaderboard announcement: ${error.message}`, 'error');
    }
}

/**
 * Main function to check for TOTD changes and announce leaderboards
 * @param {Client} client - Discord.js client instance
 */
export async function checkTOTD(client) {
    const db = await getDb();

    try {
        log('Starting TOTD check...');

        const currentTOTD = await fetchCurrentTOTD();

        if (!currentTOTD) {
            log('No current TOTD found', 'warn');
            return;
        }

        const storedTOTD = await db.get(
            'SELECT * FROM totd_maps WHERE map_uid = ? ORDER BY id DESC LIMIT 1',
            currentTOTD.mapUid
        );

        const isNewTOTD = !storedTOTD || storedTOTD.campaign_id !== currentTOTD.campaignId;

        if (isNewTOTD) {
            log(`New TOTD detected: ${currentTOTD.mapUid}`);

            const previousTOTD = await db.get(
                `SELECT * FROM totd_maps
                 WHERE end_timestamp < ?
                 ORDER BY end_timestamp DESC
                 LIMIT 1`,
                Date.now()
            );

            if (previousTOTD) {
                log(`Announcing leaderboard for previous TOTD: ${previousTOTD.name}`);
                await announceTOTDLeaderboard(client, db, previousTOTD.id);
            }
        }

        const mapInfoList = await fetchMapInfo([currentTOTD.mapUid]);

        if (!mapInfoList || mapInfoList.length === 0) {
            log('Could not fetch map info for current TOTD', 'warn');
            return;
        }

        const mapInfo = mapInfoList[0];
        const totdMapDbId = await storeTOTDMap(db, currentTOTD, mapInfo);

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
            log('No players registered across all guilds');
            return;
        }

        const accountIds = Array.from(allAccountIds);
        const updateResult = await updateTOTDRecords(
            db,
            totdMapDbId,
            mapInfo.mapId,
            currentTOTD.mapUid,
            accountIds,
            guildPlayerMap
        );

        log(`TOTD records updated: ${updateResult.newRecords} new, ${updateResult.updatedRecords} improved`);

        log('TOTD check completed successfully');
    } catch (err) {
        log(`Error checking TOTD: ${err.message}`, 'error');

        if (err.response?.status === 401) {
            invalidateTokens();
            log('Refreshing Nadeo tokens and retrying...', 'warn');
            await checkTOTD(client);
        }
    }
}
