import { fetchCountryLeaderboard, fetchPlayerNames, createCountryLeaderboardEmbed, fetchSeasonLeaderboard, createSeasonLeaderboardEmbed, fetchCurrentCampaign, fetchMapInfo, storeMap } from './recordTracker.js';
import { getDb } from './db.js';
import { formatString, getTranslations } from './localization/index.js';
import { log } from './utils.js';
import { invalidateTokens } from './auth.js';
import { getDefaultCountry } from './guildSettings.js';
import { apiQueue } from './utils/taskQueue.js';

/**
 * Handles the /leaderboard command to display Trackmania leaderboards
 * Shows either season leaderboard or map-specific leaderboard based on user input
 * Supports country filtering and dynamic map search
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleLeaderboard(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.deferReply();
        const db = await getDb();
        const mapName = interaction.options.getString('map');

        const userCountry = interaction.options.getString('country');
        const defaultCountry = await getDefaultCountry(interaction.guildId);
        const countryCode = userCountry || defaultCountry;

        const limit = 5;

        if (mapName) {
            const mapCount = await db.get("SELECT COUNT(*) as count FROM maps");

            if (mapCount.count === 0) {
                await interaction.editReply(t.responses.leaderboard.fetchingMaps || 'Fetching maps from current season...');

                try {
                    const campaign = await fetchCurrentCampaign();
                    const mapUids = campaign.playlist.map(m => m.mapUid);
                    const mapList = await fetchMapInfo(mapUids);

                    for (const map of mapList) {
                        await apiQueue.enqueue(async () => {
                            await storeMap(db, map.uid, map.mapId, map.name, campaign.leaderboardGroupUid, map.thumbnailUrl);
                        });
                    }

                    log(`Stored ${mapList.length} maps from current campaign`);
                } catch (error) {
                    log(`Error fetching maps from API: ${error.message}`, 'error');
                    return await interaction.editReply(t.responses.leaderboard.errorFetchingMaps || 'Error fetching maps from API. Please try again later.');
                }
            }

            const mapSearch = await db.all(
                "SELECT id, name, map_uid, thumbnail_url FROM maps WHERE name LIKE ? OR map_uid = ? LIMIT 1",
                [`%${mapName}%`, mapName]
            );

            if (mapSearch.length === 0) {
                return await interaction.editReply(formatString(t.responses.leaderboard.noRecordsMap, { mapName }));
            }

            const map = mapSearch[0];

            let countryRecords = await fetchCountryLeaderboard(map.map_uid, countryCode, limit);

            if (countryRecords.length > 0) {
                const accountIds = countryRecords.map(record => record.accountId);
                let playerNames = {};

                try {
                    playerNames = await fetchPlayerNames(accountIds);
                } catch (error) {
                }

                const embed = createCountryLeaderboardEmbed(
                    map.name,
                    map.map_uid,
                    map.thumbnail_url,
                    countryCode,
                    countryRecords,
                    playerNames,
                    t
                );

                await interaction.editReply({ content: null, embeds: [embed] });
                return;
            }

            return await interaction.editReply(formatString(t.responses.leaderboard.noCountryRecords, { mapName: map.name || map.map_uid, country: countryCode }));

        }

        try {
            await interaction.editReply(t.responses.leaderboard.loadingSeason || '🔄 Loading season leaderboard...');

            const campaign = await fetchCurrentCampaign();
            const seasonUid = campaign.seasonUid;
            const seasonName = campaign.name;

            const seasonRecords = await fetchSeasonLeaderboard(seasonUid, countryCode, limit);

            if (seasonRecords.length > 0) {
                const accountIds = seasonRecords.map(record => record.accountId);
                let playerNames = {};

                try {
                    playerNames = await fetchPlayerNames(accountIds);
                } catch (error) {
                }

                const embed = createSeasonLeaderboardEmbed(
                    seasonName,
                    countryCode,
                    seasonRecords,
                    playerNames,
                    t
                );

                await interaction.editReply({ content: null, embeds: [embed] });
            } else {
                await interaction.editReply(formatString(
                    t.responses.leaderboard.noSeasonRecords || 'No {country} players found in the current season leaderboard.',
                    { country: countryCode }
                ));
            }
        } catch (error) {
            console.error('Error fetching season leaderboard:', error);
            await interaction.editReply({ content: t.responses.leaderboard.error, embeds: [] });
        }
    } catch (error) {
        await interaction.editReply({ content: t.responses.leaderboard.error, embeds: [] });

        if (error.response?.status === 401) {
            invalidateTokens();
        }
    }
}

export default handleLeaderboard;