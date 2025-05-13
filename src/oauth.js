import axios from 'axios';
import { log } from './utils.js';

const OAUTH_BASE_URL = 'https://api.trackmania.com';
let oauthTokenCache = {
    accessToken: null,
    expiresAt: null
};

/**
 * Gets an OAuth access token using the Client Credentials flow
 * Used for machine-to-machine authentication with the Trackmania API
 * Implements token caching to minimize API calls
 * @returns {Promise<string>} OAuth access token
 * @throws {Error} If OAuth credentials are not configured
 */
export async function getOAuthAccessToken() {
    try {
        if (oauthTokenCache.accessToken && oauthTokenCache.expiresAt > Date.now()) {
            log('Using cached OAuth access token');
            return oauthTokenCache.accessToken;
        }

        const { tmOAuthClientId, tmOAuthClientSecret } = await import('./config.js');
        
        if (!tmOAuthClientId || !tmOAuthClientSecret) {
            throw new Error('OAuth credentials not configured');
        }

        log('Getting new OAuth access token...');
        
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: tmOAuthClientId,
            client_secret: tmOAuthClientSecret
        });

        const response = await axios.post(
            `${OAUTH_BASE_URL}/api/access_token`,
            params.toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        oauthTokenCache.accessToken = response.data.access_token;
        oauthTokenCache.expiresAt = Date.now() + (response.data.expires_in * 1000) - 60000;

        log('Successfully obtained OAuth access token');
        return oauthTokenCache.accessToken;
    } catch (error) {
        log(`Error getting OAuth access token: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Retrieves display names for given account IDs from the Trackmania API
 * @param {string[]} accountIds - Array of account IDs to retrieve names for
 * @returns {Promise<Object>} Mapping of account IDs to display names
 * @throws {Error} If OAuth authentication fails or API request fails
 */
export async function getDisplayNames(accountIds) {
    try {
        if (!accountIds || accountIds.length === 0) {
            return {};
        }

        const accessToken = await getOAuthAccessToken();

        const queryParams = accountIds.map(id => `accountId[]=${encodeURIComponent(id)}`).join('&');
        const url = `${OAUTH_BASE_URL}/api/display-names?${queryParams}`;

        log(`Fetching display names for ${accountIds.length} account(s)`);

        const response = await axios.get(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        log(`Successfully retrieved display names`);
        return response.data;
    } catch (error) {
        log(`Error getting display names: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Batch fetches display names with API limit handling (50 IDs per request)
 * Splits large requests into smaller batches with delays to avoid rate limiting
 * @param {string[]} accountIds - Array of account IDs to retrieve names for
 * @returns {Promise<Object>} Mapping of all account IDs to display names
 * @throws {Error} If batch fetching fails
 */
export async function getDisplayNamesBatch(accountIds) {
    try {
        if (!accountIds || accountIds.length === 0) {
            return {};
        }

        const batchSize = 50;
        const results = {};

        for (let i = 0; i < accountIds.length; i += batchSize) {
            const batch = accountIds.slice(i, i + batchSize);
            const batchResults = await getDisplayNames(batch);
            Object.assign(results, batchResults);
            
            if (i + batchSize < accountIds.length) {
                await new Promise(resolve => setTimeout(resolve, 250));
            }
        }

        return results;
    } catch (error) {
        log(`Error in batch display name fetch: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Invalidates the OAuth token cache to force re-authentication
 * Called when API returns authentication errors
 */
export function invalidateOAuthToken() {
    log('Invalidating OAuth token cache');
    oauthTokenCache.accessToken = null;
    oauthTokenCache.expiresAt = null;
}