import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { KeenPbrClient } from '../src/api';
import { mutateDomainList } from '../src/operation';

const children: ChildProcess[] = [];
afterEach(async () => {
  await Promise.all(children.splice(0).map(child => new Promise<void>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill();
  })));
});

async function startFixture() {
  const child = spawn(process.execPath, ['scripts/mock-api.mjs'], {
    env: { ...process.env, KEEN_PBR_MOCK_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  return new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Reviewer API did not start')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Reviewer API exited: ' + output)); });
    child.stderr?.on('data', chunk => { output += String(chunk); });
    child.stdout?.on('data', chunk => {
      output += String(chunk);
      const origin = /Mock keen-pbr API: (http:\/\/127\.0\.0\.1:\d+)/.exec(output)?.[1];
      if (origin) { clearTimeout(timer); resolve(origin); }
    });
  });
}

describe('standalone reviewer API', () => {
  it('supports the real client connection check without a password', async () => {
    const origin = await startFixture();
    const api = new KeenPbrClient(origin);
    expect(await api.getAuthStatus()).toEqual({ enabled: false });
    expect((await api.getServiceHealth()).version).toMatch(/^3\.\d+\.\d+/);
    expect((await api.getConfig()).config.lists.local?.domains).toContain('alpha.example');
  });

  it('rejects malformed JSON without taking down the reviewer API', async () => {
    const origin = await startFixture();
    const response = await fetch(origin + '/api/config', { method: 'POST', body: '{' });
    expect(response.status).toBe(400);
    expect((await new KeenPbrClient(origin).getConfig()).is_draft).toBe(false);
  });

  it('supports the reviewer add/remove round trip with the real client', async () => {
    const api = new KeenPbrClient(await startFixture());
    const before = (await api.getConfig()).config;
    await expect(mutateDomainList(api, { action: 'add', list: 'local', domain: 'example.com' }))
      .resolves.toMatchObject({ status: 'applied-and-verified', memberships: ['local'] });
    expect((await api.getConfig()).config.lists.local?.domains).toContain('example.com');
    await expect(mutateDomainList(api, { action: 'remove', list: 'local', domain: 'example.com' }))
      .resolves.toMatchObject({ status: 'applied-and-verified', memberships: [] });
    expect((await api.getConfig()).config).toEqual(before);
  });
});
