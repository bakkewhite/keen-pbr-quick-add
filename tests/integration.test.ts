import { afterEach, expect, it } from 'vitest';
import { KeenPbrClient } from '../src/api';
import type { KeenPbrConfig } from '../src/keen-pbr-types';
import { mutateDomainList } from '../src/operation';
import { makeConfig } from './fixtures/config';
import { createMockKeenPbrServer } from './helpers/mock-keen-pbr-server';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

it('runs the complete stage, save, health, and routing flow', async () => {
  let activeConfig = makeConfig();
  let draftConfig: KeenPbrConfig | null = null;
  const server = await createMockKeenPbrServer((request) => {
    const key = request.method + ' ' + request.path;
    if (key === 'GET /api/config') {
      return {
        body: { config: structuredClone(activeConfig), is_draft: false },
      };
    }
    if (key === 'POST /api/config') {
      if (!request.body || typeof request.body !== 'object') {
        return { status: 400, body: { error: 'Validation failed' } };
      }
      draftConfig = structuredClone(request.body) as KeenPbrConfig;
      return { body: { status: 'ok', message: 'Config staged' } };
    }
    if (key === 'POST /api/config/save') {
      if (!draftConfig) {
        return { status: 400, body: { error: 'No staged config' } };
      }
      activeConfig = draftConfig;
      draftConfig = null;
      return {
        body: { saved: true, applied: true, rolled_back: false },
      };
    }
    if (key === 'GET /api/health/service') {
      return {
        body: {
          version: '3.1.1',
          status: 'running',
          config_is_draft: false,
          resolver_config_hash: 'same-hash',
          resolver_config_hash_actual: 'same-hash',
        },
      };
    }
    if (key === 'GET /api/health/routing') {
      return { body: { overall: 'ok' } };
    }
    if (key === 'POST /api/routing/test') {
      return { body: { results: [{ ok: true }] } };
    }
    return { status: 404, body: { error: 'Not found' } };
  });
  closers.push(server.close);

  const outcome = await mutateDomainList(
    new KeenPbrClient(server.origin),
    { action: 'add', list: 'local', domain: 'example.com' },
    {
      confirmationTimeoutMs: 20_000,
      confirmationDelayMs: 0,
      healthAttempts: 1,
      healthDelayMs: 0,
      now: () => 0,
      sleep: async () => undefined,
    },
  );

  expect(outcome).toEqual({
    status: 'applied-and-verified',
    action: 'add',
    list: 'local',
    domain: 'example.com',
    memberships: ['local'],
  });
  expect(activeConfig.lists.local?.domains).toEqual([
    'alpha.example',
    'example.com',
  ]);
  expect(server.requests.map(
    ({ method, path }) => method + ' ' + path,
  )).toEqual([
    'GET /api/config',
    'POST /api/config',
    'POST /api/config/save',
    'GET /api/health/service',
    'GET /api/health/routing',
    'POST /api/routing/test',
  ]);
});

it('never saves after stage validation fails', async () => {
  const server = await createMockKeenPbrServer((request) => {
    const key = request.method + ' ' + request.path;
    if (key === 'GET /api/config') {
      return { body: { config: makeConfig(), is_draft: false } };
    }
    if (key === 'POST /api/config') {
      return { status: 400, body: { error: 'Validation failed' } };
    }
    return { status: 500, body: { error: 'Unexpected request' } };
  });
  closers.push(server.close);

  await expect(mutateDomainList(
    new KeenPbrClient(server.origin),
    { action: 'add', list: 'local', domain: 'example.com' },
  )).resolves.toEqual({
    status: 'failed',
    phase: 'stage',
    writeMayHaveCompleted: false,
    reason: 'http',
  });
  expect(server.requests.some(
    ({ method, path }) => method === 'POST' && path === '/api/config/save',
  )).toBe(false);
});
