import { createServer } from 'node:http';
import { once } from 'node:events';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { configSchema } from '../dist/config.js';
import { startApplication } from '../dist/application.js';

export function json(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

export async function fixture(t, handler = (_req, res) => json(res, { status: 'ok', message: 'ZCAD HTTP server is available' })) {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => res.destroy(error));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

export async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function config(baseUrl, overrides = {}) {
  return configSchema.parse({
    zcad: { baseUrl, timeoutMs: 500, ...overrides.zcad },
    mcp: { transport: 'streamable-http', port: 0, shutdownTimeoutMs: 100, ...overrides.mcp },
  });
}

export async function connect(t, cfg, mode = 'legacy') {
  const app = await startApplication(cfg);
  t.after(() => app.close());
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { versionNegotiation: { mode } });
  t.after(() => client.close());
  await client.connect(new StreamableHTTPClientTransport(new URL(app.url)), { timeout: 2000 });
  return { client, app };
}

export function data(result) {
  return result.structuredContent ?? JSON.parse(result.content[0].text);
}
