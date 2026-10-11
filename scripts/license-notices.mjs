import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Keep complete license texts for the packages actually bundled in the release. */
export async function dependencyNotices(packageDirectories) {
  const notices = [];
  for (const directory of [...new Set(packageDirectories)].sort()) {
    const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const licenses = (await readdir(directory)).filter(name => /^licen[cs]e(?:[._-]|$)/i.test(name)).sort();
    if (!licenses.length) throw new Error(`Missing license text: ${pkg.name}`);
    const texts = await Promise.all(licenses.map(name => readFile(join(directory, name), 'utf8')));
    notices.push(`${pkg.name} ${pkg.version} (${pkg.license ?? 'see license text'})\n${texts.join('\n')}`);
  }
  return 'Third-party software bundled with keen-pbr Quick Add\n\n' + notices.join('\n\n---\n\n');
}
