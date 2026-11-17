#!/usr/bin/env node
import { loadConfig } from './config.js';
import { startApplication, type Application } from './application.js';

let app: Application | undefined;
try {
  const config = await loadConfig();
  app = await startApplication(config);
  if (app.url) console.error(`[zcad-mcp] Listening at ${app.url}`);
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    void app!.close().catch(() => {
      console.error('[zcad-mcp] Shutdown failed');
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch {
  // Validation exceptions can contain configuration values; do not expose secrets.
  console.error('[zcad-mcp] Startup failed. Check configuration, Node version and listener port.');
  process.exitCode = 1;
  await app?.close();
}
