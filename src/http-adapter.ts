import type { Config } from './config.js';
import { BridgeError } from './errors.js';

export interface HttpRequest {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

/** JSON transport only: no ZCAD command names, envelope or drawing logic. */
export class HttpAdapter {
  private readonly shutdown = new AbortController();

  constructor(
    private readonly config: Config['zcad'],
    private readonly debug: (message: string) => void = () => {},
  ) {}

  close(): void {
    this.shutdown.abort();
  }

  async request(path: string, options: HttpRequest = {}): Promise<unknown> {
    if (this.shutdown.signal.aborted) throw new BridgeError('SHUTTING_DOWN', 'HTTP adapter is closed');
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
      throw new BridgeError('INVALID_REQUEST', 'Expected an absolute route on the configured HTTP server');
    }
    const url = new URL(path, this.config.baseUrl);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, value);
    const body = options.body === undefined ? undefined : JSON.stringify(options.body);
    if (body !== undefined && Buffer.byteLength(body) > this.config.maxRequestBytes) {
      throw new BridgeError('REQUEST_TOO_LARGE', 'HTTP request exceeds maxRequestBytes');
    }
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), this.config.timeoutMs);
    const signal = AbortSignal.any([
      deadline.signal, this.shutdown.signal, ...(options.signal ? [options.signal] : []),
    ]);
    const headers = new Headers(this.config.headers);
    headers.set('accept', 'application/json');
    if (body !== undefined) headers.set('content-type', 'application/json');
    const method = options.method ?? (body === undefined ? 'GET' : 'POST');
    const started = Date.now();
    // Do not log headers, bodies, tokens, results or URL query parameters.
    this.debug(`HTTP ${method} ${url.pathname} started`);
    try {
      const response = await fetch(url, {
        method, headers, signal, redirect: 'error',
        ...(body === undefined ? {} : { body }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new BridgeError('HTTP_ERROR', `HTTP server returned ${response.status}`, response.status);
      }
      const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
        await response.body?.cancel();
        throw new BridgeError('INVALID_RESPONSE', 'HTTP server did not return a JSON content type');
      }
      const length = response.headers.get('content-length');
      if (length && Number(length) > this.config.maxResponseBytes) {
        await response.body?.cancel();
        throw new BridgeError('RESPONSE_TOO_LARGE', 'HTTP response exceeds maxResponseBytes');
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader) {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > this.config.maxResponseBytes) {
              await reader.cancel();
              throw new BridgeError('RESPONSE_TOO_LARGE', 'HTTP response exceeds maxResponseBytes');
            }
            chunks.push(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
      }
      this.debug(`HTTP ${method} ${url.pathname} ${response.status}, ${size} bytes, ${Date.now() - started} ms`);
      try {
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size)));
      } catch {
        throw new BridgeError('INVALID_RESPONSE', 'HTTP server returned invalid UTF-8 or JSON');
      }
    } catch (error) {
      if (error instanceof BridgeError) throw error;
      if (deadline.signal.aborted) {
        throw new BridgeError('TIMEOUT', `HTTP request exceeded ${this.config.timeoutMs} ms; command outcome may be unknown. Do not automatically retry mutations.`);
      }
      if (signal.aborted) throw new BridgeError('CANCELLED', 'HTTP request cancelled; an already queued ZCAD command may still execute');
      throw new BridgeError('CONNECTION_ERROR', 'Cannot complete the HTTP request to the configured ZCAD server');
    } finally {
      clearTimeout(timer);
    }
  }
}
