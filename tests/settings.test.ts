import { describe, expect, it } from 'vitest';
import { normalizeApiOrigin, SettingsStore } from '../src/settings';

it('removes active profile without selecting another saved router', async () => {
  const values = new Map<string, unknown>();
  const store = new SettingsStore({ get: async key => values.get(key), set: async (key, value) => { values.set(key, value); },
    setMany: async entries => { Object.entries(entries).forEach(([key, value]) => values.set(key, value)); } });
  await store.save({ version: 1, apiOrigin: 'https://router.example', defaultList: 'work' });
  await store.save({ version: 1, apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' });
  await store.remove('http://192.168.1.1:12121/');
  expect(await store.load()).toBeNull();
  expect(await store.connections()).toEqual([{ apiOrigin: 'https://router.example', defaultList: 'work' }]);
});

it('removes only inactive profile and preserves active defaults', async () => {
  const values = new Map<string, unknown>();
  const store = new SettingsStore({ get: async key => values.get(key), set: async (key, value) => { values.set(key, value); },
    setMany: async entries => { Object.entries(entries).forEach(([key, value]) => values.set(key, value)); } });
  await store.save({ version: 1, apiOrigin: 'https://router.example', defaultList: 'work' });
  await store.save({ version: 1, apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' });
  await store.remove('https://router.example');
  expect(await store.load()).toMatchObject({ apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' });
  expect(await store.connections()).toHaveLength(1);
});

it('migrates the active connection and retains separate defaults across LAN and HTTPS switches', async () => {
  const values = new Map<string, unknown>([['settings.v1', { version: 1, apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' }]]);
  const store = new SettingsStore({ get: async (key) => values.get(key), set: async (key, value) => { values.set(key, value); },
    setMany: async entries => { Object.entries(entries).forEach(([key, value]) => values.set(key, value)); } });
  await store.save({ version: 1, apiOrigin: 'https://router.example', defaultList: 'work' });
  expect(await store.connections()).toEqual([
    { apiOrigin: 'https://router.example', defaultList: 'work' },
    { apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' },
  ]);
  await store.save({ version: 1, apiOrigin: 'http://192.168.1.1:12121', defaultList: 'local' });
  expect((await store.connections()).find((c) => c.apiOrigin === 'https://router.example')?.defaultList).toBe('work');
});

describe('normalizeApiOrigin', () => {
  it.each([
    ['http://192.168.1.1:12121/', 'http://192.168.1.1:12121'],
    ['https://keen-pbr.local', 'https://keen-pbr.local'],
    ['http://[fd00::1]:12121/', 'http://[fd00::1]:12121'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeApiOrigin(input)).toBe(expected);
  });

  it.each([
    'ftp://192.168.1.1:12121',
    'http://user:pass@192.168.1.1:12121',
    'http://192.168.1.1:12121/api',
    'http://192.168.1.1:12121/?query=1',
    'http://192.168.1.1:12121/?',
    'http://192.168.1.1:12121/#',
    'not a url',
  ])('rejects %s', (input) => {
    expect(() => normalizeApiOrigin(input)).toThrow();
  });
});

it('persists only the approved versioned settings fields', async () => {
  const values = new Map<string, unknown>();
  const storage = {
    setMany: async (entries: Record<string, unknown>) => { Object.entries(entries).forEach(([key, value]) => values.set(key, value)); },
    get: async (key: string) => values.get(key),
    set: async (key: string, value: unknown) => {
      values.set(key, value);
    },
  };
  const store = new SettingsStore(storage);

  await store.save({
    version: 1,
    apiOrigin: 'http://192.168.1.1:12121/',
    defaultList: 'local',
  });

  expect(values.get('settings.v1')).toEqual({
    version: 1,
    apiOrigin: 'http://192.168.1.1:12121',
    defaultList: 'local',
  });
  await expect(store.load()).resolves.toEqual(values.get('settings.v1'));

  values.set('settings.v1', {
    version: 1,
    apiOrigin: 'javascript:alert(1)',
    defaultList: 'local',
  });
  await expect(store.load()).resolves.toBeNull();
});
