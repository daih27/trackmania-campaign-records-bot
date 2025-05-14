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
        weeklyshortsleaderboardCountryOption: 'Select a country'
    },

    // Command responses
    responses: {
        register: {
            success: '✅ You have been registered for Trackmania record tracking!',
            updated: '✅ Your Trackmania account has been updated!',
            failed: '❌ Registration failed: {error}'
        },
        unregister: {
            success: '✅ You have been unregistered from Trackmania record tracking.',
            failed: '❌ Unregistration failed: {error}'
        },
        records: {
            notRegistered: 'You are not registered. Use `/register` to register your Trackmania account.',
            noRecords: "You don't have any records yet.",
            error: '❌ An error occurred while retrieving your records.'
        },
        leaderboard: {
            noRecordsMap: 'No records found for maps matching "{mapName}".',
            noRecords: 'No records found in the database.',
            noCountryRecords: 'No records found for {country} in {mapName}.',
            noSeasonRecords: 'No {country} players found in the current campaign leaderboard.',
            error: '❌ An error occurred while retrieving the leaderboard.',
            fetchingMaps: '🔄 Fetching maps from current campaign...',
            errorFetchingMaps: '❌ Error fetching maps from API. Please try again later.',
            loadingSeason: '🔄 Loading campaign leaderboard...'
        },
        language: {
            changed: '✅ Language has been changed to English.',
            error: '❌ An error occurred while changing the language.',
            noPermission: '❌ You need administrator or moderator permissions to change the bot language.'
        },
        setcountry: {
            changed: '✅ Default country has been set to {country}.',
            error: '❌ An error occurred while setting the default country.',
            noPermission: '❌ You need administrator or moderator permissions to change the default country.'
        },
        setchannel: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            changed: '✅ Record announcements will now be sent to {channel}',
            error: '❌ Failed to set the announcement channel.',
            notText: '❌ The selected channel must be a text channel.'
        },
        setweeklyshortschannel: {
            noPermission: '❌ You need administrator or moderator permissions to use this command.',
            changed: '✅ Weekly shorts announcements will now be sent to {channel}',
            error: '❌ Failed to set the weekly shorts announcement channel.',
            notText: '❌ The selected channel must be a text channel.'
        },
        weeklyshortsleaderboard: {
            error: '❌ An error occurred while fetching the weekly shorts leaderboard.',
            noSeasonRecords: 'No {country} players found in the current weekly shorts.',
            noRecordsMap: 'No weekly shorts map found matching "{mapName}".',
            noCountryRecords: 'No records found for {country} in {mapName}.'
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
            setOn: '📅 Set on',
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
            footer: 'Records are checked automatically'
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
            footer: 'Record set on {date} at {time}'
        }
    },

    values: {
        none: 'None'
    }
};