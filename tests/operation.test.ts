import { expect, it, vi } from 'vitest';
import { KeenPbrApiError } from '../src/api';
import { mutateDomainList } from '../src/operation';
import { makeConfig } from './fixtures/config';

function makeApi() {
  return {
    getConfig: vi.fn().mockResolvedValue({
      config: makeConfig(),
      is_draft: false,
    }),
    stageConfig: vi.fn().mockResolvedValue({ status: 'ok' }),
    saveConfig: vi.fn().mockResolvedValue({
      saved: true,
      applied: true,
      rolled_back: false,
    }),
    getServiceHealth: vi.fn().mockResolvedValue({
      status: 'running',
      config_is_draft: false,
      resolver_config_hash: 'same-hash',
      resolver_config_hash_actual: 'same-hash',
    }),
    getRoutingHealth: vi.fn().mockResolvedValue({ overall: 'ok' }),
    testRouting: vi.fn().mockResolvedValue({ results: [{ ok: true }] }),
  };
}

function immediateTiming() {
  let value = 0;
  return {
    confirmationTimeoutMs: 20_000,
    confirmationDelayMs: 0,
    healthAttempts: 2,
    healthDelayMs: 0,
    now: () => value++,
    sleep: async () => undefined,
  };
}

function confirmationTiming(ticks: number[]) {
  let index = 0;
  return {
    confirmationTimeoutMs: 20_000,
    confirmationDelayMs: 0,
    healthAttempts: 2,
    healthDelayMs: 0,
    now: () => ticks[Math.min(index++, ticks.length - 1)] ?? 0,
    sleep: async () => undefined,
  };
}

it('performs one ordered add transaction and verifies memberships', async () => {
  const api = makeApi();

  await expect(mutateDomainList(api, {
    action: 'add',
    list: 'local',
    domain: 'example.com',
  }, immediateTiming())).resolves.toEqual({
    status: 'applied-and-verified',
    action: 'add',
    list: 'local',
    domain: 'example.com',
    memberships: ['local'],
  });

  expect(api.stageConfig).toHaveBeenCalledTimes(1);
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
  expect(api.stageConfig.mock.invocationCallOrder[0]).toBeLessThan(
    api.saveConfig.mock.invocationCallOrder[0] ?? 0,
  );
});

it('removes only the selected membership and skips routing verification', async () => {
  const api = makeApi();
  const config = makeConfig();
  config.lists.local!.domains = ['alpha.example', 'ai.example'];
  api.getConfig.mockResolvedValue({ config, is_draft: false });

  await expect(mutateDomainList(api, {
    action: 'remove',
    list: 'local',
    domain: 'ai.example',
  }, immediateTiming())).resolves.toEqual({
    status: 'applied-and-verified',
    action: 'remove',
    list: 'local',
    domain: 'ai.example',
    memberships: ['google_ai'],
  });

  expect(api.stageConfig).toHaveBeenCalledTimes(1);
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
  expect(api.testRouting).not.toHaveBeenCalled();
});

it('stops before every write when a draft exists', async () => {
  const api = makeApi();
  api.getConfig.mockResolvedValue({ config: makeConfig(), is_draft: true });

  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toEqual({ status: 'blocked', reason: 'draft' });
  expect(api.stageConfig).not.toHaveBeenCalled();
  expect(api.saveConfig).not.toHaveBeenCalled();
});

it('returns current memberships without writing for unchanged add and remove', async () => {
  const addApi = makeApi();
  await expect(mutateDomainList(addApi, {
    action: 'add', list: 'local', domain: 'alpha.example',
  })).resolves.toEqual({
    status: 'unchanged',
    action: 'add',
    list: 'local',
    domain: 'alpha.example',
    memberships: ['local'],
  });
  expect(addApi.stageConfig).not.toHaveBeenCalled();
  expect(addApi.saveConfig).not.toHaveBeenCalled();

  const removeApi = makeApi();
  await expect(mutateDomainList(removeApi, {
    action: 'remove', list: 'local', domain: 'ai.example',
  })).resolves.toEqual({
    status: 'unchanged',
    action: 'remove',
    list: 'local',
    domain: 'ai.example',
    memberships: ['google_ai'],
  });
  expect(removeApi.stageConfig).not.toHaveBeenCalled();
  expect(removeApi.saveConfig).not.toHaveBeenCalled();
});

it('rejects an invalid list without writing', async () => {
  const api = makeApi();
  await expect(mutateDomainList(api, {
    action: 'add', list: 'remote_domains', domain: 'example.com',
  })).resolves.toEqual({ status: 'blocked', reason: 'invalid-list' });
  expect(api.stageConfig).not.toHaveBeenCalled();
  expect(api.saveConfig).not.toHaveBeenCalled();
});

it('does not save after a stage conflict', async () => {
  const api = makeApi();
  api.stageConfig.mockRejectedValue(
    new KeenPbrApiError('conflict', 'operation in progress', 409),
  );
  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toEqual({
    status: 'failed',
    phase: 'stage',
    writeMayHaveCompleted: false,
    reason: 'conflict',
  });
  expect(api.saveConfig).not.toHaveBeenCalled();
});

