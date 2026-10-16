import Database from 'better-sqlite3';
import { initDatabase, getDatabasePath } from './schema.js';

let dbInstance: Database.Database | null = null;

export function getDb(customPath?: string): Database.Database {
  if (!dbInstance) {
    dbInstance = initDatabase(customPath);
  }
  return dbInstance;
}

export function resetDbForTesting(customPath?: string): Database.Database {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
  }
  dbInstance = initDatabase(customPath || ':memory:');
  return dbInstance;
}

export { initDatabase, getDatabasePath };
