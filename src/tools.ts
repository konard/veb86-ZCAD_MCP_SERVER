import type { CallToolResult, McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { BridgeError } from './errors.js';
import type { ZcadClient } from './zcad-client.js';

async function toolResult(operation: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    const data = await operation();
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
      structuredContent: data,
      ...(data.status === 'error' ? { isError: true } : {}),
    };
  } catch (error) {
    const known = error instanceof BridgeError;
    const data = {
      status: 'error',
      error: {
        code: known ? error.code : 'INTERNAL_ERROR',
        message: known ? error.message : 'Unexpected bridge error',
        ...(known && error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
      },
    };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data, isError: true };
  }
}

export type ToolRegistrar = (server: McpServer, zcad: ZcadClient) => void;

/** Add registrars here or pass them to createMcpServer; transports stay unchanged. */
export const registerZcadTools: ToolRegistrar = (server, zcad) => {
  server.registerTool('zcad_health', {
    description: 'Check GET /ipc availability. This does not prove command execution or drawing readiness.',
    inputSchema: z.strictObject({}),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async (_args, ctx) => toolResult(() => zcad.health(ctx.mcpReq.signal)));

  server.registerTool('zcad_execute', {
    description: 'Forward a registered ZCAD HTTP IPC command and positional JSON args to POST /ipc. '
      + 'ZCAD owns validation and execution. May modify the current drawing. Command availability depends on the ZCAD build. '
      + 'A timeout or cancellation does not prove the command was cancelled; never automatically retry a mutation.',
    inputSchema: z.strictObject({
      command: z.string().regex(/^[A-Z][A-Z0-9_]*$/).max(128),
      args: z.array(z.json()).default([]),
    }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ command, args }, ctx) => toolResult(() => zcad.execute(command, args, ctx.mcpReq.signal)));
};