it('propagates an uncertain stage result without attempting save', async () => {
  const api = makeApi();
  api.stageConfig.mockRejectedValue(
    new KeenPbrApiError('timeout', 'timed out', undefined, true),
  );
  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toEqual({
    status: 'failed',
    phase: 'stage',
    writeMayHaveCompleted: true,
    reason: 'timeout',
  });
  expect(api.stageConfig).toHaveBeenCalledTimes(1);
  expect(api.saveConfig).not.toHaveBeenCalled();
});

it('reports server rollback as a completed-but-failed write', async () => {
  const api = makeApi();
  api.saveConfig.mockResolvedValue({
    saved: false,
    applied: false,
    rolled_back: true,
  });
  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toEqual({
    status: 'failed',
    phase: 'save',
    writeMayHaveCompleted: true,
    reason: 'rolled-back',
  });
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
});

it('does not claim success when save reports applied=false', async () => {
  const api = makeApi();
  api.saveConfig.mockResolvedValue({
    saved: true,
    applied: false,
    rolled_back: false,
  });
  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toEqual({
    status: 'failed',
    phase: 'save',
    writeMayHaveCompleted: true,
    reason: 'not-applied',
  });
  expect(api.getServiceHealth).not.toHaveBeenCalled();
  expect(api.testRouting).not.toHaveBeenCalled();
});

it('confirms a delayed uncertain add without repeating save', async () => {
  const api = makeApi();
  const applied = makeConfig();
  applied.lists.local!.domains = ['alpha.example', 'example.com'];
  api.getConfig
    .mockResolvedValueOnce({ config: makeConfig(), is_draft: false })
    .mockRejectedValueOnce(new Error('restarting'))
    .mockRejectedValueOnce(new Error('still restarting'))
    .mockResolvedValueOnce({ config: applied, is_draft: false });
  api.saveConfig.mockRejectedValue(
    new KeenPbrApiError('timeout', 'timed out', undefined, true),
  );

  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  }, confirmationTiming([0, 500, 1_000, 1_500]))).resolves.toMatchObject({
    status: 'applied-and-verified',
    memberships: ['local'],
  });
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
});

it('confirms an uncertain remove while preserving other memberships', async () => {
  const initial = makeConfig();
  initial.lists.local!.domains = ['alpha.example', 'ai.example'];
  const applied = makeConfig();
  const api = makeApi();
  api.getConfig
    .mockResolvedValueOnce({ config: initial, is_draft: false })
    .mockResolvedValueOnce({ config: applied, is_draft: false });
  api.saveConfig.mockRejectedValue(
    new KeenPbrApiError('network', 'closed', undefined, true),
  );

  await expect(mutateDomainList(api, {
    action: 'remove', list: 'local', domain: 'ai.example',
  }, confirmationTiming([0, 500]))).resolves.toMatchObject({
    status: 'applied-and-verified',
    memberships: ['google_ai'],
  });
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
  expect(api.testRouting).not.toHaveBeenCalled();
});

it('stops read-only confirmation at 20 seconds without retrying save', async () => {
  const api = makeApi();
  api.getConfig
    .mockResolvedValueOnce({ config: makeConfig(), is_draft: false })
    .mockRejectedValue(new Error('unavailable'));
  api.saveConfig.mockRejectedValue(
    new KeenPbrApiError('timeout', 'timed out', undefined, true),
  );

  await expect(mutateDomainList(api, {
    action: 'add', list: 'local', domain: 'example.com',
  }, confirmationTiming([0, 500, 20_000]))).resolves.toEqual({
    status: 'failed',
    phase: 'save',
    writeMayHaveCompleted: true,
    reason: 'save-outcome-unknown',
  });
  expect(api.saveConfig).toHaveBeenCalledTimes(1);
  expect(api.getConfig).toHaveBeenCalledTimes(2);
  expect(api.getServiceHealth).not.toHaveBeenCalled();
});

it('uses amber outcomes for health and routing uncertainty', async () => {
  const healthApi = makeApi();
  healthApi.getServiceHealth.mockResolvedValue({
    status: 'running',
    config_is_draft: false,
    resolver_config_hash: 'expected-hash',
    resolver_config_hash_actual: 'different-hash',
  });
  await expect(mutateDomainList(healthApi, {
    action: 'add', list: 'local', domain: 'example.com',
  }, immediateTiming())).resolves.toMatchObject({
    status: 'applied-unverified',
    action: 'add',
    memberships: ['local'],
    reason: 'health-not-converged',
  });

  const routingApi = makeApi();
  routingApi.getRoutingHealth.mockResolvedValue({ overall: 'degraded' });
  routingApi.testRouting.mockResolvedValue({ results: [{ ok: false }] });
  await expect(mutateDomainList(routingApi, {
    action: 'add', list: 'local', domain: 'example.com',
  })).resolves.toMatchObject({
    status: 'applied-unverified',
    action: 'add',
    memberships: ['local'],
    reason: 'routing-not-confirmed',
  });
});
