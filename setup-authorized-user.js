#!/usr/bin/env node

/**
 * Setup script to add the first authorized user for global settings management
 * Usage: node setup-authorized-user.js [discord-user-id]
 */

import { initDatabase, addAuthorizedUser } from './src/db.js';

async function setupAuthorizedUser() {
    const userId = process.argv[2];
    
    if (!userId) {
        console.error('Usage: node setup-authorized-user.js [discord-user-id]');
        console.error('Example: node setup-authorized-user.js 123456789012345678');
        process.exit(1);
    }
    
    if (!/^\d{17,19}$/.test(userId)) {
        console.error('Invalid Discord user ID format. Must be 17-19 digits.');
        process.exit(1);
    }
    
    try {
        console.log('Initializing database...');
        await initDatabase();
        
        console.log(`Adding user ${userId} as authorized user...`);
        const result = await addAuthorizedUser(userId);
        
        if (result) {
            console.log(`✅ Successfully authorized user ${userId}`);
            console.log('They can now use the following commands:');
            console.log('  - /setcampaignsearchtime');
            console.log('  - /setweeklyshortssearchtime');
            console.log('  - /authorizeuser');
            console.log('  - /unauthorizeuser');
        } else {
            console.error('❌ Failed to authorize user');
        }
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

setupAuthorizedUser();