import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('release packaging', () => {
  it('defines a verified package command', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.package).toContain('npm run verify');
    expect(pkg.scripts.package).toContain('scripts/package.ps1');
  });

  it('runs the same package command in CI', async () => {
    const workflow = await readFile('.github/workflows/ci.yml', 'utf8');
    expect(workflow).toMatch(/runs-on:\s*windows-latest/);
    expect(workflow).toMatch(/npm ci/);
    expect(workflow).toMatch(/npm run package/);
    expect(workflow).toMatch(/actions\/checkout@v6/);
    expect(workflow).toMatch(/actions\/setup-node@v6/);
    expect(workflow).toMatch(/actions\/upload-artifact@v6/);
  });

  it('keeps generated release files out of Git', async () => {
    const ignore = await readFile('.gitignore', 'utf8');
    expect(ignore).toMatch(/^release\/$/m);
  });

  it('packages only built extension files and removes source maps', async () => {
    const script = await readFile('scripts/package.ps1', 'utf8');
    expect(script).toMatch(/dist/);
    expect(script).toMatch(/manifest\.json/);
    expect(script).toMatch(/Filter '\*\.map'/);
    expect(script).not.toMatch(/node_modules/);
  });
});
