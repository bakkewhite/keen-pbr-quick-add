import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeenPbrApiError, KeenPbrClient } from '../src/api';
import { createMockKeenPbrServer } from './helpers/mock-keen-pbr-server';

const closers: Array<() => Promise<void>> = [];

it('public auth-status denial is a gateway problem, not a keen-pbr password request', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
  const client = new KeenPbrClient('https://router.example', fetchImpl);
  await expect(client.getAuthStatus()).rejects.toMatchObject({ kind: 'gateway-auth', status: 401 });
});

it('checks the public auth contract without sending a stored password', async () => {
  const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ enabled: true, authenticated: false })));
  const credential = vi.fn().mockResolvedValue('Basic secret');
  const client = new KeenPbrClient('https://router.example', fetchImpl, 7000, credential);
  expect(await client.getAuthStatus()).toEqual({ enabled: true });
  expect(credential).not.toHaveBeenCalled();
  expect(new Headers(fetchImpl.mock.calls[0]?.[1].headers).has('authorization')).toBe(false);
});

it('distinguishes a proxy login page and preserves the native API credential', async () => {
  const onUnauthorized = vi.fn();
  const fetchImpl = vi.fn().mockResolvedValue(new Response('<html>Sign in</html>', { status: 401, headers: { 'content-type': 'text/html' } }));
  const client = new KeenPbrClient('https://router.example', fetchImpl, 7000, async () => ({ authorization: 'Basic fake', id: 'test' }), onUnauthorized);
  await expect(client.getConfig()).rejects.toMatchObject({ kind: 'gateway-auth', status: 401 });
  expect(onUnauthorized).not.toHaveBeenCalled();
});

