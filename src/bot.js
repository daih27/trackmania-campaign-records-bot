import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { discordToken, tmOAuthClientId, tmOAuthClientSecret, TRACKMANIA_ICON_URL, RECORD_CHECK_INTERVAL, WEEKLY_SHORTS_CHECK_INTERVAL, INITIAL_RECORD_CHECK_DELAY } from './config.js';
import { startDefaultSchedules, clearAllSchedules, scheduleTask } from './utils/scheduler.js';
import { commandQueue, recordCheckQueue } from './utils/taskQueue.js';
import { registerPlayer, unregisterPlayer, getPlayerByDiscordId } from './playerManager.js';
import { getDisplayNames } from './oauth.js';
import { formatTime, log } from './utils.js';
import { getDb } from './db.js';
import { getTranslations, setLanguage, getAvailableLanguages, formatString } from './localization/index.js';
import { setDefaultCountry, getAvailableCountries, setAnnouncementChannel, setWeeklyShortsAnnouncementChannel } from './guildSettings.js';
import { REGIONS, getCountryName } from './config/regions.js';
import { getDefaultCountry } from './guildSettings.js';
import {
    fetchCurrentWeeklyShort,
    fetchWeeklyShortSeasonLeaderboard,
    fetchWeeklyShortCountryLeaderboard,
    createWeeklyShortSeasonLeaderboardEmbed,
    createWeeklyShortMapLeaderboardEmbed
} from './weeklyShorts.js';
import { fetchMapInfo, fetchPlayerNames } from './recordTracker.js';

/**
 * Defines all available slash commands for the Discord bot with their options and descriptions
 * @param {Object} t - Translation strings for command names and descriptions
 * @returns {Array} Array of command configurations to register with Discord
 */
function getCommands(t) {
    return [
        new SlashCommandBuilder()
            .setName('register')
            .setDescription(t.commands.register)
            .addStringOption(option =>
                option.setName('account_id')
                    .setDescription(t.commands.registerOption)
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('unregister')
            .setDescription(t.commands.unregister),

        new SlashCommandBuilder()
            .setName('records')
            .setDescription(t.commands.records),

        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription(t.commands.leaderboard)
            .addStringOption(option =>
                option.setName('map')
                    .setDescription(t.commands.leaderboardOption)
                    .setRequired(false))
            .addStringOption(option => {
                const opt = option.setName('country')
                    .setDescription(t.commands.leaderboardCountryOption || 'Select a country')
                    .setRequired(false);
                Object.keys(REGIONS).forEach(code => {
                    opt.addChoices({ name: getCountryName(code), value: code });
                });

                return opt;
            }),

        new SlashCommandBuilder()
            .setName('weeklyshortsleaderboard')
            .setDescription(t.commands.weeklyshortsleaderboard || 'Show weekly shorts leaderboard')
            .addStringOption(option =>
                option.setName('map')
                    .setDescription(t.commands.weeklyshortsleaderboardOption || 'Optional: filter by map name')
                    .setRequired(false))
            .addStringOption(option => {
                const opt = option.setName('country')
                    .setDescription(t.commands.weeklyshortsleaderboardCountryOption || 'Select a country')
                    .setRequired(false);
                Object.keys(REGIONS).forEach(code => {
                    opt.addChoices({ name: getCountryName(code), value: code });
                });

                return opt;
            }),

        new SlashCommandBuilder()
            .setName('help')
            .setDescription(t.commands.help),

        new SlashCommandBuilder()
            .setName('language')
            .setDescription(t.commands.language)
            .addStringOption(option => {
                option.setName('lang')
                    .setDescription(t.commands.languageOption)
                    .setRequired(true);

                const languages = getAvailableLanguages();
                Object.entries(languages).forEach(([code, name]) => {
                    option.addChoices({ name, value: code });
                });

                return option;
            }),

        new SlashCommandBuilder()
            .setName('setcountry')
            .setDescription(t.commands.setcountry || 'Set the default country for leaderboard')
            .addStringOption(option => {
                option.setName('country')
                    .setDescription(t.commands.setcountryOption || 'Country to use as default')
                    .setRequired(true);

                const countries = getAvailableCountries();
                countries.forEach(country => {
                    option.addChoices({ name: country.name, value: country.value });
                });

                return option;
            }),

        new SlashCommandBuilder()
            .setName('setchannel')
            .setDescription(t.commands.setchannel || 'Set the channel for record announcements')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription(t.commands.setchannelOption || 'The channel to send record announcements to')
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('setweeklyshortschannel')
            .setDescription(t.commands.setweeklyshortschannel || 'Set the channel for weekly shorts announcements')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription(t.commands.setweeklyshortschannelOption || 'The channel to send weekly shorts announcements to')
                    .setRequired(true)),
    ].map(command => command.toJSON());
}

