// Rendert die App-Icons aus public/icons/icon.svg (einmalig, Ergebnis liegt im Repo).
const { chromium } = require('playwright');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
(async () => {
  const dir = join(__dirname, '..', 'public', 'icons');
  const svg = readFileSync(join(dir, 'icon.svg'), 'utf8');
  const browser = await chromium.launch();
  for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
    await page.screenshot({ path: join(dir, name) });
    await page.close();
  }
  await browser.close();
})();
