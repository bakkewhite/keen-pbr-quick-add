import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { dependencyNotices } from './license-notices.mjs';

const dist = new URL('../dist/', import.meta.url);
const publicDir = new URL('../public/', import.meta.url);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(publicDir, dist, { recursive: true });

// One-shot compiler only; the extension does not need a file watcher/dev server.
const stylesheet = await postcss([tailwindcss({ optimize: true })]).process(
  await readFile(new URL('popup.css', publicDir), 'utf8'),
  { from: 'public/popup.css', to: 'dist/popup.css' },
);
await writeFile(new URL('popup.css', dist), stylesheet.css);

const result = await build({
  entryPoints: {
    background: 'src/background.ts',
    popup: 'src/popup.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  outdir: 'dist',
  entryNames: '[name]',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  sourcemap: true,
  metafile: true,
  logLevel: 'info',
});

const packages = ['node_modules/@heroui/styles', 'node_modules/tailwindcss'];
const bundledInputs = new Set(Object.values(result.metafile.outputs)
  .flatMap(output => Object.entries(output.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([input]) => input)));
for (const input of bundledInputs) {
  const start = input.lastIndexOf('node_modules/');
  if (start < 0) continue;
  const parts = input.slice(start + 'node_modules/'.length).split('/');
  packages.push(input.slice(0, start) + 'node_modules/' + parts.slice(0, parts[0].startsWith('@') ? 2 : 1).join('/'));
}
await writeFile(new URL('THIRD-PARTY-NOTICES.txt', dist), await dependencyNotices(packages));
