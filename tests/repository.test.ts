import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const requiredFiles = [
  'README.md',
  'README.ru.md',
  'LICENSE',
  'PRIVACY.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
] as const;

describe('public repository contract', () => {
  it('ships public project documents', async () => {
    for (const file of requiredFiles) {
      await expect(access(file)).resolves.toBeUndefined();
    }
  });

  it('links the English and Russian guides to each other first', async () => {
    const english = await readFile('README.md', 'utf8');
    const russian = await readFile('README.ru.md', 'utf8');
    expect(english.split('\n').find((line) => line.trim())?.trim()).toBe(
      '[Русская версия](README.ru.md)',
    );
    expect(russian.split('\n').find((line) => line.trim())?.trim()).toBe(
      '[English version](README.md)',
    );
  });

  it('documents unpacked installation and keeps API details in the developer guide', async () => {
    const english = await readFile('README.md', 'utf8');
    const russian = await readFile('README.ru.md', 'utf8');
    for (const text of [english, russian]) {
      expect(text).toMatch(/Developer Mode|Режим разработчика/);
      expect(text).not.toMatch(/REST API has no independent login/i);
      expect(text).not.toMatch(
        /initially\s+`?http:\/\/192\.168\.1\.1:12121/i,
      );
      expect(text).not.toMatch(/Обновить вкладку/);
    }
    const developerGuide = await readFile('CONTRIBUTING.md', 'utf8');
    expect(developerGuide).toMatch(/401|403/);
    expect(developerGuide).toMatch(/Basic/);
    expect(developerGuide).toMatch(/Bearer/);
  });

  it('states independent beta status and GPL license', async () => {
    const readme = await readFile('README.md', 'utf8');
    const license = await readFile('LICENSE', 'utf8');
    expect(readme).toMatch(/independent.*unofficial/i);
    expect(license).toMatch(/GNU GENERAL PUBLIC LICENSE/);
    expect(license).toMatch(/Version 3, 29 June 2007/);
  });

  it('declares the npm package metadata without making it publishable', async () => {
    const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
      private?: boolean;
      description?: string;
      license?: string;
    };
    expect(pkg.private).toBe(true);
    expect(pkg.description).toBe(
      'Quickly add or remove the active site domain in keen-pbr lists.',
    );
    expect(pkg.license).toBe('GPL-3.0');
  });
});
