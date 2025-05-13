import dotenv from 'dotenv';

dotenv.config();

/**
 * Record checking configuration
 * These values control how often the bot checks for new Trackmania records
 */
// How often to check for new records
export const RECORD_CHECK_INTERVAL = 15 * 60 * 1000;

// How long to wait after bot startup before performing the first record check (default: 5 seconds)
export const INITIAL_RECORD_CHECK_DELAY = 5000;

/**
 * API endpoint URLs for Ubisoft and Nadeo authentication services
 */
export const UBI_AUTH_URL = 'https://public-ubiservices.ubi.com/v3/profiles/sessions';
export const NADEO_AUTH_URL = 'https://prod.trackmania.core.nadeo.online/v2/authentication/token/ubiservices';

/**
 * User agent string used for API requests
 * Identifies the bot to Trackmania API servers
 */
export const USER_AGENT = process.env.USER_AGENT;

/**
 * Authentication credentials loaded from environment variables
 */
export const discordToken = process.env.DISCORD_TOKEN;
export const discordClientId = process.env.DISCORD_CLIENT_ID;
export const ubiEmail = process.env.UBI_EMAIL;
export const ubiPassword = process.env.UBI_PASSWORD;
export const tmOAuthClientId = process.env.TM_OAUTH_CLIENT_ID;
export const tmOAuthClientSecret = process.env.TM_OAUTH_CLIENT_SECRET;

/**
 * Rate limiting configuration to prevent API abuse
 * Minimum interval between API requests in milliseconds
 */
export const MIN_REQUEST_INTERVAL = 800;

/**
 * Trackmania icon URL for Discord embeds
 */
export const TRACKMANIA_ICON_URL = 'https://www.trackmania.com/build/images/tm-logo.9b809b61.png';

/**
 * Region configuration for country filtering
 * Imported from separate regions configuration file
 */
export { REGIONS } from './config/regions.js';

/**
 * Validates required environment variables are present
 * Exits the process if critical variables are missing
 */
if (!discordToken || !ubiEmail || !ubiPassword) {
    console.error('Missing required environment variables. Please check your .env file.');
    process.exit(1);
}

/**
 * Validates optional OAuth configuration
 * OAuth is used for fetching player display names from Trackmania API
 */
if (tmOAuthClientId && tmOAuthClientSecret) {
    console.log('OAuth credentials configured for display name retrieval');
} else {
    console.warn('OAuth credentials not configured. Display names will not be available.');
}