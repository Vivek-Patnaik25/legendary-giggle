import dotenv from 'dotenv';
dotenv.config();

import { buildApp } from './app.js';
import { getDatabasePath } from './db/schema.js';

const port = parseInt(process.env.PORT || '3001', 10);
const host = process.env.HOST || '0.0.0.0';

const app = buildApp({
  dbPath: getDatabasePath(process.env.DATABASE_URL),
  enableLogging: process.env.NODE_ENV !== 'test',
});

// Graceful shutdown handling
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'Graceful shutdown initiated');
    try {
      await app.close();
      app.log.info('Server closed cleanly');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during graceful shutdown');
      process.exit(1);
    }
  });
}

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  console.log(`Pantry Rescue API replica running at ${address} [PID: ${process.pid}]`);
});
