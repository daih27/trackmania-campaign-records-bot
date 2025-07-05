/**
 * English localization for Trackmania Campaign Records Bot
 */
export default {
    // Command descriptions
    commands: {
        register: 'Register your Trackmania account for record tracking',
        registerOption: 'Your Trackmania account ID (available from trackmania.io)',
        unregister: 'Unregister from the record tracking system',
        records: 'View your recent records',
        leaderboard: 'View the record leaderboard',
        leaderboardOption: 'Optional: filter by map name',
        help: 'Show available commands and how to use them',
        language: 'Change the language of the bot (admin/mod only)',
        languageOption: 'Language to use',
        setcountry: 'Set the default country for leaderboard (admin/mod only)',
        setcountryOption: 'Country to use as default',
        leaderboardCountryOption: 'Select a country for the leaderboard',
        setchannel: 'Set the channel for record announcements',
        setchannelOption: 'The channel to send record announcements to',
        setweeklyshortschannel: 'Set the channel for weekly shorts announcements',
        setweeklyshortschannelOption: 'The channel to send weekly shorts announcements to',
        weeklyshortsleaderboard: 'Show weekly shorts leaderboard',
        weeklyshortsleaderboardOption: 'Optional: filter by map name',
        weeklyshortsleaderboardCountryOption: 'Select a country',
        setminposition: 'Set the minimum world position to announce records',
        setminpositionOption: 'Minimum world position (e.g. 5000)',
        togglecampaignannouncements: 'Toggle campaign record announcements',
        togglecampaignannouncementsOption: 'Enable or disable campaign announcements',
        toggleweeklyshortsannouncements: 'Toggle weekly shorts announcements',
        toggleweeklyshortsannouncementsOption: 'Enable or disable weekly shorts announcements',
        setcampaignsearchtime: 'Set the campaign search interval (authorized users only)',
        setcampaignsearchtimeOption: 'Search interval in minutes (5-1440)',
        setweeklyshortssearchtime: 'Set the weekly shorts search interval (authorized users only)',
        setweeklyshortssearchtimeOption: 'Search interval in minutes (5-1440)',
        authorizeuser: 'Authorize a user to modify global settings (authorized users only)',
        authorizeuserOption: 'User to authorize',
        unauthorizeuser: 'Remove user authorization for global settings (authorized users only)',
        unauthorizeuserOption: 'User to unauthorize'
    },

    // Command responses
    responses: {
        register: {
            success: '✅ You have been registered for Trackmania record tracking!',
            updated: '✅ Your Trackmania account has been updated!',
            failed: '❌ Registration failed: {error}',
            processing: '🔄 Registering your Trackmania account...'
        },
        unregister: {
            success: '✅ You have been unregistered from Trackmania record tracking.',
            failed: '❌ Unregistration failed: {error}',
            processing: '🔄 Unregistering your Trackmania account...'
        },
        records: {
            notRegistered: 'You are not registered. Use `/register` to register your Trackmania account.',
            noRecords: "You don't have any records yet.",
            error: '❌ An error occurred while retrieving your records.',
            processing: '🔄 Fetching your recent records...'
        },
        leaderboard: {
            noRecordsMap: 'No records found for maps matching "{mapName}".',
            noRecords: 'No records found in the database.',
            noCountryRecords: 'No records found for {country} in {mapName}.',
            noSeasonRecords: 'No {country} players found in the current campaign leaderboard.',
            error: '❌ An error occurred while retrieving the leaderboard.',
            fetchingMaps: '🔄 Fetching maps from current campaign...',
            errorFetchingMaps: '❌ Error fetching maps from API. Please try again later.',
            loadingSeason: '🔄 Loading campaign leaderboard...',
            processing: '🔄 Fetching leaderboard data...'
        },
        language: {
            changed: '✅ Language has been changed to English.',
            error: '❌ An error occurred while changing the language.',
            noPermission: '❌ You need administrator or moderator permissions to change the bot language.',
            processing: '🔄 Changing bot language...'
        },
        setcountry: {
            changed: '✅ Default country has been set to {country}.',
            error: '❌ An error occurred while setting the default country.',
            noPermission: '❌ You need administrator or moderator permissions to change the default country.',
            processing: '🔄 Setting default country...'
        },
        setchannel: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            changed: '✅ Record announcements will now be sent to {channel}',
            error: '❌ Failed to set the announcement channel.',
            notText: '❌ The selected channel must be a text channel.',
            processing: '🔄 Setting announcement channel...'
        },
        setweeklyshortschannel: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            changed: '✅ Weekly shorts announcements will now be sent to {channel}',
            error: '❌ Failed to set the weekly shorts announcement channel.',
            notText: '❌ The selected channel must be a text channel.',
            processing: '🔄 Setting weekly shorts announcement channel...'
        },
        weeklyshortsleaderboard: {
            error: '❌ An error occurred while fetching the weekly shorts leaderboard.',
            noSeasonRecords: 'No {country} players found in the current weekly shorts.',
            noRecordsMap: 'No weekly shorts map found matching "{mapName}".',
            noCountryRecords: 'No records found for {country} in {mapName}.',
            processing: '🔄 Fetching weekly shorts leaderboard...'
        },
        setminposition: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            changed: '✅ Records will now only be announced for world positions within the top {position}',
            error: '❌ Failed to set the minimum world position.',
            processing: '🔄 Setting minimum world position...'
        },
        togglecampaignannouncements: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            success: '✅ Campaign announcements have been {status} for this server.',
            error: '❌ Failed to update campaign announcement settings.',
            alreadySet: 'Campaign announcements are already {status} for this server.',
            enabledStatus: 'enabled',
            disabledStatus: 'disabled',
            processing: '🔄 Updating campaign announcement settings...'
        },
        toggleweeklyshortsannouncements: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            success: '✅ Weekly shorts announcements have been {status} for this server.',
            error: '❌ Failed to update weekly shorts announcement settings.',
            alreadySet: 'Weekly shorts announcements are already {status} for this server.',
            enabledStatus: 'enabled',
            disabledStatus: 'disabled',
            processing: '🔄 Updating weekly shorts announcement settings...'
        },
        setcampaignsearchtime: {
            noPermission: '❌ You are not authorized to modify global settings.',
            success: '✅ Campaign search interval has been set to {minutes} minutes.',
            error: '❌ Failed to set the campaign search interval.',
            processing: '🔄 Setting campaign search interval...'
        },
        setweeklyshortssearchtime: {
            noPermission: '❌ You are not authorized to modify global settings.',
            success: '✅ Weekly shorts search interval has been set to {minutes} minutes.',
            error: '❌ Failed to set the weekly shorts search interval.',
            processing: '🔄 Setting weekly shorts search interval...'
        },
        authorizeuser: {
            noPermission: '❌ You are not authorized to modify global settings.',
            success: '✅ {user} has been authorized to modify global settings.',
            error: '❌ Failed to authorize the user.',
            processing: '🔄 Authorizing user...'
        },
        unauthorizeuser: {
            noPermission: '❌ You are not authorized to modify global settings.',
            success: '✅ {user} authorization has been removed.',
            error: '❌ Failed to remove user authorization.',
            processing: '🔄 Removing user authorization...'
        },
        error: {
            unknown: 'An error occurred while processing this command.',
            unknownCommand: 'Unknown command.'
        }
    },

    // Embed titles and fields
    embeds: {
        records: {
            title: '🏆 Recent Records: {username}',
            description: 'Your {count} most recent records:',
            time: '⏱️ Time',
        },
        countryLeaderboard: {
            title: '🏆 {country} Leaderboard: {mapName}',
            description: 'Top {count} {country} records for this map:',
            time: '⏱️ Time',
            position: '🏁 Position',
            worldwide: 'worldwide',
            noRecords: 'No {country} Records',
            noRecordsDesc: 'No records found for {country} players on this map.'
        },
        seasonLeaderboard: {
            title: '🏆 {country} Campaign Leaderboard: {season}',
            description: 'Top {count} {country} players in the current campaign:',
            points: '🔸 Points',
            position: '🏁 Position',
            worldwide: 'worldwide',
            noRecords: 'No {country} Records',
            noRecordsDesc: 'No records found for {country} players in this campaign.'
        },
        help: {
            title: '❓ Trackmania Campaign Records Bot - Help',
            description: 'Here are the available slash commands:',
            register: '🔑 /register [account-id]',
            registerDesc: 'Register your Trackmania account for record tracking',
            unregister: '🚫 /unregister',
            unregisterDesc: 'Unregister from the record tracking system',
            records: '🏁 /records',
            recordsDesc: 'View your recent records',
            leaderboard: '🏆 /leaderboard [map]',
            leaderboardDesc: 'View the country leaderboard (shows current campaign or specific map)',
            help: '❓ /help',
            helpDesc: 'Show this help message',
            language: '🌐 /language',
            languageDesc: 'Change the language of the bot (admin/mod only)',
            setcountry: '🇺🇳 /setcountry',
            setcountryDesc: 'Set the default country for leaderboard (admin/mod only)',
            setchannel: '📣 /setchannel',
            setchannelDesc: 'Set the channel for record announcements (admin/mod only)',
            weeklyshortsleaderboard: '🏆 /weeklyshortsleaderboard',
            weeklyshortsleaderboardDesc: 'Show weekly shorts leaderboard (overall or by map)',
            setweeklyshortschannel: '📢 /setweeklyshortschannel',
            setweeklyshortschannelDesc: 'Set the channel for weekly shorts announcements (admin/mod only)',
            setminposition: '🎯 /setminposition',
            setminpositionDesc: 'Set minimum world position to announce records (admin/mod only)',
            togglecampaignannouncements: '🔔 /togglecampaignannouncements',
            togglecampaignannouncementsDesc: 'Enable or disable campaign record announcements (admin/mod only)',
            toggleweeklyshortsannouncements: '🔔 /toggleweeklyshortsannouncements',
            toggleweeklyshortsannouncementsDesc: 'Enable or disable weekly shorts announcements (admin/mod only)',
            setcampaignsearchtime: '⏰ /setcampaignsearchtime',
            setcampaignsearchtimeDesc: 'Set the campaign search interval (authorized users only)',
            setweeklyshortssearchtime: '⏰ /setweeklyshortssearchtime',
            setweeklyshortssearchtimeDesc: 'Set the weekly shorts search interval (authorized users only)',
            authorizeuser: '🔑 /authorizeuser',
            authorizeuserDesc: 'Authorize a user to modify global settings (authorized users only)',
            unauthorizeuser: '🔒 /unauthorizeuser',
            unauthorizeuserDesc: 'Remove user authorization for global settings (authorized users only)',
        },
        newRecord: {
            title: '{emoji} New PB!',
            description: '**{username}** (<@{discordId}>) just set a {recordType}!',
            firstRecord: 'first record',
            newPersonalBest: 'new personal best',
            map: '🗺️ Map',
            time: '⏱️ Time',
            worldPosition: '🌍 World Position',
            previous: '⏮️ Previous',
            footer: 'Record set on {date} at {time}',
            places: 'places',
            samePosition: 'Same position',
            improved: '↑ {count} places',
            worsened: '↓ {count} places'
        }
    },

    values: {
        none: 'None'
    }
};