import { readFile } from 'node:fs/promises';
import * as z from 'zod/v4';

const positiveInt = z.number().int().min(1).max(2_147_483_647);
const baseUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/'
    && !url.search && !url.hash && !url.username && !url.password;
}, 'Expected an HTTP(S) origin, including port, without credentials, path or query');

const zcadSchema = z.strictObject({
  baseUrl: baseUrl.default('http://127.0.0.1:5000'),
  timeoutMs: positiveInt.default(35_000),
  maxResponseBytes: positiveInt.default(8 * 1024 * 1024),
  maxRequestBytes: positiveInt.default(1024 * 1024),
  headers: z.record(z.string(), z.string()).default({}),
  token: z.string().optional(),
  allowedCommands: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
});
const mcpSchema = z.strictObject({
  transport: z.enum(['stdio', 'streamable-http']).default('stdio'),
  host: z.enum(['127.0.0.1', 'localhost', '::1']).default('127.0.0.1'),
  port: z.number().int().min(0).max(65535).default(3000),
  maxRequestBytes: positiveInt.default(1024 * 1024),
  shutdownTimeoutMs: positiveInt.default(5000),
});
export const configSchema = z.strictObject({
  zcad: zcadSchema.prefault({}),
  mcp: mcpSchema.prefault({}),
  debug: z.boolean().default(false),
});
export type Config = z.infer<typeof configSchema>;

/** Defaults < JSON file < environment. Unknown keys fail instead of hiding typos. */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  let file: unknown = {};
  if (env.ZCAD_MCP_CONFIG) {
    file = JSON.parse(await readFile(env.ZCAD_MCP_CONFIG, 'utf8'));
  }
  const config = configSchema.parse(file);
  const numeric = (key: string, target: Record<string, unknown>, field: string) => {
    if (env[key] !== undefined) {
      target[field] = /^\d+$/.test(env[key]!) ? Number(env[key]) : NaN;
    }
  };
  if (env.ZCAD_HTTP_URL !== undefined) config.zcad.baseUrl = env.ZCAD_HTTP_URL;
  if (env.ZCAD_HTTP_TOKEN !== undefined) config.zcad.token = env.ZCAD_HTTP_TOKEN;
  if (env.ZCAD_HTTP_HEADERS !== undefined) config.zcad.headers = JSON.parse(env.ZCAD_HTTP_HEADERS);
  if (env.ZCAD_ALLOWED_COMMANDS !== undefined) {
    config.zcad.allowedCommands = JSON.parse(env.ZCAD_ALLOWED_COMMANDS);
  }
  if (env.MCP_TRANSPORT !== undefined) {
    config.mcp.transport = env.MCP_TRANSPORT as Config['mcp']['transport'];
  }
  if (env.MCP_HTTP_HOST !== undefined) config.mcp.host = env.MCP_HTTP_HOST as Config['mcp']['host'];
  numeric('ZCAD_HTTP_TIMEOUT_MS', config.zcad, 'timeoutMs');
  numeric('ZCAD_HTTP_MAX_RESPONSE_BYTES', config.zcad, 'maxResponseBytes');
  numeric('ZCAD_HTTP_MAX_REQUEST_BYTES', config.zcad, 'maxRequestBytes');
  numeric('MCP_HTTP_PORT', config.mcp, 'port');
  numeric('MCP_MAX_REQUEST_BYTES', config.mcp, 'maxRequestBytes');
  numeric('MCP_SHUTDOWN_TIMEOUT_MS', config.mcp, 'shutdownTimeoutMs');
  if (env.ZCAD_MCP_DEBUG !== undefined) {
    if (!['true', 'false'].includes(env.ZCAD_MCP_DEBUG)) throw new Error('ZCAD_MCP_DEBUG must be true or false');
    config.debug = env.ZCAD_MCP_DEBUG === 'true';
  }
  const validated = configSchema.parse(config);
  // Validate header syntax at startup, before a tool is ever called.
  new Headers(validated.zcad.headers);
  return validated;
}
