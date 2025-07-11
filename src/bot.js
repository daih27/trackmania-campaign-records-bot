import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { discordToken, tmOAuthClientId, tmOAuthClientSecret, TRACKMANIA_ICON_URL, getCampaignCheckInterval, getWeeklyShortsCheckInterval, INITIAL_RECORD_CHECK_DELAY } from './config.js';
import { startDefaultSchedules, clearAllSchedules, scheduleTask, clearSchedule } from './utils/scheduler.js';
import { commandQueue, recordCheckQueue } from './utils/taskQueue.js';
import { registerPlayer, unregisterPlayer, getPlayerByDiscordId } from './playerManager.js';
import { getDisplayNames } from './oauth.js';
import { formatTime, log } from './utils.js';
import { getDb, isUserAuthorized, addAuthorizedUser, removeAuthorizedUser, setCampaignCheckInterval, setWeeklyShortsCheckInterval } from './db.js';
import { getTranslations, setLanguage, getAvailableLanguages, formatString } from './localization/index.js';
import { setDefaultCountry, setAnnouncementChannel, setWeeklyShortsAnnouncementChannel, setMinWorldPosition, toggleCampaignAnnouncements, toggleWeeklyShortsAnnouncements, getCampaignAnnouncementsStatus, getWeeklyShortsAnnouncementsStatus } from './guildSettings.js';
import { getZoneName, getAvailableCountries } from './config/zones.js';
import { getDefaultCountry } from './guildSettings.js';
import {
    fetchCurrentWeeklyShort,
    fetchWeeklyShortSeasonLeaderboard,
    fetchWeeklyShortCountryLeaderboard,
    createWeeklyShortSeasonLeaderboardEmbed,
    createWeeklyShortMapLeaderboardEmbed,
    cleanMapName
} from './weeklyShorts.js';
import { fetchMapInfo, fetchPlayerNames } from './recordTracker.js';
import handleLeaderboard from './handleLeaderboard.js';

/**
 * Defines all available slash commands for the Discord bot with their options and descriptions
 * @param {Object} t - Translation strings for command names and descriptions
 * @returns {Promise<Array>} Array of command configurations to register with Discord
 */
