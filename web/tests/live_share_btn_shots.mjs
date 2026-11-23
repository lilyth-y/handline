import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = 'https://hoadosa.com';
const VAL = process.env.VAL || '/agent/repos/handline/samples/relabel_pilot/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/share-btn-fix/';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

for (const [w, name] of [[360, '360'], [390, '390']]) {
  for (const [home, tag] of [['/', 'ko'], ['/en/', 'en']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const p = await ctx.newPage();
    await p.goto(BASE + home, { waitUntil: 'networkidle' });
    await p.click('#btn-start');
    await p.waitForSelector('#s-capture.active');
    await p.setInputFiles('#in-album', VAL + 'image1016.jpg');
    await p.waitForSelector('#s-result.active', { timeout: 180000 });
    await p.locator('#r-sharehero').scrollIntoViewIfNeeded();
    await p.screenshot({ path: `${OUT}live_${tag}_share_hero_${name}.png` });
    await ctx.close();
  }
}

await browser.close();
console.log('saved', OUT);