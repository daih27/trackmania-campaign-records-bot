import { makeRateLimitedRequest } from '../api.js';
import { ensureToken } from '../auth.js';
import { log } from '../utils.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ZONES_API_URL = 'https://prod.trackmania.core.nadeo.online/zones/';
const CACHE_FILE = path.join(__dirname, '../../cache/zones.json');
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

let zonesCache = null;

/**
 * Fetches all zones from the Nadeo API
 * @returns {Promise<Array>} Array of zone objects
 */
async function fetchZonesFromAPI() {
    try {
        const token = await ensureToken('NadeoServices');

        const response = await makeRateLimitedRequest({
            method: 'get',
            url: ZONES_API_URL,
            headers: {
                'Authorization': `nadeo_v1 t=${token}`,
                'Content-Type': 'application/json'
            }
        });

        log(`Fetched ${response.data.length} zones from API`);
        return response.data;
    } catch (error) {
        log(`Error fetching zones from API: ${error.message}`, 'error');
        throw error;
    }
}

/**
 * Loads zones from cache file
 * @returns {Promise<Object|null>} Cached zones data or null if cache is invalid
 */
async function loadCachedZones() {
    try {
        await fs.access(CACHE_FILE);
        const data = await fs.readFile(CACHE_FILE, 'utf8');
        const cached = JSON.parse(data);

        if (cached.timestamp && Date.now() - cached.timestamp < CACHE_DURATION) {
            log('Loaded zones from cache');
            return cached;
        }
    } catch (error) {
    }
    return null;
}

/**
 * Saves zones to cache file
 * @param {Array} zones - Array of zone objects to cache
 */
async function saveCachedZones(zones) {
    try {
        const cacheDir = path.dirname(CACHE_FILE);
        await fs.mkdir(cacheDir, { recursive: true });

        const cacheData = {
            timestamp: Date.now(),
            zones: zones
        };

        await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
        log('Saved zones to cache');
    } catch (error) {
        log(`Error saving zones to cache: ${error.message}`, 'error');
    }
}

/**
 * Gets all available zones, using cache if available
 * @returns {Promise<Array>} Array of zone objects
 */
async function getAllZones() {
    if (zonesCache) {
        return zonesCache;
    }

    const cached = await loadCachedZones();
    if (cached) {
        zonesCache = cached.zones;
        return zonesCache;
    }

    const zones = await fetchZonesFromAPI();
    await saveCachedZones(zones);
    zonesCache = zones;
    return zones;
}

/**
 * Builds a hierarchical zone tree from flat zone array
 * @param {Array} zones - Array of zone objects
 * @returns {Object} Hierarchical zone tree
 */
function buildZoneTree(zones) {
    const tree = {};
    const zoneMap = {};

    zones.forEach(zone => {
        zoneMap[zone.zoneId] = { ...zone, children: [] };
    });

    zones.forEach(zone => {
        if (zone.parentId && zoneMap[zone.parentId]) {
            zoneMap[zone.parentId].children.push(zoneMap[zone.zoneId]);
        } else if (!zone.parentId) {
            tree[zone.zoneId] = zoneMap[zone.zoneId];
        }
    });

    return tree;
}

/**
 * Gets all countries (zones that represent countries)
 * Countries are typically at a specific level in the zone hierarchy
 * @returns {Promise<Array>} Array of country zones
 */
export async function getCountries() {
    const zones = await getAllZones();
    const tree = buildZoneTree(zones);

    const countries = [];

    const worldZone = Object.values(tree).find(zone => zone.name === 'World');
    if (worldZone && worldZone.children) {
        worldZone.children.forEach(continent => {
            if (continent.children) {
                continent.children.forEach(country => {
                    countries.push({
                        id: country.zoneId,
                        name: country.name,
                        parentId: country.parentId,
                        icon: country.icon
                    });
                });
            }
        });
    }

    countries.sort((a, b) => a.name.localeCompare(b.name));

    return countries;
}

/**
 * Gets regions for a specific country
 * @param {string} countryId - Zone ID of the country
 * @returns {Promise<Array>} Array of region zones
 */
export async function getRegionsForCountry(countryId) {
    const zones = await getAllZones();
    const country = zones.find(z => z.zoneId === countryId);

    if (!country) {
        return [];
    }

    const regions = zones.filter(z => z.parentId === countryId);

    regions.sort((a, b) => a.name.localeCompare(b.name));

    return regions.map(region => ({
        id: region.zoneId,
        name: region.name,
        icon: region.icon
    }));
}

/**
 * Find a country by name (case-insensitive partial match)
 * @param {string} name - Country name to search for
 * @returns {Promise<Object|null>} Country zone object or null
 */
export async function findCountryByName(name) {
    const countries = await getCountries();
    const searchName = name.toLowerCase();

    return countries.find(country =>
        country.name.toLowerCase().includes(searchName)
    );
}

/**
 * Clears the zone cache to force refresh from API
 */
export async function clearZoneCache() {
    zonesCache = null;
    try {
        await fs.unlink(CACHE_FILE);
        log('Cleared zone cache');
    } catch (error) {
    }
}

/**
 * Get display name for a zone
 * @param {string} zoneId - The zone ID
 * @returns {Promise<string>} - Display name of the zone
 */
export async function getZoneName(zoneId) {
    const zones = await getAllZones();
    const zone = zones.find(z => z.zoneId === zoneId);
    return zone ? zone.name : zoneId;
}

/**
 * Get all available countries formatted for Discord choices
 * @returns {Promise<Array>} Array of country choices {name, value}
 */
export async function getAvailableCountries() {
    const countries = await getCountries();
    const choices = [
        { name: '🌍 World', value: 'world' },
        ...countries.map(country => ({
            name: country.name,
            value: country.id
        }))
    ];
    return choices;
}

/**
 * Gets all zone names for filtering leaderboards (includes country and its regions)
 * @param {string} countryId - Zone ID of the country
 * @returns {Promise<Set>} Set of zone names including the country and all its regions
 */
export async function getZoneNamesForCountry(countryId) {
    const zones = await getAllZones();
    const country = zones.find(z => z.zoneId === countryId);

    if (!country) {
        return new Set();
    }

    const zoneNames = new Set([country.name]);
    const regions = zones.filter(z => z.parentId === countryId);
    regions.forEach(region => {
        zoneNames.add(region.name);
    });

    regions.forEach(region => {
        const subRegions = zones.filter(z => z.parentId === region.zoneId);
        subRegions.forEach(subRegion => {
            zoneNames.add(subRegion.name);
        });
    });

    return zoneNames;
}
