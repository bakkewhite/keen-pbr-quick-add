import { afterEach, describe, expect, it } from 'vitest';
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const fixtures: string[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(path => rm(path, {recursive:true,force:true}))); });
async function fixture(manifestVersion = '4.7.2') {
  const root = await mkdtemp(join(tmpdir(), 'pbr-package-test-')); fixtures.push(root);
  await mkdir(join(root, 'scripts')); await mkdir(join(root, 'dist', 'icons'), {recursive:true});
  await copyFile('scripts/package.ps1', join(root, 'scripts', 'package.ps1'));
  await writeFile(join(root, 'package.json'), JSON.stringify({version:'4.7.2-beta.1'}));
  await writeFile(join(root, 'dist', 'manifest.json'), JSON.stringify({version:manifestVersion}));
  await writeFile(join(root, 'dist', 'popup.js'), '/* fictional fixture */');
  await writeFile(join(root, 'dist', 'popup.js.map'), '{}');
  await writeFile(join(root, 'dist', 'icons', 'icon.svg.map'), '{}');
  await writeFile(join(root, 'LICENSE'), 'Fixture project license');
  await writeFile(join(root, 'dist', 'icons', 'LICENSE.txt'), 'Fixture icon license');
  return root;
}
function run(root: string, version?: string) {
  return spawnSync('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File',
    join(root, 'scripts', 'package.ps1'), ...(version ? ['-Version',version] : [])], {encoding:'utf8',timeout:20000});
}
describe('real release packaging', () => {
  it('derives the archive name from package metadata, includes licenses and omits nested maps', async () => {
    const root = await fixture(); const result = run(root);
    expect(result.status, result.stderr).toBe(0);
    expect(await readdir(join(root, 'release'))).toEqual(['keen-pbr-quick-add-v4.7.2-beta.1.zip']);
    const zip = join(root, 'release', 'keen-pbr-quick-add-v4.7.2-beta.1.zip').replace(/'/g, "''");
    const entries = spawnSync('powershell', ['-NoProfile','-Command',
      `Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead('${zip}'); try { @($z.Entries | ForEach-Object { $_.FullName.Replace('\\','/') }) | ConvertTo-Json -Compress } finally { $z.Dispose() }`], {encoding:'utf8'});
    expect(entries.status, entries.stderr).toBe(0);
    const names = JSON.parse(entries.stdout) as string[];
    expect(names).toContain('manifest.json'); expect(names).toContain('LICENSE');
    expect(names).toContain('icons/LICENSE.txt');
    expect(names.some(name => name.endsWith('.map'))).toBe(false);
    expect(names.some(name => name.includes('src/') || name.includes('node_modules/'))).toBe(false);
  }, 30000);
  it.each(['4.7.1', '../escape'])('rejects an override (%s) that differs from package metadata before writes', async version => {
    const root = await fixture(); const result = run(root, version);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Version must match package.json');
    expect(await readdir(root)).not.toContain('release');
  }, 30000);
  it('rejects stale built manifest versions before modifying existing artifacts', async () => {
    const root = await fixture('4.7.1'); const result = run(root);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('manifest version does not match package.json');
    expect(await readdir(root)).not.toContain('release');
  }, 30000);
});