let commands = getCommands(await getTranslations());

/**
 * Registers all bot commands with Discord's slash command system
 * @param {string} clientId - Discord bot client ID
 */
async function registerCommands(clientId) {
    try {
        const rest = new REST({ version: '10' }).setToken(discordToken);

        log('Started refreshing application (/) commands.');

        const t = await getTranslations();
        commands = getCommands(t);

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        log('Successfully registered application commands.');
    } catch (error) {
        log(`Error registering commands: ${error}`, 'error');
    }
}

/**
 * Handles the /register command to link a Discord user with their Trackmania account
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleRegister(interaction) {
    const accountId = interaction.options.getString('account_id');
    let username = interaction.user.username;
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.deferReply();

        if (tmOAuthClientId && tmOAuthClientSecret) {
            try {
                const displayNames = await getDisplayNames([accountId]);
                const displayName = displayNames[accountId];
                if (displayName) {
                    username = displayName;
                    log(`Fetched display name for ${accountId}: ${displayName}`);
                }
            } catch (oauthError) {
                log(`Failed to fetch display name: ${oauthError.message}`, 'warn');
            }
        }

        const result = await registerPlayer(interaction.user.id, accountId, username);

        if (result.success) {
            if (result.updated) {
                await interaction.editReply(t.responses.register.updated);
            } else {
                await interaction.editReply(t.responses.register.success);
            }
        } else {
            await interaction.editReply(formatString(t.responses.register.failed, { error: result.error }));
        }
    } catch (error) {
        log(`Error in registration: ${error.message}`, 'error');
        await interaction.editReply(formatString(t.responses.register.failed, { error: error.message }));
    }
}

/**
 * Handles the /unregister command to unlink a Discord user from their Trackmania account
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleUnregister(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.deferReply();
        const result = await unregisterPlayer(interaction.user.id);

        if (result.success) {
            await interaction.editReply(t.responses.unregister.success);
        } else {
            await interaction.editReply(formatString(t.responses.unregister.failed, { error: result.error }));
        }
    } catch (error) {
        log(`Error in unregistration: ${error.message}`, 'error');
        await interaction.editReply(formatString(t.responses.unregister.failed, { error: error.message }));
    }
}

/**
 * Handles the /records command to display a user's recent Trackmania records
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleRecords(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.deferReply();
        const player = await getPlayerByDiscordId(interaction.user.id);

        if (!player) {
            return await interaction.editReply(t.responses.records.notRegistered);
        }

        const db = await getDb();
        const limit = 5;

        const records = await db.all(`
      SELECT 
        m.name as map_name,
        m.map_uid,
        r.time_ms,
        r.recorded_at,
        rh.previous_time_ms
      FROM 
        records r
      JOIN 
        maps m ON r.map_id = m.id
      LEFT JOIN 
        record_history rh ON (
          rh.player_id = r.player_id 
          AND rh.map_id = r.map_id 
          AND rh.time_ms = r.time_ms
          AND rh.previous_time_ms IS NOT NULL
        )
      WHERE 
        r.player_id = ?
        AND rh.previous_time_ms IS NOT NULL
      ORDER BY 
        r.recorded_at DESC
      LIMIT ?
    `, [player.id, limit]);

        if (records.length === 0) {
            return await interaction.editReply(t.responses.records.noRecords);
        }

        const embed = new EmbedBuilder()
            .setTitle(formatString(t.embeds.records.title, { username: player.username || 'Player' }))
            .setColor(0x00BFFF)
            .setAuthor({ name: 'Trackmania Campaign Records', iconURL: TRACKMANIA_ICON_URL })
            .setDescription(formatString(t.embeds.records.description, { count: records.length }))
            .setTimestamp(new Date())

        records.forEach((record, index) => {
            embed.addFields({
                name: `${index + 1}. ${record.map_name || record.map_uid}`,
                value: `${t.embeds.records.time}: **${formatTime(record.time_ms)}**\n${t.embeds.records.setOn}: ${new Date(record.recorded_at + 'Z').toLocaleString()}`,
                inline: false
            });
        });

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        log(`Error in records command: ${error.message}`, 'error');
        await interaction.editReply(t.responses.records.error);
    }
}

/**
 * Handle leaderboard command - moved to handleLeaderboard.js
 */

