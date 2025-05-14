# Trackmania Campaign Records Bot

A Discord bot that tracks and announces Trackmania player records for campaign maps. The bot monitors player times on official campaign maps and announces improvements in Discord channels. It's in very early stage still, but feel free to contribute!

## Features

- Track player records on official Trackmania campaign maps
- Track weekly shorts personal bests
- Automatic Discord announcements for new records and improvements
- Automatic announcements for weekly shorts personal bests
- Multi-language support (English and Spanish for now)
- Leaderboard commands with country filtering
- Expandable to more languages and countries if needed

## Installation

### Prerequisites

- Node.js v14 or higher
- Discord bot token
- Trackmania/Ubisoft account credentials
- Trackmania OAuth credentials for display names

### Setup

1. Clone the repository:
```bash
git clone https://github.com/daih27/trackmania-campaign-records-bot.git
cd trackmania-campaign-records-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the project root:
```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id

# Ubisoft/Trackmania Authentication
UBI_EMAIL=your_ubisoft_email
UBI_PASSWORD=your_ubisoft_password

# OAuth for display names
TM_OAUTH_CLIENT_ID=your_oauth_client_id
TM_OAUTH_CLIENT_SECRET=your_oauth_client_secret

# Database path
DB_PATH=./data/trackmania.db

# User agent for API requests
USER_AGENT=App name / @user / user@user.com
```

4. Start the bot:
```bash
npm start
```

## Commands

- `/register <account_id>` - Link your Discord account to your Trackmania account
- `/unregister` - Unlink your account
- `/records` - View your recent records
- `/leaderboard [map] [country]` - View campaign or map leaderboards
- `/weeklyshortsleaderboard [map] [country]` - View weekly shorts leaderboard (overall or specific map)
- `/setcountry <country>` - Set default country for leaderboards (Admin/Mod only)
- `/language <lang>` - Change bot language (Admin/Mod only)
- `/setchannel <channel>` - Set announcement channel for records (Admin/Mod only)
- `/setweeklyshortschannel <channel>` - Set announcement channel for weekly shorts (Admin/Mod only)
- `/help` - Show all available commands

## Acknowledgments

- [Trackmania API](https://webservices.openplanet.dev/) documentation
- The Chilean Trackmania community