async function getCommands(t) {
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
                return option.setName('country')
                    .setDescription(t.commands.leaderboardCountryOption || 'Select a country')
                    .setRequired(false)
                    .setAutocomplete(true);
            }),

        new SlashCommandBuilder()
            .setName('weeklyshortsleaderboard')
            .setDescription(t.commands.weeklyshortsleaderboard || 'Show weekly shorts leaderboard')
            .addStringOption(option =>
                option.setName('map')
                    .setDescription(t.commands.weeklyshortsleaderboardOption || 'Optional: filter by map name')
                    .setRequired(false))
            .addStringOption(option => {
                return option.setName('country')
                    .setDescription(t.commands.weeklyshortsleaderboardCountryOption || 'Select a country')
                    .setRequired(false)
                    .setAutocomplete(true);
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
                return option.setName('country')
                    .setDescription(t.commands.setcountryOption || 'Country to use as default')
                    .setRequired(true)
                    .setAutocomplete(true);
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

        new SlashCommandBuilder()
            .setName('setminposition')
            .setDescription(t.commands.setminposition || 'Set the minimum world position to announce records')
            .addIntegerOption(option =>
                option.setName('position')
                    .setDescription(t.commands.setminpositionOption || 'Minimum world position (e.g. 5000)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(100000)),

        new SlashCommandBuilder()
            .setName('togglecampaignannouncements')
            .setDescription(t.commands.togglecampaignannouncements || 'Toggle campaign record announcements')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription(t.commands.togglecampaignannouncementsOption || 'Enable or disable campaign announcements')
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('toggleweeklyshortsannouncements')
            .setDescription(t.commands.toggleweeklyshortsannouncements || 'Toggle weekly shorts announcements')
            .addBooleanOption(option =>
                option.setName('enabled')
                    .setDescription(t.commands.toggleweeklyshortsannouncementsOption || 'Enable or disable weekly shorts announcements')
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('setcampaignsearchtime')
            .setDescription(t.commands.setcampaignsearchtime || 'Set the campaign search interval (authorized users only)')
            .addIntegerOption(option =>
                option.setName('minutes')
                    .setDescription(t.commands.setcampaignsearchtimeOption || 'Search interval in minutes (5-1440)')
                    .setRequired(true)
                    .setMinValue(5)
                    .setMaxValue(1440)),

        new SlashCommandBuilder()
            .setName('setweeklyshortssearchtime')
            .setDescription(t.commands.setweeklyshortssearchtime || 'Set the weekly shorts search interval (authorized users only)')
            .addIntegerOption(option =>
                option.setName('minutes')
                    .setDescription(t.commands.setweeklyshortssearchtimeOption || 'Search interval in minutes (5-1440)')
                    .setRequired(true)
                    .setMinValue(5)
                    .setMaxValue(1440)),

        new SlashCommandBuilder()
            .setName('authorizeuser')
            .setDescription(t.commands.authorizeuser || 'Authorize a user to modify global settings (authorized users only)')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(t.commands.authorizeuserOption || 'User to authorize')
                    .setRequired(true)),

        new SlashCommandBuilder()
            .setName('unauthorizeuser')
            .setDescription(t.commands.unauthorizeuser || 'Remove user authorization for global settings (authorized users only)')
            .addUserOption(option =>
                option.setName('user')
                    .setDescription(t.commands.unauthorizeuserOption || 'User to unauthorize')
                    .setRequired(true)),
                    
    ].map(command => command.toJSON());
}

let commands = await getCommands(await getTranslations());

/**
 * Registers all bot commands with Discord's slash command system
 * @param {string} clientId - Discord bot client ID
 */
async function registerCommands(clientId) {
    try {
        const rest = new REST({ version: '10' }).setToken(discordToken);

        log('Started refreshing application (/) commands.');

        const t = await getTranslations();
        commands = await getCommands(t);

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
    const guildId = interaction.guildId;

    try {
        await interaction.reply(t.responses.register.processing || '🔄 Registering your Trackmania account...');

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

        const result = await registerPlayer(interaction.user.id, guildId, accountId, username);

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
    const guildId = interaction.guildId;

    try {
        await interaction.reply(t.responses.unregister.processing || '🔄 Unregistering your Trackmania account...');
        const result = await unregisterPlayer(interaction.user.id, guildId);

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
    const guildId = interaction.guildId;

    try {
        await interaction.reply(t.responses.records.processing || '🔄 Fetching your recent records...');
        const player = await getPlayerByDiscordId(interaction.user.id, guildId);

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
        )
      WHERE 
        r.player_id = ?
      ORDER BY 
        r.recorded_at DESC
      LIMIT ?
    `, [player.id, limit]);

        if (records.length === 0) {
            return await interaction.editReply(t.responses.records.noRecords);
        }

        const playerName = player.username || 'Player';
        const linkedPlayerName = player.account_id 
            ? `[${playerName}](https://trackmania.io/player#/player/${player.account_id})`
            : playerName;

        const embed = new EmbedBuilder()
            .setTitle(formatString(t.embeds.records.title, { username: linkedPlayerName }))
            .setColor(0x00BFFF)
            .setAuthor({ name: 'Trackmania Campaign Records', iconURL: TRACKMANIA_ICON_URL })
            .setDescription(formatString(t.embeds.records.description, { count: records.length }))
            .setTimestamp(new Date())

        records.forEach((record, index) => {
            let timeInfo = `${t.embeds.records.time}: **${formatTime(record.time_ms)}**`;
            embed.addFields({
                name: `${index + 1}. ${record.map_name || record.map_uid}`,
                value: `${timeInfo}`,
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
                name: t.embeds.help.weeklyshortsleaderboard,
                value: t.embeds.help.weeklyshortsleaderboardDesc
            },
            {
                name: t.embeds.help.help,
                value: t.embeds.help.helpDesc
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
                name: t.embeds.help.setchannel,
                value: t.embeds.help.setchannelDesc
            },
            {
                name: t.embeds.help.setweeklyshortschannel,
                value: t.embeds.help.setweeklyshortschannelDesc
            },
            {
                name: t.embeds.help.setminposition,
                value: t.embeds.help.setminpositionDesc
            },
            {
                name: t.embeds.help.togglecampaignannouncements,
                value: t.embeds.help.togglecampaignannouncementsDesc
            },
            {
                name: t.embeds.help.toggleweeklyshortsannouncements,
                value: t.embeds.help.toggleweeklyshortsannouncementsDesc
            },
            {
                name: t.embeds.help.setcampaignsearchtime,
                value: t.embeds.help.setcampaignsearchtimeDesc
            },
            {
                name: t.embeds.help.setweeklyshortssearchtime,
                value: t.embeds.help.setweeklyshortssearchtimeDesc
            },
            {
                name: t.embeds.help.authorizeuser,
                value: t.embeds.help.authorizeuserDesc
            },
            {
                name: t.embeds.help.unauthorizeuser,
                value: t.embeds.help.unauthorizeuserDesc
            },
        )
        .setTimestamp(new Date())

    await interaction.reply({ embeds: [embed] });
}

/**
 * Handles autocomplete interactions for country selection
 * @param {Interaction} interaction - Discord autocomplete interaction
 */
async function handleAutocomplete(interaction) {
    const { commandName, options } = interaction;
    const focusedOption = options.getFocused(true);

    if (focusedOption.name === 'country') {
        try {
            const countries = await getAvailableCountries();
            const query = focusedOption.value.toLowerCase();

            const filtered = countries
                .filter(country => country.name.toLowerCase().includes(query))
                .slice(0, 25);

            await interaction.respond(filtered.map(country => ({
                name: country.name,
                value: country.value
            })));
        } catch (error) {
            log(`Error in autocomplete: ${error.message}`, 'error');
            await interaction.respond([]);
        }
    }
}

/**
 * Main interaction handler that routes slash commands to their appropriate handlers
 * Uses a command queue to prevent blocking and ensure commands are processed in order
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleInteraction(interaction) {
    if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
    }

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
                    await handleLeaderboard(interaction);
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
                case 'setminposition':
                    await handleSetMinPosition(interaction);
                    break;
                case 'togglecampaignannouncements':
                    await handleToggleCampaignAnnouncements(interaction);
                    break;
                case 'toggleweeklyshortsannouncements':
                    await handleToggleWeeklyShortsAnnouncements(interaction);
                    break;
                case 'setcampaignsearchtime':
                    await handleSetCampaignSearchTime(interaction);
                    break;
                case 'setweeklyshortssearchtime':
                    await handleSetWeeklyShortsSearchTime(interaction);
                    break;
                case 'authorizeuser':
                    await handleAuthorizeUser(interaction);
                    break;
                case 'unauthorizeuser':
                    await handleUnauthorizeUser(interaction);
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
        await interaction.reply(t.responses.language.processing || '🔄 Changing bot language...');
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
        await interaction.reply(t.responses.setcountry.processing || '🔄 Setting default country...');
        const countryCode = interaction.options.getString('country');
        const guildId = interaction.guildId;

        const result = await setDefaultCountry(guildId, countryCode);

        if (result) {
            const countryName = await getZoneName(countryCode);
            await interaction.editReply(formatString(t.responses.setcountry.changed, { country: countryName }));
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
        await interaction.reply(t.responses.setchannel?.processing || '🔄 Setting announcement channel...');
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
        await interaction.reply(t.responses.setweeklyshortschannel?.processing || '🔄 Setting weekly shorts announcement channel...');
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

/**
 * Handles the /setminposition command to set the minimum world position threshold
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetMinPosition(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({
            content: t.responses.setminposition?.noPermission ||
                'You need administrator or moderator permissions to use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.reply(t.responses.setminposition?.processing || '🔄 Setting minimum world position...');
        const position = interaction.options.getInteger('position');
        const guildId = interaction.guildId;

        const result = await setMinWorldPosition(guildId, position);

        if (!result) {
            return await interaction.editReply(
                t.responses.setminposition?.error ||
                '❌ Failed to set the minimum world position.'
            );
        }

        await interaction.editReply(
            formatString(
                t.responses.setminposition?.changed ||
                '✅ Records will now only be announced for world positions within the top {position}',
                { position: position.toLocaleString() }
            )
        );
    } catch (error) {
        log(`Error in setminposition command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.setminposition?.error ||
            '❌ An error occurred while setting the minimum world position.'
        );
    }
}

/**
 * Handles the /setcampaignsearchtime command to set the campaign search interval
 * Authorized users only
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetCampaignSearchTime(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        if (!await isUserAuthorized(interaction.user.id)) {
            return await interaction.reply({
                content: t.responses.setcampaignsearchtime?.noPermission ||
                    '❌ You are not authorized to modify global settings.',
                ephemeral: true
            });
        }

        await interaction.reply(t.responses.setcampaignsearchtime?.processing || '🔄 Setting campaign search interval...');
        const minutes = interaction.options.getInteger('minutes');
        const intervalMs = minutes * 60 * 1000;

        const result = await setCampaignCheckInterval(intervalMs);

        if (result) {
            await restartCampaignSchedule();
            
            await interaction.editReply(
                formatString(
                    t.responses.setcampaignsearchtime?.success ||
                    '✅ Campaign search interval has been set to {minutes} minutes.',
                    { minutes: minutes.toString() }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.setcampaignsearchtime?.error ||
                '❌ Failed to set the campaign search interval.'
            );
        }
    } catch (error) {
        log(`Error in setcampaignsearchtime command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.setcampaignsearchtime?.error ||
            '❌ An error occurred while setting the campaign search interval.'
        );
    }
}

/**
 * Handles the /setweeklyshortssearchtime command to set the weekly shorts search interval
 * Authorized users only
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleSetWeeklyShortsSearchTime(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        if (!await isUserAuthorized(interaction.user.id)) {
            return await interaction.reply({
                content: t.responses.setweeklyshortssearchtime?.noPermission ||
                    '❌ You are not authorized to modify global settings.',
                ephemeral: true
            });
        }

        await interaction.reply(t.responses.setweeklyshortssearchtime?.processing || '🔄 Setting weekly shorts search interval...');
        const minutes = interaction.options.getInteger('minutes');
        const intervalMs = minutes * 60 * 1000;

        const result = await setWeeklyShortsCheckInterval(intervalMs);

        if (result) {
            // Restart the weekly shorts check schedule with new interval
            await restartWeeklyShortsSchedule();
            
            await interaction.editReply(
                formatString(
                    t.responses.setweeklyshortssearchtime?.success ||
                    '✅ Weekly shorts search interval has been set to {minutes} minutes.',
                    { minutes: minutes.toString() }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.setweeklyshortssearchtime?.error ||
                '❌ Failed to set the weekly shorts search interval.'
            );
        }
    } catch (error) {
        log(`Error in setweeklyshortssearchtime command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.setweeklyshortssearchtime?.error ||
            '❌ An error occurred while setting the weekly shorts search interval.'
        );
    }
}

/**
 * Handles the /authorizeuser command to authorize a user for global settings
 * Authorized users only
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleAuthorizeUser(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        if (!await isUserAuthorized(interaction.user.id)) {
            return await interaction.reply({
                content: t.responses.authorizeuser?.noPermission ||
                    '❌ You are not authorized to modify global settings.',
                ephemeral: true
            });
        }

        await interaction.reply(t.responses.authorizeuser?.processing || '🔄 Authorizing user...');
        const user = interaction.options.getUser('user');

        const result = await addAuthorizedUser(user.id);

        if (result) {
            await interaction.editReply(
                formatString(
                    t.responses.authorizeuser?.success ||
                    '✅ {user} has been authorized to modify global settings.',
                    { user: `<@${user.id}>` }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.authorizeuser?.error ||
                '❌ Failed to authorize the user.'
            );
        }
    } catch (error) {
        log(`Error in authorizeuser command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.authorizeuser?.error ||
            '❌ An error occurred while authorizing the user.'
        );
    }
}

/**
 * Handles the /unauthorizeuser command to remove user authorization
 * Authorized users only
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleUnauthorizeUser(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        if (!await isUserAuthorized(interaction.user.id)) {
            return await interaction.reply({
                content: t.responses.unauthorizeuser?.noPermission ||
                    '❌ You are not authorized to modify global settings.',
                ephemeral: true
            });
        }

        await interaction.reply(t.responses.unauthorizeuser?.processing || '🔄 Removing user authorization...');
        const user = interaction.options.getUser('user');

        const result = await removeAuthorizedUser(user.id);

        if (result) {
            await interaction.editReply(
                formatString(
                    t.responses.unauthorizeuser?.success ||
                    '✅ {user} authorization has been removed.',
                    { user: `<@${user.id}>` }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.unauthorizeuser?.error ||
                '❌ Failed to remove user authorization.'
            );
        }
    } catch (error) {
        log(`Error in unauthorizeuser command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.unauthorizeuser?.error ||
            '❌ An error occurred while removing user authorization.'
        );
    }
}

let currentCampaignScheduleInterval = null;
let currentWeeklyShortsScheduleInterval = null;

/**
 * Restart the campaign record checking schedule with updated interval
 */
async function restartCampaignSchedule() {
    try {
        clearSchedule('checkRecords');
        const newInterval = await getCampaignCheckInterval();
        currentCampaignScheduleInterval = newInterval;
        
        scheduleTask('checkRecords', newInterval, async () => {
            recordCheckQueue.enqueue(async () => {
                await import('./recordTracker.js').then(module => module.checkRecords(global.botClient));
            }, 'scheduled record check');
        });
        
        log(`Campaign record checking schedule restarted with ${newInterval}ms interval`);
    } catch (error) {
        log(`Error restarting campaign schedule: ${error.message}`, 'error');
    }
}

/**
 * Restart the weekly shorts checking schedule with updated interval
 */
async function restartWeeklyShortsSchedule() {
    try {
        clearSchedule('checkWeeklyShorts');
        const newInterval = await getWeeklyShortsCheckInterval();
        currentWeeklyShortsScheduleInterval = newInterval;
        
        scheduleTask('checkWeeklyShorts', newInterval, async () => {
            recordCheckQueue.enqueue(async () => {
                const maxPosition = process.env.WEEKLY_SHORTS_MAX_POSITION || 10000;
                await import('./weeklyShorts.js').then(module => module.checkWeeklyShorts(global.botClient, maxPosition));
            }, 'scheduled weekly shorts check');
        });
        
        log(`Weekly shorts checking schedule restarted with ${newInterval}ms interval`);
    } catch (error) {
        log(`Error restarting weekly shorts schedule: ${error.message}`, 'error');
    }
}

/**
 * Handles the /togglecampaignannouncements command to enable/disable campaign announcements
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleToggleCampaignAnnouncements(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({
            content: t.responses.togglecampaignannouncements?.noPermission ||
                'You need administrator or moderator permissions to use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.reply(t.responses.togglecampaignannouncements?.processing || '🔄 Updating campaign announcement settings...');
        const enabled = interaction.options.getBoolean('enabled');
        const guildId = interaction.guildId;

        const currentStatus = await getCampaignAnnouncementsStatus(guildId);
        if (currentStatus === enabled) {
            const statusText = enabled ?
                (t.responses.togglecampaignannouncements?.enabledStatus || 'enabled') :
                (t.responses.togglecampaignannouncements?.disabledStatus || 'disabled');

            return await interaction.editReply(
                formatString(
                    t.responses.togglecampaignannouncements?.alreadySet ||
                    `Campaign announcements are already {status} for this server.`,
                    { status: statusText }
                )
            );
        }

        const result = await toggleCampaignAnnouncements(guildId, enabled);

        if (result) {
            const statusText = enabled ?
                (t.responses.togglecampaignannouncements?.enabledStatus || 'enabled') :
                (t.responses.togglecampaignannouncements?.disabledStatus || 'disabled');

            await interaction.editReply(
                formatString(
                    t.responses.togglecampaignannouncements?.success ||
                    `✅ Campaign announcements have been {status} for this server.`,
                    { status: statusText }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.togglecampaignannouncements?.error ||
                '❌ Failed to update campaign announcement settings.'
            );
        }
    } catch (error) {
        log(`Error in togglecampaignannouncements command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.togglecampaignannouncements?.error ||
            '❌ An error occurred while updating campaign announcement settings.'
        );
    }
}

/**
 * Handles the /toggleweeklyshortsannouncements command to enable/disable weekly shorts announcements
 * Admin/Moderator-only command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleToggleWeeklyShortsAnnouncements(interaction) {
    const t = await getTranslations(interaction.guildId);

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
        !interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return await interaction.reply({
            content: t.responses.toggleweeklyshortsannouncements?.noPermission ||
                'You need administrator or moderator permissions to use this command.',
            ephemeral: true
        });
    }

    try {
        await interaction.reply(t.responses.toggleweeklyshortsannouncements?.processing || '🔄 Updating weekly shorts announcement settings...');
        const enabled = interaction.options.getBoolean('enabled');
        const guildId = interaction.guildId;

        const currentStatus = await getWeeklyShortsAnnouncementsStatus(guildId);
        if (currentStatus === enabled) {
            const statusText = enabled ?
                (t.responses.toggleweeklyshortsannouncements?.enabledStatus || 'enabled') :
                (t.responses.toggleweeklyshortsannouncements?.disabledStatus || 'disabled');

            return await interaction.editReply(
                formatString(
                    t.responses.toggleweeklyshortsannouncements?.alreadySet ||
                    `Weekly shorts announcements are already {status} for this server.`,
                    { status: statusText }
                )
            );
        }

        const result = await toggleWeeklyShortsAnnouncements(guildId, enabled);

        if (result) {
            const statusText = enabled ?
                (t.responses.toggleweeklyshortsannouncements?.enabledStatus || 'enabled') :
                (t.responses.toggleweeklyshortsannouncements?.disabledStatus || 'disabled');

            await interaction.editReply(
                formatString(
                    t.responses.toggleweeklyshortsannouncements?.success ||
                    `✅ Weekly shorts announcements have been {status} for this server.`,
                    { status: statusText }
                )
            );
        } else {
            await interaction.editReply(
                t.responses.toggleweeklyshortsannouncements?.error ||
                '❌ Failed to update weekly shorts announcement settings.'
            );
        }
    } catch (error) {
        log(`Error in toggleweeklyshortsannouncements command: ${error.message}`, 'error');
        await interaction.editReply(
            t.responses.toggleweeklyshortsannouncements?.error ||
            '❌ An error occurred while updating weekly shorts announcement settings.'
        );
    }
}

/**
 * Handles the /weeklyshortsleaderboard command
 * @param {Interaction} interaction - Discord interaction object
 */
async function handleWeeklyShortsLeaderboard(interaction) {
    const t = await getTranslations(interaction.guildId);

    try {
        await interaction.reply(t.responses.weeklyshortsleaderboard?.processing || '🔄 Fetching weekly shorts leaderboard...');

        const mapName = interaction.options.getString('map');
        const countryCode = interaction.options.getString('country') || await getDefaultCountry(interaction.guildId);

        if (mapName) {
            await showWeeklyShortMapLeaderboard(interaction, mapName, countryCode, t);
        } else {
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
        const overallRecords = await fetchWeeklyShortSeasonLeaderboard(seasonUid, countryCode, 5);

        if (overallRecords.length === 0) {
            const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
            return await interaction.editReply(
                t.responses.weeklyshortsleaderboard?.noSeasonRecords ||
                `No ${countryName} players found in the current weekly shorts.`
            );
        }

        const accountIds = overallRecords.map(r => r.accountId);
        const playerNames = await fetchPlayerNames(accountIds);

        const embed = await createWeeklyShortSeasonLeaderboardEmbed(
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

        const isMapNumber = /^[1-5]$/.test(mapName);

        let matchingMap;
        if (isMapNumber) {
            const mapNumber = parseInt(mapName);
            matchingMap = dbMaps.find(map => {
                const cleanedName = cleanMapName(map.name);
                return cleanedName.match(new RegExp(`^${mapNumber}\\s*-\\s`));
            });
        } else {
            matchingMap = dbMaps.find(map => {
                const cleanedName = cleanMapName(map.name);
                return cleanedName.toLowerCase().includes(mapName.toLowerCase());
            });
        }

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
            const countryName = countryCode === 'world' ? 'World' : await getZoneName(countryCode);
            return await interaction.editReply(
                formatString(t.responses.weeklyshortsleaderboard?.noCountryRecords ||
                    'No records found for {country} in {mapName}.',
                    { country: countryName, mapName: matchingMap.name }
                )
            );
        }

        const accountIds = mapRecords.map(r => r.accountId);
        const playerNames = await fetchPlayerNames(accountIds);

        const embed = await createWeeklyShortMapLeaderboardEmbed(
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

        global.botClient = client;

        await registerCommands(clientId);

        startDefaultSchedules(client);

        const campaignInterval = await getCampaignCheckInterval();
        const weeklyShortsInterval = await getWeeklyShortsCheckInterval();
        
        log(`Starting record checking with campaign interval: ${campaignInterval}ms, weekly shorts interval: ${weeklyShortsInterval}ms`);

        scheduleTask('checkRecords', campaignInterval, async () => {
            recordCheckQueue.enqueue(async () => {
                await import('./recordTracker.js').then(module => module.checkRecords(client));
            }, 'scheduled record check');
        });

        scheduleTask('checkWeeklyShorts', weeklyShortsInterval, async () => {
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