/**
 * Handles the /help command to display information about all available bot commands
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleHelp(interaction) {
    const t = await getTranslations(interaction.guildId);

    const embed = new EmbedBuilder()
        .setTitle(t.embeds.help.title)
        .setColor(0x00BFFF)
        .setAuthor({ name: 'Trackmania Campaign Records', iconURL: TRACKMANIA_ICON_URL })
        .setDescription(t.embeds.help.description)
        .addFields(
            {
                name: t.embeds.help.register,
                value: t.embeds.help.registerDesc
            },
            {
                name: t.embeds.help.unregister,
                value: t.embeds.help.unregisterDesc
            },
            {
                name: t.embeds.help.records,
                value: t.embeds.help.recordsDesc
            },
            {
                name: t.embeds.help.leaderboard,
                value: t.embeds.help.leaderboardDesc
            },
            {
                name: t.embeds.help.weeklyshortsleaderboard || '/weeklyshortsleaderboard',
                value: t.embeds.help.weeklyshortsleaderboardDesc || 'Show weekly shorts leaderboard (overall or by map)'
            },
            {
                name: t.embeds.help.help,
                value: t.embeds.help.helpDesc
            },
            {
                name: t.embeds.help.testAnnouncement,
                value: t.embeds.help.testAnnouncementDesc
            },
            {
                name: t.embeds.help.language,
                value: t.embeds.help.languageDesc
            },
            {
                name: t.embeds.help.setcountry,
                value: t.embeds.help.setcountryDesc
            },
            {
                name: t.embeds.help.setchannel || '/setchannel',
                value: t.embeds.help.setchannelDesc || 'Set the channel for record announcements (Admin/Mod only)'
            },
            {
                name: t.embeds.help.setweeklyshortschannel || '/setweeklyshortschannel',
                value: t.embeds.help.setweeklyshortschannelDesc || 'Set the channel for weekly shorts announcements (Admin/Mod only)'
            },
            {
                name: t.embeds.help.updateDisplayNames || '/update-display-names',
                value: t.embeds.help.updateDisplayNamesDesc || 'Update all player display names from Trackmania API (Admin only)'
            }
        )
        .setTimestamp(new Date())
        .setFooter({ text: t.embeds.help.footer });

    await interaction.reply({ embeds: [embed] });
}

/**
 * Main interaction handler that routes slash commands to their appropriate handlers
 * Uses a command queue to prevent blocking and ensure commands are processed in order
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleInteraction(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    commandQueue.enqueue(async () => {
        try {
            const t = await getTranslations(interaction.guildId);

            switch (commandName) {
                case 'register':
                    await handleRegister(interaction);
                    break;
                case 'unregister':
                    await handleUnregister(interaction);
                    break;
                case 'records':
                    await handleRecords(interaction);
                    break;
                case 'leaderboard':
                    await handleLeaderboardModule(interaction);
                    break;
                case 'help':
                    await handleHelp(interaction);
                    break;
                case 'language':
                    await handleLanguage(interaction);
                    break;
                case 'setcountry':
                    await handleSetCountry(interaction);
                    break;
                case 'setchannel':
                    await handleSetChannel(interaction);
                    break;
                case 'setweeklyshortschannel':
                    await handleSetWeeklyShortsChannel(interaction);
                    break;
                case 'weeklyshortsleaderboard':
                    await handleWeeklyShortsLeaderboard(interaction);
                    break;
                default:
                    await interaction.reply(t.responses.error.unknownCommand);
            }
        } catch (error) {
            log(`Error handling interaction: ${error}`, 'error');
            try {
                const t = await getTranslations(interaction.guildId);
                if (interaction.deferred) {
                    await interaction.editReply(t.responses.error.unknown);
                } else if (!interaction.replied) {
                    await interaction.reply(t.responses.error.unknown);
                }
            } catch (replyError) {
                log(`Failed to reply to interaction after error: ${replyError}`, 'error');
            }
        }
    }, `command: ${commandName} from ${interaction.user.tag}`).catch((error) => {
        log(`Error queuing command ${commandName}: ${error.message}`, 'error');
        interaction.reply('Command queue is full, please try again later.').catch(() => { });
    });
}

/**
 * Handles the /language command to change the bot's language for a specific guild
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleLanguage(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({ content: t.responses.language.noPermission, ephemeral: true });
    }

    try {
        await interaction.deferReply();
        const langCode = interaction.options.getString('lang');
        const guildId = interaction.guildId;

        const currentTranslations = await getTranslations(guildId);

        const result = await setLanguage(guildId, langCode);

        if (result) {
            const newTranslations = await getTranslations(guildId);
            await interaction.editReply(newTranslations.responses.language.changed);
        } else {
            await interaction.editReply(currentTranslations.responses.language.error);
        }
    } catch (error) {
        log(`Error in language command: ${error.message}`, 'error');
        await interaction.editReply('❌ An error occurred while changing the language.');
    }
}

/**
 * Handles the /setcountry command to set the default country for leaderboard displays
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetCountry(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({ content: t.responses.setcountry.noPermission, ephemeral: true });
    }

    try {
        await interaction.deferReply();
        const countryCode = interaction.options.getString('country');
        const guildId = interaction.guildId;

        const result = await setDefaultCountry(guildId, countryCode);

        if (result) {
            await interaction.editReply(formatString(t.responses.setcountry.changed, { country: countryCode }));
        } else {
            await interaction.editReply(t.responses.setcountry.error);
        }
    } catch (error) {
        log(`Error in setcountry command: ${error.message}`, 'error');
        await interaction.editReply(t.responses.setcountry.error);
    }
}

/**
 * Handles the /setchannel command to configure where record announcements are posted
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetChannel(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({
            content: t.responses.setchannel?.noPermission || 'You need administrator or moderator permissions to use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.deferReply();
        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        if (!channel.isTextBased()) {
            return await interaction.editReply(
                t.responses.setchannel?.notText || 'The selected channel must be a text channel.'
            );
        }

        const result = await setAnnouncementChannel(guildId, channel.id);

        if (result) {
            await interaction.editReply(
                formatString(t.responses.setchannel?.changed || '✅ Record announcements will now be sent to {channel}', {
                    channel: `<#${channel.id}>`
                })
            );
        } else {
            await interaction.editReply(
                t.responses.setchannel?.error || '❌ Failed to set the announcement channel.'
            );
        }
    } catch (error) {
        log(`Error in setchannel command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.setchannel?.error || '❌ An error occurred while setting the channel.'
        );
    }
}

/**
 * Handles the /setweeklyshortschannel command to configure where weekly shorts announcements are posted
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetWeeklyShortsChannel(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({
            content: t.responses.setweeklyshortschannel?.noPermission ||
                'You need administrator or moderator permissions to use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.deferReply();
        const channel = interaction.options.getChannel('channel');
        const guildId = interaction.guildId;

        if (!channel.isTextBased()) {
            return await interaction.editReply(
                t.responses.setweeklyshortschannel?.notText ||
                'The selected channel must be a text channel.'
            );
        }

        const result = await setWeeklyShortsAnnouncementChannel(guildId, channel.id);

        if (!result) {
            return await interaction.editReply(
                t.responses.setweeklyshortschannel?.error ||
                '❌ Failed to set the weekly shorts announcement channel.'
            );
        }

        await interaction.editReply(
            formatString(
                t.responses.setweeklyshortschannel?.changed ||
                '✅ Weekly shorts announcements will now be sent to {channel}',
                { channel: `<#${channel.id}>` }
            )
        );
    } catch (error) {
        log(`Error in setweeklyshortschannel command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.setweeklyshortschannel?.error ||
            '❌ An error occurred while setting the channel.'
        );
    }
}

import handleLeaderboardModule from './handleLeaderboard.js';

/**
 * Handles the /weeklyshortsleaderboard command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleWeeklyShortsLeaderboard(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.deferReply();

        const mapName = interaction.options.getString('map');
        const countryCode = interaction.options.getString('country') || await getDefaultCountry(interaction.guildId);

        if (mapName) {
            // Show leaderboard for a specific map
            await showWeeklyShortMapLeaderboard(interaction, mapName, countryCode, t);
        } else {
            // Show overall weekly shorts standings
            await showWeeklyShortOverallLeaderboard(interaction, countryCode, t);
        }
    } catch (error) {
        log(`Error in weeklyshortsleaderboard command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.weeklyshortsleaderboard?.error ||
            '❌ An error occurred while fetching the weekly shorts leaderboard.'
        );
    }
}

/**
 * Shows the overall weekly shorts standings
 * @param {Interaction} interaction - Discord interaction object
 * @param {string} countryCode - Country code to filter by
 * @param {Object} t - Translation strings
 */
