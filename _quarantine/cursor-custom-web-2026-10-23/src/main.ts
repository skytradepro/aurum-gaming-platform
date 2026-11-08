/**
 * Website entry point:  node --env-file-if-exists=../../.env src/main.ts
 * The API must be running (API_INTERNAL_URL). See docs/SETUP.md.
 */
import { loadWebConfig } from './config.ts';
import { createLogger, errorFields } from './log.ts';
import { webRoutes } from './routes.ts';
import { createWebServer } from './server.ts';

const config = loadWebConfig();
const logger = createLogger(config.logLevel);
const web = createWebServer({ config, routes: webRoutes, logger });
const address = await web.listen();
logger.info('website listening', { ...address, publicOrigin: config.publicOrigin, api: config.apiUrl, env: config.env });

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info('shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  try {
    await web.close();
    process.exit(0);
  } catch (error) {
    logger.error('shutdown failed', errorFields(error));
    process.exit(1);
  }
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', errorFields(reason)));
