import { expect, it, vi } from 'vitest';
import {
  ensureHostPermission,
  toHostPattern,
} from '../src/permissions';

it('keeps the configured port in the requested match pattern', () => {
  expect(toHostPattern('http://192.168.1.1:12121')).toBe(
    'http://192.168.1.1:12121/*',
  );
});

it('requests permission only when it is absent', async () => {
  const port = {
    contains: vi.fn().mockResolvedValue(false),
    request: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
  };

  await expect(
    ensureHostPermission(port, 'http://192.168.1.1:12121'),
  ).resolves.toBe(true);
  expect(port.request).toHaveBeenCalledWith('http://192.168.1.1:12121/*');
});

it('does not prompt when permission already exists', async () => {
  const port = {
    contains: vi.fn().mockResolvedValue(true),
    request: vi.fn(),
    remove: vi.fn(),
  };
  await expect(
    ensureHostPermission(port, 'http://192.168.1.1:12121'),
  ).resolves.toBe(true);
  expect(port.request).not.toHaveBeenCalled();
});