async function showWeeklyShortOverallLeaderboard(interaction, countryCode, t) {
    try {
        const campaign = await fetchCurrentWeeklyShort();
        const seasonUid = campaign.seasonUid;

        // Fetch the overall leaderboard for the weekly shorts season
        const overallRecords = await fetchWeeklyShortSeasonLeaderboard(seasonUid, countryCode, 5);

        if (overallRecords.length === 0) {
            return await interaction.editReply(
                t.responses.weeklyshortsleaderboard?.noSeasonRecords ||
                `No ${getCountryName(countryCode)} players found in the current weekly shorts.`
            );
        }

        // Get player names
        const accountIds = overallRecords.map(r => r.accountId);
        const playerNames = await fetchPlayerNames(accountIds);

        // Create and send embed
        const embed = createWeeklyShortSeasonLeaderboardEmbed(
            campaign.name,
            countryCode,
            overallRecords,
            playerNames,
            t
        );

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw error;
    }
}

/**
 * Shows the leaderboard for a specific weekly short map
 * @param {Interaction} interaction - Discord interaction object
 * @param {string} mapName - Map name to search for
 * @param {string} countryCode - Country code to filter by
 * @param {Object} t - Translation strings
 */
async function showWeeklyShortMapLeaderboard(interaction, mapName, countryCode, t) {
    try {
        const campaign = await fetchCurrentWeeklyShort();
        const mapUids = campaign.playlist.map(m => m.mapUid);

        const db = await getDb();
        const dbMaps = await db.all(
            'SELECT map_uid, name, thumbnail_url FROM weekly_short_maps WHERE season_uid = ?',
            campaign.seasonUid
        );

        let matchingMap = dbMaps.find(map =>
            map.name.toLowerCase().includes(mapName.toLowerCase())
        );

        if (!matchingMap) {
            const mapList = await fetchMapInfo(mapUids);
            const apiMap = mapList.find(map =>
                map.name.toLowerCase().includes(mapName.toLowerCase())
            );
            
            if (apiMap) {
                matchingMap = {
                    map_uid: apiMap.uid,
                    name: apiMap.name,
                    thumbnail_url: apiMap.thumbnailUrl
                };
            }
        }

        if (!matchingMap) {
            return await interaction.editReply(
                formatString(t.responses.weeklyshortsleaderboard?.noRecordsMap ||
                    'No weekly shorts map found matching "{mapName}".',
                    { mapName }
                )
            );
        }

        const mapRecords = await fetchWeeklyShortCountryLeaderboard(
            matchingMap.map_uid,
            campaign.seasonUid,
            countryCode,
            5
        );

        if (mapRecords.length === 0) {
            return await interaction.editReply(
                formatString(t.responses.weeklyshortsleaderboard?.noCountryRecords ||
                    'No records found for {country} in {mapName}.',
                    { country: getCountryName(countryCode), mapName: matchingMap.name }
                )
            );
        }

        const accountIds = mapRecords.map(r => r.accountId);
        const playerNames = await fetchPlayerNames(accountIds);

        const embed = createWeeklyShortMapLeaderboardEmbed(
            matchingMap.name,
            matchingMap.map_uid,
            matchingMap.thumbnail_url,
            countryCode,
            mapRecords,
            playerNames,
            t
        );

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        throw error;
    }
}

