/**
 * Country regions configuration
 * 
 * This file contains the list of regions for each country.
 */

/**
 * Map of country codes to their display names
 */
export const COUNTRY_NAMES = {
  CHI: 'Chile',
};

export const REGIONS = {
  // Chile regions
  CHI: [
    'Aisen',
    'Antofagasta',
    'Araucania',
    'Arica y Parinacota',
    'Atacama',
    'Biobio',
    'Coquimbo',
    'Los Lagos',
    'Los Rios',
    'Magallanes y Antartica',
    'Maule',
    'OHiggins',
    'Santiago',
    'Tarapaca',
    'Valparaiso'
  ],
};

/**
 * Get regions for a specific country
 * @param {string} countryCode - The country code (e.g., 'CHI')
 * @returns {string[]} - Array of regions for the country
 */
export function getRegionsForCountry(countryCode) {
  return REGIONS[countryCode] || [];
}

/**
 * Get display name for a country code
 * @param {string} countryCode - The country code (e.g., 'CHI')
 * @returns {string} - Display name of the country (e.g., 'Chile')
 */
export function getCountryName(countryCode) {
  return COUNTRY_NAMES[countryCode] || countryCode;
}

/**
 * Get all available countries
 * @returns {Array<{name: string, value: string}>} - Array of country choices
 */
export function getAllCountries() {
  return Object.keys(REGIONS).map(code => ({
    name: getCountryName(code),
    value: code
  }));
}
