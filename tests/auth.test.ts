import { expect, it, vi } from 'vitest';
import { AuthStore, basicAuthorization } from '../src/auth';

function fakeArea() {
  const data = new Map<string, unknown>();
  return {
    data,
    get: vi.fn(async (key: string) => data.get(key)),
    set: vi.fn(async (key: string, value: unknown) => { data.set(key, value); }),
    remove: vi.fn(async (key: string) => { data.delete(key); }),
    restrict: vi.fn(async () => undefined),
  };
}

it('encodes admin and a Unicode password as UTF-8 Basic credentials', () => {
  expect(basicAuthorization(' pаss🔒 ')).toBe(
    'Basic YWRtaW46IHDQsHNz8J+UkiA=',
  );
});

it('keeps a non-remembered credential out of persistent storage and forgets it', async () => {
  const session = fakeArea();
  const local = fakeArea();
  const store = new AuthStore(session, local);
  const origin = 'http://192.168.1.1:12121';

  await store.save(origin, 'Basic YWRtaW46dGVzdA==', false, true);
  expect((await store.get(origin))?.authorization).toBe('Basic YWRtaW46dGVzdA==');
  expect(await store.mode(origin)).toBe('session');
  expect(local.data.size).toBe(0);
  expect(session.restrict).toHaveBeenCalledOnce();
  expect(local.restrict).toHaveBeenCalledOnce();

  await store.forget(origin);
  expect(await store.get(origin)).toBeNull();
});

it('persists only an explicitly remembered credential and isolates origins', async () => {
  const session = fakeArea();
  const local = fakeArea();
  const store = new AuthStore(session, local);
  await store.save('https://router.example:12121', 'Basic YWRtaW46b25l', true, false);
  expect(await store.mode('https://router.example:12121')).toBe('local');
  expect((await store.get('https://router.example:12122'))).toBeNull();
  expect(session.data.size).toBe(0);
  expect(local.data.size).toBe(1);
});

it('does not re-expose a credential after a failed forget', async () => {
  const session = fakeArea();
  const local = fakeArea();
  const store = new AuthStore(session, local);
  const origin = 'http://192.168.1.1:12121';
  await store.save(origin, 'Basic YWRtaW46dGVzdA==', true, true);
  local.remove.mockRejectedValueOnce(new Error('disk error'));
  await expect(store.forget(origin)).rejects.toThrow('disk error');
  expect(await store.get(origin)).toBeNull();
});

it('does not let a delayed 401 erase a newer login with the same password', async () => {
  const store = new AuthStore(fakeArea(), fakeArea());
  const origin = 'https://router.example:12121';
  await store.save(origin, 'Basic YWRtaW46dGVzdA==', false, false);
  const first = await store.get(origin);
  expect(first?.id).toEqual(expect.any(String));
  await store.save(origin, 'Basic YWRtaW46dGVzdA==', false, false);
  expect((await store.get(origin))?.id).not.toBe(first?.id);
  expect(await store.forgetIfMatching(origin, first!.id)).toBe(false);
  expect(await store.mode(origin)).toBe('session');
});

it('does not restore a pending login after Forget', async () => {
  const store = new AuthStore(fakeArea(), fakeArea());
  const origin = 'http://192.168.1.1:12121';
  const generation = store.generation(origin);
  await store.forget(origin);
  await expect(store.save(
    origin, 'Basic YWRtaW46dGVzdA==', false, true, generation,
  )).rejects.toThrow();
  expect(await store.get(origin)).toBeNull();
});

it('fails closed if Chrome cannot restrict credential storage', async () => {
  const session = fakeArea();
  const local = fakeArea();
  session.restrict.mockRejectedValue(new Error('not supported'));
  const store = new AuthStore(session, local);
  await expect(store.save(
    'https://router.example:12121', 'Basic YWRtaW46dGVzdA==', false, false,
  )).rejects.toThrow();
  expect(session.data.size).toBe(0);
  expect(local.data.size).toBe(0);
});

it('does not keep using an old password when replacing it cannot be saved', async () => {
  const session = fakeArea();
  const local = fakeArea();
  const store = new AuthStore(session, local);
  const origin = 'https://router.example:12121';
  await store.save(origin, 'Basic YWRtaW46b2xk', false, false);
  local.set.mockImplementationOnce(async (key, value) => {
    local.data.set(key, value);
    throw new Error('disk full');
  });
  await expect(store.save(origin, 'Basic YWRtaW46bmV3', true, false))
    .rejects.toThrow('disk full');
  expect(await store.get(origin)).toBeNull();
});
