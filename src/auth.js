import { makeRateLimitedRequest } from './api.js';
import { UBI_AUTH_URL, NADEO_AUTH_URL, USER_AGENT, ubiEmail, ubiPassword } from './config.js';
import { log } from './utils.js';

const tokenCache = {
    NadeoServices: { accessToken: null, refreshToken: null, expiry: null },
    NadeoLiveServices: { accessToken: null, refreshToken: null, expiry: null }
};

/**
 * Authenticates with Ubisoft services to obtain an authentication ticket
 * Uses basic auth with email/password credentials from environment variables
 * @returns {Promise<string>} Ubisoft authentication ticket
 */
export async function getUbisoftTicket() {
    log('Getting Ubisoft authentication ticket');
    const credentials = Buffer.from(`${ubiEmail}:${ubiPassword}`).toString('base64');
    const res = await makeRateLimitedRequest({
        method: 'post',
        url: UBI_AUTH_URL,
        data: {},
        headers: {
            'Content-Type': 'application/json',
            'Ubi-AppId': '86263886-327a-4328-ac69-527f0d20a237',
            'Authorization': `Basic ${credentials}`,
            'User-Agent': USER_AGENT
        }
    });

    log('Successfully obtained Ubisoft ticket');
    return res.data.ticket;
}

/**
 * Exchanges a Ubisoft ticket for a Nadeo authentication token
 * Supports different audiences (NadeoServices, NadeoLiveServices)
 * Handles token caching and automatic refresh when possible
 * @param {string} audience - Token audience ('NadeoServices' or 'NadeoLiveServices')
 * @returns {Promise<string>} Nadeo access token
 */
export async function getNadeoToken(audience = 'NadeoLiveServices') {
    try {
        log(`Getting ${audience} token...`);

        if (tokenCache[audience].refreshToken && tokenCache[audience].expiry > Date.now()) {
            try {
                log(`Attempting to refresh ${audience} token...`);
                const res = await makeRateLimitedRequest({
                    method: 'post',
                    url: 'https://prod.trackmania.core.nadeo.online/v2/authentication/token/refresh',
                    data: { refreshToken: tokenCache[audience].refreshToken },
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': USER_AGENT
                    }
                });

                tokenCache[audience].accessToken = res.data.accessToken;
                tokenCache[audience].refreshToken = res.data.refreshToken;
                tokenCache[audience].expiry = Date.now() + 3600000;

                log(`Successfully refreshed ${audience} token`);
                return res.data.accessToken;
            } catch (refreshError) {
                log(`Refresh token failed for ${audience}, getting new token...`, 'warn');
            }
        }

        const ticket = await getUbisoftTicket();

        const res = await makeRateLimitedRequest({
            method: 'post',
            url: NADEO_AUTH_URL,
            data: { audience },
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `ubi_v1 t=${ticket}`,
                'User-Agent': USER_AGENT
            }
        });

        tokenCache[audience].accessToken = res.data.accessToken;
        tokenCache[audience].refreshToken = res.data.refreshToken;
        tokenCache[audience].expiry = Date.now() + 3600000;

        log(`Successfully obtained new ${audience} token`);
        return res.data.accessToken;
    } catch (error) {
        log(`Error getting ${audience} token: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Ensures a valid authentication token is available for the specified audience
 * Checks cache first, then obtains a new token if necessary
 * @param {string} audience - Token audience ('NadeoServices' or 'NadeoLiveServices')
 * @returns {Promise<string>} Valid access token
 */
export async function ensureToken(audience = 'NadeoLiveServices') {
    if (!tokenCache[audience].accessToken || tokenCache[audience].expiry <= Date.now()) {
        return await getNadeoToken(audience);
    }
    return tokenCache[audience].accessToken;
}

/**
 * Invalidates all cached authentication tokens to force re-authentication
 * Used when API returns 401 unauthorized errors
 */
export function invalidateTokens() {
    log('Invalidating all authentication tokens', 'warn');

    Object.keys(tokenCache).forEach(audience => {
        tokenCache[audience].accessToken = null;
        tokenCache[audience].expiry = null;
    });
}