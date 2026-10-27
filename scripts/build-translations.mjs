// Erzeugt die Übersetzungen für die Lese-Ansicht (public/data/tr-*.json):
// ein Array mit einem Text je Ayah, in derselben Reihenfolge wie text.json.
// Aufruf: npm run translations
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = {
  bubenheim: 'deu-frankbubenheima.json',
  aburida: 'deu-aburidamuhammad.json',
};
const kfgqpc = JSON.parse(readFileSync(join(root, 'data-src/kfgqpc/hafsData_v18.json'), 'utf8').replace(/^﻿/, ''));
for (const [id, file] of Object.entries(SOURCES)) {
  const q = JSON.parse(readFileSync(join(root, 'data-src/translations', file), 'utf8')).quran;
  if (q.length !== kfgqpc.length) throw new Error(`${file}: ${q.length} statt ${kfgqpc.length} Ayat`);
  q.forEach((v, i) => {
    if (v.chapter !== kfgqpc[i].sora || v.verse !== kfgqpc[i].aya_no) throw new Error(`${file}: Reihenfolge weicht bei ${i} ab`);
  });
  writeFileSync(join(root, `public/data/tr-${id}.json`), JSON.stringify(q.map((v) => v.text.trim())));
  console.log(`tr-${id}.json`);
}
