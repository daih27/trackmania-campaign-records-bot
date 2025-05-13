import { getDb } from '../db.js';
import { log } from '../utils.js';
import en from './en.js';
import es from './es.js';

// Available languages
const languages = {
    en,
    es
};

const DEFAULT_LANGUAGE = 'en';
const guildLanguageCache = new Map();

/**
 * Get translation strings for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Object} Translation strings
 */
export async function getTranslations(guildId) {
    // If no guild ID is provided, return default language
    if (!guildId) {
        return languages[DEFAULT_LANGUAGE];
    }

    if (guildLanguageCache.has(guildId)) {
        const langCode = guildLanguageCache.get(guildId);
        return languages[langCode] || languages[DEFAULT_LANGUAGE];
    }

    try {
        const db = await getDb();
        const guild = await db.get('SELECT language FROM guild_settings WHERE guild_id = ?', guildId);

        let langCode = DEFAULT_LANGUAGE;
        if (guild && guild.language) {
            langCode = guild.language;
        }

        guildLanguageCache.set(guildId, langCode);
        return languages[langCode] || languages[DEFAULT_LANGUAGE];
    } catch (error) {
        log(`Error getting language for guild ${guildId}: ${error.message}`, 'error');
        return languages[DEFAULT_LANGUAGE];
    }
}

/**
 * Set language for a guild
 * @param {string} guildId - Discord guild ID
 * @param {string} language - Language code (e.g., 'en', 'es')
 * @returns {boolean} Success status
 */
export async function setLanguage(guildId, language) {
    if (!guildId || !languages[language]) {
        return false;
    }

    try {
        const db = await getDb();
        const exists = await db.get('SELECT 1 FROM guild_settings WHERE guild_id = ?', guildId);

        if (exists) {
            await db.run('UPDATE guild_settings SET language = ? WHERE guild_id = ?', [language, guildId]);
        } else {
            await db.run('INSERT INTO guild_settings (guild_id, language) VALUES (?, ?)', [guildId, language]);
        }

        guildLanguageCache.set(guildId, language);
        return true;
    } catch (error) {
        log(`Error setting language for guild ${guildId}: ${error.message}`, 'error');
        return false;
    }
}

/**
 * Get available languages
 * @returns {Object} Available languages with their names
 */
export function getAvailableLanguages() {
    return {
        en: 'English',
        es: 'Español'
    };
}

/**
 * Get the current language code for a guild
 * @param {string} guildId - Discord guild ID
 * @returns {Promise<string>} Language code
 */
export async function getCurrentLanguage(guildId) {
    if (guildLanguageCache.has(guildId)) {
        return guildLanguageCache.get(guildId);
    }

    try {
        const db = await getDb();
        const guild = await db.get('SELECT language FROM guild_settings WHERE guild_id = ?', guildId);

        let langCode = DEFAULT_LANGUAGE;
        if (guild && guild.language) {
            langCode = guild.language;
        }

        guildLanguageCache.set(guildId, langCode);
        return langCode;
    } catch (error) {
        log(`Error getting current language for guild ${guildId}: ${error.message}`, 'error');
        return DEFAULT_LANGUAGE;
    }
}

/**
 * Clear language cache for a guild
 * @param {string} guildId - Discord guild ID 
 */
export function clearLanguageCache(guildId) {
    if (guildId) {
        guildLanguageCache.delete(guildId);
    } else {
        guildLanguageCache.clear();
    }
}

/**
 * Format a translation string with variables
 * @param {string} str - Translation string with placeholders
 * @param {Object} vars - Variables to insert
 * @returns {string} Formatted string
 */
export function formatString(str, vars = {}) {
    return str.replace(/{([^{}]*)}/g, (match, key) => {
        return typeof vars[key] !== 'undefined' ? vars[key] : match;
    });
}