it.each(['denied', 'disabled', 'unreachable'])('preserves credentials when public auth status is %s after protected JSON 401', async (status) => {
  const onUnauthorized = vi.fn();
  const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 401 }));
  if (status === 'denied') fetchImpl.mockResolvedValueOnce(new Response('{}', { status: 401 }));
  else if (status === 'disabled') fetchImpl.mockResolvedValueOnce(new Response(JSON.stringify({ enabled: false, authenticated: false })));
  else fetchImpl.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const client = new KeenPbrClient('https://router.example', fetchImpl, 7000, async () => ({ authorization: 'Basic fake', id: 'test' }), onUnauthorized);
  await expect(client.getConfig()).rejects.toMatchObject({ kind: status === 'unreachable' ? 'network' : 'gateway-auth' });
  expect(onUnauthorized).not.toHaveBeenCalled();
  expect(new Headers(fetchImpl.mock.calls[1]?.[1].headers).has('authorization')).toBe(false);
});
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe('KeenPbrClient', () => {
  it('sends explicit Authorization on protected GET and JSON POST without browser credentials', async () => {
    const requests: RequestInit[] = [];
    const fetchImpl: typeof fetch = vi.fn(async (_input, init) => {
      requests.push(init ?? {});
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
    });
    const client = new KeenPbrClient(
      'http://127.0.0.1:12122', fetchImpl, 7000,
      async () => 'Basic YWRtaW46dGVzdA==',
    );
    await client.getServiceHealth();
    await client.stageConfig({ lists: {}, route: { rules: [] } });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(new Headers(request.headers).get('authorization'))
        .toBe('Basic YWRtaW46dGVzdA==');
      expect(request.credentials).toBe('omit');
      expect(request.redirect).toBe('error');
    }
    expect(new Headers(requests[1]?.headers).get('content-type'))
      .toBe('application/json');
  });

  it('invalidates only the credential used by a 401 response, not on 403', async () => {
    const onUnauthorized = vi.fn().mockResolvedValue(undefined);
    const fetchImpl: typeof fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ enabled: true, authenticated: false })))
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));
    const client = new KeenPbrClient(
      'https://router.example:12121', fetchImpl, 7000,
      async () => ({ authorization: 'Basic YWRtaW46dGVzdA==', id: 'credential-1' }),
      onUnauthorized,
    );
    await expect(client.getServiceHealth()).rejects.toMatchObject({ status: 401 });
    await expect(client.getServiceHealth()).rejects.toMatchObject({ status: 403 });
    expect(onUnauthorized).toHaveBeenCalledExactlyOnceWith({
      authorization: 'Basic YWRtaW46dGVzdA==', id: 'credential-1',
    });
  });
  it('sends the config object, not the GET envelope, when staging', async () => {
    const server = await createMockKeenPbrServer(() => ({
      body: { status: 'ok', message: 'Config staged in memory' },
    }));
    closers.push(server.close);
    const client = new KeenPbrClient(server.origin);
    const config = { lists: {}, route: { rules: [] } };

    await client.stageConfig(config);

    expect(server.requests).toEqual([{
      method: 'POST',
      path: '/api/config',
      body: config,
    }]);
  });

  it('maps 409 to a typed conflict without retrying', async () => {
    const server = await createMockKeenPbrServer(() => ({
      status: 409,
      body: { error: 'operation in progress' },
    }));
    closers.push(server.close);
    const client = new KeenPbrClient(server.origin);

    await expect(client.saveConfig()).rejects.toMatchObject({
      kind: 'conflict',
      status: 409,
    } satisfies Partial<KeenPbrApiError>);
    expect(server.requests).toHaveLength(1);
  });

  it('uses only the documented fixed paths and bodies', async () => {
    const server = await createMockKeenPbrServer((request) => {
      const replies: Record<string, unknown> = {
        'GET /api/config': {
          config: { lists: {}, route: { rules: [] } },
          is_draft: false,
        },
        'POST /api/config/save': {
          saved: true,
          applied: true,
          rolled_back: false,
        },
        'POST /api/routing/test': { results: [{ ok: true }] },
        'GET /api/health/service': { status: 'running' },
        'GET /api/health/routing': { overall: 'ok' },
      };
      return { body: replies[request.method + ' ' + request.path] };
    });
    closers.push(server.close);
    const client = new KeenPbrClient(server.origin);

    await client.getConfig();
    await client.saveConfig();
    await client.testRouting('example.com');
    await client.getServiceHealth();
    await client.getRoutingHealth();

    expect(server.requests).toEqual([
      { method: 'GET', path: '/api/config', body: null },
      { method: 'POST', path: '/api/config/save', body: null },
      {
        method: 'POST',
        path: '/api/routing/test',
        body: { target: 'example.com' },
      },
      { method: 'GET', path: '/api/health/service', body: null },
      { method: 'GET', path: '/api/health/routing', body: null },
    ]);
  });

  it.each([401, 403])('maps HTTP %s to auth', async (status) => {
    const server = await createMockKeenPbrServer(() => ({
      status,
      body: { error: 'authorization required' },
    }));
    closers.push(server.close);
    await expect(
      new KeenPbrClient(server.origin).getConfig(),
    ).rejects.toMatchObject({ kind: 'auth', status });
    expect(server.requests).toHaveLength(1);
  });

  it('never sends browser credentials or follows an API redirect', async () => {
    const fetchImpl: typeof fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({
        config: { lists: {}, route: { rules: [] } },
        is_draft: false,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    await new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).getConfig();
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:12122/api/config',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      }),
    );
  });

  it('invokes fetch with the global scope required by WorkerGlobalScope', async () => {
    const fetchImpl = function (this: unknown): Promise<Response> {
      if (this !== globalThis) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'WorkerGlobalScope': Illegal invocation",
        );
      }
      return Promise.resolve(new Response(JSON.stringify({
        status: 'running',
        version: '3.1.1',
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    } as typeof fetch;

    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).getServiceHealth(),
    ).resolves.toMatchObject({ status: 'running', version: '3.1.1' });
  });

  it('maps invalid JSON to protocol without echoing the response', async () => {
    const fetchImpl: typeof fetch = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).getConfig(),
    ).rejects.toMatchObject({ kind: 'protocol' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('marks an invalid save response as a potentially completed write', async () => {
    const fetchImpl: typeof fetch = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).saveConfig(),
    ).rejects.toMatchObject({
      kind: 'protocol',
      writeMayHaveCompleted: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('marks a network failure during stage as a potentially completed write', async () => {
    const fetchImpl: typeof fetch = vi.fn().mockRejectedValue(
      new TypeError('fetch failed'),
    );
    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).stageConfig({
        lists: {},
        route: { rules: [] },
      }),
    ).rejects.toMatchObject({
      kind: 'network',
      writeMayHaveCompleted: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('keeps a bounded diagnostic for a rejected browser fetch', async () => {
    const fetchImpl: typeof fetch = vi.fn().mockRejectedValue(
      new TypeError('Failed to fetch'),
    );

    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl).getServiceHealth(),
    ).rejects.toMatchObject({
      kind: 'network',
      diagnostic: 'TypeError: Failed to fetch',
    });
  });

  it('aborts once and marks a timed-out stage as potentially completed', async () => {
    const fetchImpl: typeof fetch = vi.fn((_input, init) => (
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(init.signal?.reason ?? new DOMException(
            'The operation was aborted',
            'AbortError',
          ));
        }, { once: true });
      })
    ));
    await expect(
      new KeenPbrClient('http://127.0.0.1:12122', fetchImpl, 5).stageConfig({
        lists: {},
        route: { rules: [] },
      }),
    ).rejects.toMatchObject({
      kind: 'timeout',
      writeMayHaveCompleted: true,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