/**
 * Initializes and configures the Discord bot client with all necessary event handlers
 * Sets up command registration, scheduled tasks, and error handling
 * @returns {Client} Discord.js client instance
 */
export function initBot() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds
        ]
    });

    client.on('interactionCreate', handleInteraction);

    client.once('ready', async () => {
        const clientId = client.user.id;
        log(`Bot logged in as ${client.user.tag} (ID: ${clientId})`);
        log(`Bot is in ${client.guilds.cache.size} servers`);

        await registerCommands(clientId);

        startDefaultSchedules(client);

        scheduleTask('checkRecords', RECORD_CHECK_INTERVAL, async () => {
            recordCheckQueue.enqueue(async () => {
                await import('./recordTracker.js').then(module => module.checkRecords(client));
            }, 'scheduled record check');
        });

        scheduleTask('checkWeeklyShorts', WEEKLY_SHORTS_CHECK_INTERVAL, async () => {
            recordCheckQueue.enqueue(async () => {
                const maxPosition = process.env.WEEKLY_SHORTS_MAX_POSITION || 10000;
                await import('./weeklyShorts.js').then(module => module.checkWeeklyShorts(client, maxPosition));
            }, 'scheduled weekly shorts check');
        });

        setTimeout(async () => {
            recordCheckQueue.enqueue(async () => {
                await import('./recordTracker.js').then(module => module.checkRecords(client));
            }, 'initial record check').catch((error) => {
                log(`Error queuing initial record check: ${error.message}`, 'error');
            });
        }, INITIAL_RECORD_CHECK_DELAY);

        setTimeout(async () => {
            recordCheckQueue.enqueue(async () => {
                const maxPosition = process.env.WEEKLY_SHORTS_MAX_POSITION || 10000;
                await import('./weeklyShorts.js').then(module => module.checkWeeklyShorts(client, maxPosition));
            }, 'initial weekly shorts check').catch((error) => {
                log(`Error queuing initial weekly shorts check: ${error.message}`, 'error');
            });
        }, INITIAL_RECORD_CHECK_DELAY + 5000);
    });

    client.on('error', error => {
        log(`Discord client error: ${error}`, 'error');
    });

    client.on('shardError', error => {
        log(`WebSocket connection error: ${error}`, 'error');
    });

    process.on('SIGINT', () => {
        log('Shutting down bot...');
        clearAllSchedules();
        client.destroy();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        log('Shutting down bot...');
        clearAllSchedules();
        client.destroy();
        process.exit(0);
    });

    client.login(discordToken);
    return client;
}