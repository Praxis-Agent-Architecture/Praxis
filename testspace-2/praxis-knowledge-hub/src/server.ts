import { buildApp } from './app.js';
import { getConfig } from './config.js';

const config = getConfig();
const app = await buildApp({ databasePath: config.databasePath, logger: true });

try {
  await app.listen({ host: config.host, port: config.port });
  app.log.info(`praxis-knowledge-hub listening on http://${config.host}:${config.port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
