import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('extension manifest', () => {
  it('uses only the approved required and optional permissions', async () => {
    const json = await readFile('public/manifest.json', 'utf8');
    const manifest = JSON.parse(json) as Record<string, unknown>;

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.version).toBe('0.4.8');
    expect(manifest.permissions).toEqual(['activeTab', 'storage']);
    expect(manifest).not.toHaveProperty('host_permissions');
    expect(manifest.optional_host_permissions).toEqual([
      'http://*/*',
      'https://*/*',
    ]);
    expect(manifest).not.toHaveProperty('content_scripts');
    expect(manifest).not.toHaveProperty('externally_connectable');
  });

  it('declares the branded toolbar and extension icons', async () => {
    const json = await readFile('public/manifest.json', 'utf8');
    const manifest = JSON.parse(json) as {
      icons?: Record<string, string>;
      action?: { default_icon?: Record<string, string> };
    };
    const icons = {
      '16': 'icons/keen-pbr-16.png',
      '32': 'icons/keen-pbr-32.png',
      '48': 'icons/keen-pbr-48.png',
      '128': 'icons/keen-pbr-128.png',
    };

    expect(manifest.icons).toEqual(icons);
    expect(manifest.action?.default_icon).toEqual(icons);
  });

  it.each([16, 32, 48, 128])(
    'ships a valid %dpx PNG icon',
    async (size) => {
      const png = await readFile(`public/icons/keen-pbr-${size}.png`);
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      expect(png.readUInt32BE(16)).toBe(size);
      expect(png.readUInt32BE(20)).toBe(size);
    },
  );

  it('keeps the package prerelease aligned with manifest 0.4.8', async () => {
    const packageJson = JSON.parse(
      await readFile('package.json', 'utf8'),
    ) as { version?: string };
    expect(packageJson.version).toBe('0.4.8-beta.1');
  });

});
