import { getConfig } from '../config.js';
import { createDatabase } from './database.js';

const config = getConfig();
const db = createDatabase(config.databasePath);
db.close();
console.log(`Database initialized at ${config.databasePath}`);
