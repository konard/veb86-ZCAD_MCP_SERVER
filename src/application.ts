import { createServer } from 'node:http';
import { once } from 'node:events';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { localhostHostValidation, localhostOriginValidation, toNodeHandler } from '@modelcontextprotocol/node';
import type { Config } from './config.js';
import { HttpAdapter } from './http-adapter.js';
import { ZcadClient } from './zcad-client.js';
import { createMcpServer } from './server.js';

export interface Application {
  url?: string;
  close(): Promise<void>;
}

export async function startApplication(config: Config): Promise<Application> {
  const reportError = () => console.error('[zcad-mcp] MCP transport error');
  const http = new HttpAdapter(config.zcad, config.debug ? (message) => console.error(`[zcad-mcp] ${message}`) : undefined);
  const zcad = new ZcadClient(http, config.zcad);
  const factory = () => createMcpServer(zcad);
  if (config.mcp.transport === 'stdio') {
    const handle = serveStdio(factory, { onerror: reportError });
    // The SDK closes the transport on stdin EOF. Also abort outstanding HTTP work.
    const onEnd = () => http.close();
    process.stdin.once('end', onEnd);
    return {
      async close() {
        process.stdin.off('end', onEnd);
        http.close();
        await handle.close();
      },
    };
  }

  const handler = createMcpHandler(factory, { maxRequestBodySize: config.mcp.maxRequestBytes, onerror: reportError });
  const nodeHandler = toNodeHandler(handler, { maxRequestBodySize: config.mcp.maxRequestBytes, onerror: reportError });
  const validHost = localhostHostValidation();
  const validOrigin = localhostOriginValidation();
  let closing = false;
  const listener = createServer((req, res) => {
    if (closing) { res.writeHead(503).end(); return; }
    if (!validHost(req, res) || !validOrigin(req, res)) return;
    if (req.url !== '/mcp') { res.writeHead(404).end(); return; }
    // Normalize Node's optional fields for the SDK's structural request type.
    const request = Object.assign(req, { method: req.method ?? 'GET', url: req.url ?? '/' });
    void nodeHandler(request, res).catch(() => {
      reportError();
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  listener.requestTimeout = config.zcad.timeoutMs + 5000;
  listener.headersTimeout = Math.min(10_000, listener.requestTimeout);
  listener.listen(config.mcp.port, config.mcp.host);
  try {
    await once(listener, 'listening');
  } catch (error) {
    http.close();
    await handler.close();
    throw error;
  }
  const address = listener.address();
  if (!address || typeof address === 'string') throw new Error('Missing MCP listener address');
  const host = address.address.includes(':') ? `[${address.address}]` : address.address;
  let closePromise: Promise<void> | undefined;
  return {
    url: `http://${host}:${address.port}/mcp`,
    close() {
      closePromise ??= (async () => {
        closing = true;
        http.close();
        const stopped = new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
        const timer = setTimeout(() => listener.closeAllConnections(), config.mcp.shutdownTimeoutMs);
        try {
          await handler.close();
          await stopped;
        } finally {
          clearTimeout(timer);
        }
      })();
      return closePromise;
    },
  };
}
