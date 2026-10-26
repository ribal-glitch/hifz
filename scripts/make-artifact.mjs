// Fügt den Build der Link-Version zu einer einzigen Seite zusammen (dist-artifact/hifz.html).
// Die Quran-Daten bleiben als eigene Dateien (dist-artifact/data/) und werden mitveröffentlicht.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-artifact');
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const js = /<script type="module" crossorigin src="\.\/(assets\/[^"]+\.js)"><\/script>/.exec(html)?.[1];
const css = /<link rel="stylesheet" crossorigin href="\.\/(assets\/[^"]+\.css)">/.exec(html)?.[1];
if (!js || !css) throw new Error('Build-Dateien nicht gefunden');
const jsText = readFileSync(join(dir, js), 'utf8').replace(/<\/script/gi, '<\\/script');
const cssText = readFileSync(join(dir, css), 'utf8').replace(/<\/style/gi, '<\\/style');
const page = `<title>Hifz</title>
<meta name="theme-color" content="#f1f1f0">
<style>${cssText}</style>
<div id="root"></div>
<script type="module">${jsText}</script>
`;
writeFileSync(join(dir, 'hifz.html'), page);
console.log(`hifz.html: ${(page.length / 1024).toFixed(0)} KB`);
