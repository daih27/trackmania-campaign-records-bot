import { fetchCountryLeaderboard, fetchPlayerNames, createCountryLeaderboardEmbed, fetchSeasonLeaderboard, createSeasonLeaderboardEmbed, fetchCurrentCampaign, fetchMapInfo, storeMap } from './recordTracker.js';
import { getDb } from './db.js';
import { formatString, getTranslations } from './localization/index.js';
import { log } from './utils.js';
import { invalidateTokens } from './auth.js';
import { getDefaultCountry } from './guildSettings.js';
import { apiQueue } from './utils/taskQueue.js';
import { getZoneName } from './config/zones.js';

/**
 * Handles the /leaderboard command to display Trackmania leaderboards
 * Shows either season leaderboard or map-specific leaderboard based on user input
 * Supports country filtering and dynamic map search
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleLeaderboard(interaction) {
    try {
        // Defer the reply immediately to prevent timeout
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply();
        }
        
        const t = await getTranslations(interaction.guildId);
        const db = await getDb();
        const mapName = interaction.options.getString('map');

        const userCountry = interaction.options.getString('country');
        const defaultCountry = await getDefaultCountry(interaction.guildId);
        const countryCode = userCountry || defaultCountry;

        const limit = 5;

        if (mapName) {
            const campaign = await fetchCurrentCampaign();
            const currentSeasonUid = campaign.leaderboardGroupUid || campaign.seasonUid;
            
            log(`Processing leaderboard command for map: ${mapName}. Current season UID: ${currentSeasonUid}`);
            
            // Count maps for current season, handling NULL season_uid
            const currentCampaignMapCount = await db.get(
                "SELECT COUNT(*) as count FROM maps WHERE (season_uid = ? OR (season_uid IS NULL AND ? IS NULL))", 
                [currentSeasonUid, currentSeasonUid]
            );

            log(`Found ${currentCampaignMapCount.count} maps for current season`);

            if (currentCampaignMapCount.count === 0) {
                await interaction.editReply(t.responses.leaderboard.fetchingMaps || 'Fetching maps from current season...');

                try {
                    // Clear maps from previous campaigns but keep current ones
                    if (currentSeasonUid) {
                        await db.run("DELETE FROM maps WHERE season_uid != ? AND season_uid IS NOT NULL", [currentSeasonUid]);
                    } else {
                        await db.run("DELETE FROM maps WHERE season_uid IS NOT NULL");
                    }
                    log('Cleared maps from previous campaigns');

                    const mapUids = campaign.playlist.map(m => m.mapUid);
                    const mapList = await fetchMapInfo(mapUids);

                    const storePromises = mapList.map((map, index) => 
                        apiQueue.enqueue(
                            async () => await storeMap(db, map.uid, map.mapId, map.name, currentSeasonUid, map.thumbnailUrl),
                            `store map ${map.name || map.uid} (${index + 1}/${mapList.length})`
                        )
                    );

                    // Wait for all maps to be stored
                    await Promise.all(storePromises);

                    log(`Stored ${mapList.length} maps from current campaign`);
                } catch (error) {
                    log(`Error fetching maps from API: ${error.message}`, 'error');
                    return await interaction.editReply(t.responses.leaderboard.errorFetchingMaps || 'Error fetching maps from API. Please try again later.');
                }
            }

            const isMapNumber = /^\d{1,2}$/.test(mapName);

            let mapSearch;
            if (isMapNumber) {
                const paddedNumber = mapName.padStart(2, '0');
                mapSearch = await db.all(
                    "SELECT id, name, map_uid, thumbnail_url FROM maps WHERE (season_uid = ? OR (season_uid IS NULL AND ? IS NULL)) AND name LIKE ? LIMIT 1",
                    [currentSeasonUid, currentSeasonUid, `%- ${paddedNumber}%`]
                );

                if (mapSearch.length === 0) {
                    mapSearch = await db.all(
                        "SELECT id, name, map_uid, thumbnail_url FROM maps WHERE (season_uid = ? OR (season_uid IS NULL AND ? IS NULL)) AND name LIKE ? LIMIT 1",
                        [currentSeasonUid, currentSeasonUid, `%- ${parseInt(mapName)}%`]
                    );
                }
            } else {
                mapSearch = await db.all(
                    "SELECT id, name, map_uid, thumbnail_url FROM maps WHERE (season_uid = ? OR (season_uid IS NULL AND ? IS NULL)) AND (name LIKE ? OR map_uid = ?) LIMIT 1",
                    [currentSeasonUid, currentSeasonUid, `%${mapName}%`, mapName]
                );
            }

            if (mapSearch.length === 0) {
                log(`No maps found for search term: ${mapName}. Current season UID: ${currentSeasonUid}`);
                return await interaction.editReply(formatString(t.responses.leaderboard.noRecordsMap, { mapName }));
            }

            const map = mapSearch[0];
            log(`Found map: ${map.name} (${map.map_uid}) for search: ${mapName}`);

            let countryRecords = await fetchCountryLeaderboard(map.map_uid, countryCode, limit);
            log(`Fetched ${countryRecords.length} records for ${map.name} in ${countryCode}`);

            if (countryRecords.length > 0) {
                const accountIds = countryRecords.map(record => record.accountId);
                let playerNames = {};

                try {
                    playerNames = await fetchPlayerNames(accountIds);
                    log(`Fetched ${Object.keys(playerNames).length} player names`);
                } catch (error) {
                    log(`Failed to fetch player names: ${error.message}`, 'warn');
                }

                const embed = await createCountryLeaderboardEmbed(
                    map.name,
                    map.map_uid,
                    map.thumbnail_url,
                    countryCode,
                    countryRecords,
                    playerNames,
                    t
                );

                log(`Sending leaderboard embed for ${map.name}`);
                await interaction.editReply({ content: null, embeds: [embed] });
                return;
            }

            const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
            return await interaction.editReply(formatString(t.responses.leaderboard.noCountryRecords, { mapName: map.name || map.map_uid, country: countryName }));

        }

        try {
            await interaction.editReply(t.responses.leaderboard.loadingSeason || '🔄 Loading season leaderboard...');

            const campaign = await fetchCurrentCampaign();
            const seasonUid = campaign.seasonUid;
            const seasonName = campaign.name;
            log(`Fetching season leaderboard for ${seasonName} (${seasonUid}) in ${countryCode}`);

            const seasonRecords = await fetchSeasonLeaderboard(seasonUid, countryCode, limit);
            log(`Fetched ${seasonRecords.length} season records`);

            if (seasonRecords.length > 0) {
                const accountIds = seasonRecords.map(record => record.accountId);
                let playerNames = {};

                try {
                    playerNames = await fetchPlayerNames(accountIds);
                    log(`Fetched ${Object.keys(playerNames).length} player names for season leaderboard`);
                } catch (error) {
                    log(`Failed to fetch player names for season leaderboard: ${error.message}`, 'warn');
                }

                const embed = await createSeasonLeaderboardEmbed(
                    seasonName,
                    countryCode,
                    seasonRecords,
                    playerNames,
                    t
                );

                log(`Sending season leaderboard embed`);
                await interaction.editReply({ content: null, embeds: [embed] });
            } else {
                const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
                log(`No season records found for ${countryName}`);
                await interaction.editReply(formatString(
                    t.responses.leaderboard.noSeasonRecords || 'No {country} players found in the current season leaderboard.',
                    { country: countryName }
                ));
            }
        } catch (error) {
            log(`Error fetching season leaderboard: ${error.message}`, 'error');
            console.error('Error fetching season leaderboard:', error);
            await interaction.editReply({ content: t.responses.leaderboard.error, embeds: [] });
        }
    } catch (error) {
        log(`Error in leaderboard command: ${error.message}`, 'error');
        console.error('Leaderboard command error:', error);
        
        try {
            await interaction.editReply({ content: t.responses.leaderboard.error, embeds: [] });
        } catch (replyError) {
            log(`Failed to send error reply: ${replyError.message}`, 'error');
        }

        if (error.response?.status === 401) {
            invalidateTokens();
        }
    }
}

export default handleLeaderboard;