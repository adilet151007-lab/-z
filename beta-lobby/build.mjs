import {readdir, readFile, access,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {GAME_ORIGIN} from './public/lobby-config.js';

const publicDirectory = new URL('./public/', import.meta.url);
await copyFile(new URL('../room-layout.js',import.meta.url),new URL('room-layout.js',publicDirectory));
const allowed = ['index.html','mobile-preview.html','lobby-privacy.html','lobby.css','lumi.css','lumi.js','lobby.js','lobby-core.js','lobby-config.js','lobby-copy.js','lobby-account.js','lobby-platform.js','lobby-creators.js','lobby-creator-tools.js','lobby-designer.js','room-layout.js','creators.html','mark.svg','ornament.svg'];
const actual = await readdir(publicDirectory);
if (actual.length !== allowed.length || actual.some(name => !allowed.includes(name))) throw new Error('Publish directory contains unexpected files');
for (const name of allowed.filter(name => name.endsWith('.js'))) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(name, publicDirectory))], {encoding:'utf8'});
  if (result.status !== 0) throw new Error(result.stderr);
}
for (const page of allowed.filter(name => name.endsWith('.html'))) {
const html = await readFile(new URL(page, publicDirectory), 'utf8');
for (const [, value] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (value === './' || value.startsWith('#')) continue;
  if (value === '/auth/google') continue;
  if (value.startsWith('https:')) {
    if (new URL(value).origin !== GAME_ORIGIN) throw new Error('Unexpected external destination');
  } else {
    if (!allowed.includes(value)) throw new Error('Unexpected local asset: '+value);
    await access(new URL(value, publicDirectory));
  }
}
}
for (const file of allowed.filter(name => name.endsWith('.js'))) {
  const source = await readFile(new URL(file, publicDirectory), 'utf8');
  for (const [, value] of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (!value.startsWith('./') || !allowed.includes(value.slice(2))) throw new Error('Unexpected module dependency');
  }
}
console.log('Lobby ready: '+allowed.length+' public files; static build needs no game database.');
