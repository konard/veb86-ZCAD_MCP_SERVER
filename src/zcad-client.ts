import { randomUUID } from 'node:crypto';
import * as z from 'zod/v4';
import type { Config } from './config.js';
import { BridgeError } from './errors.js';
import type { HttpAdapter } from './http-adapter.js';

const healthResponse = z.object({ status: z.literal('ok'), message: z.string() });
const commandResponse = z.discriminatedUnion('status', [
  z.object({ id: z.string(), status: z.literal('ok'), result: z.string().optional() }),
  z.object({ id: z.string(), status: z.literal('error'), error: z.string() }),
]);

/** Only translates the existing /ipc contract; execution belongs to ZCAD. */
export class ZcadClient {
  constructor(private readonly http: HttpAdapter, private readonly config: Config['zcad']) {}

  async health(signal: AbortSignal) {
    const parsed = healthResponse.safeParse(await this.http.request('/ipc', { signal }));
    if (!parsed.success) throw new BridgeError('INVALID_RESPONSE', 'Invalid ZCAD availability response');
    return parsed.data;
  }

  async execute(command: string, args: unknown[], signal: AbortSignal) {
    if (this.config.allowedCommands && !this.config.allowedCommands.includes(command)) {
      throw new BridgeError('COMMAND_NOT_ALLOWED', 'Command is not enabled in allowedCommands');
    }
    const id = randomUUID();
    const body = { id, cmd: command, args, ...(this.config.token === undefined ? {} : { token: this.config.token }) };
    const parsed = commandResponse.safeParse(await this.http.request('/ipc', { method: 'POST', body, signal }));
    if (!parsed.success) throw new BridgeError('INVALID_RESPONSE', 'Invalid ZCAD command response envelope');
    // Early dispatcher failures can legitimately have an empty id.
    if (parsed.data.id !== id && !(parsed.data.status === 'error' && parsed.data.id === '')) {
      throw new BridgeError('INVALID_RESPONSE', 'ZCAD response command ID does not match the request');
    }
    return parsed.data;
  }
}
