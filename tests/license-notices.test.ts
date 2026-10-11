import { afterEach, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyNotices } from '../scripts/license-notices.mjs';

let root: string;
afterEach(async () => { if (root) await rm(root, {recursive:true,force:true}); });
it('preserves the complete dependency license, not just its SPDX identifier', async () => {
  root = await mkdtemp(join(tmpdir(), 'pbr-license-test-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({name:'fictional-package',version:'1.2.3',license:'MIT'}));
  await writeFile(join(root, 'LICENSE.txt'), 'Copyright Fixture Author\nPermission notice and conditions\n');
  const text = await dependencyNotices([root]);
  expect(text).toContain('fictional-package 1.2.3 (MIT)');
  expect(text).toContain('Copyright Fixture Author\nPermission notice and conditions\n');
});
it('stops packaging if a bundled dependency has no license text', async () => {
  root = await mkdtemp(join(tmpdir(), 'pbr-license-test-'));
  await writeFile(join(root, 'package.json'), JSON.stringify({name:'missing-notice',version:'1.0.0',license:'MIT'}));
  await mkdir(join(root, 'dist'));
  await expect(dependencyNotices([root])).rejects.toThrow('Missing license text: missing-notice');
});
