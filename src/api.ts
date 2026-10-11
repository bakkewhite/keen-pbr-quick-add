import type { ConfigEnvelope, KeenPbrConfig } from './keen-pbr-types';

export type ApiErrorKind =
  | 'auth'
  | 'conflict'
  | 'http'
  | 'network'
  | 'protocol'
  | 'gateway-auth'
  | 'timeout';

export class KeenPbrApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly writeMayHaveCompleted = false,
    readonly diagnostic?: string,
  ) {
    super(message);
  }
}

function diagnosticFor(error: unknown): string {
  const value = error instanceof Error
    ? error.name + ': ' + error.message
    : typeof error;
  return value.replace(/[\r\n]/g, ' ').slice(0, 160);
}

export interface ServiceHealth {
  status?: string;
  runtime_state?: string;
  config_is_draft?: boolean;
  resolver_config_hash?: string;
  resolver_config_hash_actual?: string;
  version?: string;
  [key: string]: unknown;
}

export interface SaveResponse {
  saved: boolean;
  applied: boolean;
  rolled_back: boolean;
  [key: string]: unknown;
}

export interface RoutingHealth {
  overall?: string;
  [key: string]: unknown;
}

export interface RoutingTest {
  results?: Array<{ ok?: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface RequestAuthorization {
  authorization: string;
  id?: string;
}

function record(
  value: unknown,
  writeMayHaveCompleted = false,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new KeenPbrApiError(
      'protocol',
      'keen-pbr returned an invalid payload',
      undefined,
      writeMayHaveCompleted,
    );
  }
  return value as Record<string, unknown>;
}

function configEnvelope(value: unknown): ConfigEnvelope {
  const envelope = record(value);
  const config = record(envelope.config);
  if (
    typeof envelope.is_draft !== 'boolean'
    || !config.lists
    || typeof config.lists !== 'object'
    || Array.isArray(config.lists)
  ) {
    throw new KeenPbrApiError('protocol', 'keen-pbr returned an invalid config');
  }
  return {
    config: config as unknown as KeenPbrConfig,
    is_draft: envelope.is_draft,
  };
}

function saveResponse(value: unknown): SaveResponse {
  const response = record(value, true);
  if (
    typeof response.saved !== 'boolean'
    || typeof response.applied !== 'boolean'
    || typeof response.rolled_back !== 'boolean'
  ) {
    throw new KeenPbrApiError(
      'protocol',
      'keen-pbr returned an invalid save result',
      undefined,
      true,
    );
  }
  return response as unknown as SaveResponse;
}

export class KeenPbrClient {
  constructor(
    private readonly origin: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 7000,
    private readonly authorization?: () => Promise<string | RequestAuthorization | null>,
    private readonly onUnauthorized?: (credential: RequestAuthorization) => Promise<void>,
  ) {}

  private async call<T>(
    path: string,
    init: RequestInit,
    writeMayHaveCompleted = false,
    publicRequest = false,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const request: RequestInit = {
        ...init,
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      };
      const headers = new Headers(init.headers);
      if (init.body) headers.set('content-type', 'application/json');
      const authSource = publicRequest ? null : await this.authorization?.();
      const credential = typeof authSource === 'string'
        ? { authorization: authSource }
        : authSource;
      if (credential) headers.set('authorization', credential.authorization);
      if ([...headers.keys()].length > 0) request.headers = headers;
      const response = await this.fetchImpl.call(
        globalThis,
        this.origin + path,
        request,
      );
      if (response.headers.get('content-type')?.includes('text/html')) {
        throw new KeenPbrApiError('gateway-auth', 'The address returned a web page instead of the API', response.status, writeMayHaveCompleted);
      }
      if (!response.ok) {
        // This endpoint is public in keen-pbr; an outer access gate denied it.
        if (publicRequest && response.status === 401) {
          throw new KeenPbrApiError('gateway-auth', 'The public API is behind an authentication gate', 401);
        }
        if (response.status === 401 && credential && this.onUnauthorized) {
          // A plain/JSON 401 can also come from KeenDNS or a reverse proxy.
          // Verify the native public contract before invalidating a saved secret.
          if (!(await this.getAuthStatus()).enabled) {
            throw new KeenPbrApiError('gateway-auth', 'Native API authentication is disabled but the address denied access', 401);
          }
          try {
            await this.onUnauthorized(credential);
          } catch {
            // Preserve the server's 401; the store blocks a failed deletion.
          }
        }
        const kind = response.status === 401 || response.status === 403
          ? 'auth'
          : response.status === 409 ? 'conflict' : 'http';
        const uncertain = writeMayHaveCompleted && response.status >= 500;
        throw new KeenPbrApiError(
          kind,
          'keen-pbr request failed',
          response.status,
          uncertain,
        );
      }
      try {
        return await response.json() as T;
      } catch {
        throw new KeenPbrApiError(
          'protocol',
          'keen-pbr returned invalid JSON',
          undefined,
          writeMayHaveCompleted,
        );
      }
    } catch (error) {
      if (error instanceof KeenPbrApiError) throw error;
      if (controller.signal.aborted) {
        throw new KeenPbrApiError(
          'timeout',
          'keen-pbr request timed out',
          undefined,
          writeMayHaveCompleted,
          diagnosticFor(error),
        );
      }
      throw new KeenPbrApiError(
        'network',
        'keen-pbr is unreachable',
        undefined,
        writeMayHaveCompleted,
        diagnosticFor(error),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  getServiceHealth(): Promise<ServiceHealth> {
    return this.call('/api/health/service', { method: 'GET' });
  }

  async getAuthStatus(): Promise<{ enabled: boolean }> {
    const value = record(await this.call('/api/auth/status', { method: 'GET' }, false, true));
    if (typeof value.enabled !== 'boolean' || typeof value.authenticated !== 'boolean') {
      throw new KeenPbrApiError('protocol', 'Unknown API authentication contract');
    }
    return { enabled: value.enabled };
  }

  getRoutingHealth(): Promise<RoutingHealth> {
    return this.call('/api/health/routing', { method: 'GET' });
  }

  async getConfig(): Promise<ConfigEnvelope> {
    return configEnvelope(await this.call<unknown>(
      '/api/config',
      { method: 'GET' },
    ));
  }

  async stageConfig(config: KeenPbrConfig): Promise<Record<string, unknown>> {
    return record(await this.call<unknown>('/api/config', {
      method: 'POST',
      body: JSON.stringify(config),
    }, true), true);
  }

  async saveConfig(): Promise<SaveResponse> {
    return saveResponse(await this.call<unknown>(
      '/api/config/save',
      { method: 'POST' },
      true,
    ));
  }

  testRouting(target: string): Promise<RoutingTest> {
    return this.call('/api/routing/test', {
      method: 'POST',
      body: JSON.stringify({ target }),
    });
  }
}
