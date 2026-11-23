// Mobile screenshots: result share CTA + /s/ landing (ko + en). node tests/shots_share_loop.mjs [base]
import { chromium } from 'playwright-core';
import fs from 'fs';

const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = process.env.VAL || '/agent/repos/handline/samples/relabel_pilot/';
const OUT = process.env.OUT || '/opt/cursor/artifacts/share-loop/';
fs.mkdirSync(OUT, { recursive: true });
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';

async function shot(lang, name, fn) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: KAKAO, locale: lang === 'ko' ? 'ko-KR' : 'en-US' });
  await ctx.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
  const p = await ctx.newPage();
  await fn(p);
  await p.screenshot({ path: OUT + name, fullPage: false });
  await ctx.close();
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });

const appHome = (lang) => new URL(lang === 'ko' ? '/' : `/${lang}/`, BASE).href;

for (const lang of ['ko', 'en']) {
  await shot(lang, `result_share_cta_${lang}.png`, async (p) => {
    await p.goto(appHome(lang), { waitUntil: 'networkidle' });
    await p.click('#btn-start');
    await p.waitForSelector('#s-capture.active');
    await p.setInputFiles('#in-album', VAL + 'image1016.jpg');
    await p.waitForSelector('#s-result.active', { timeout: 120000 });
    await p.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' });
    await p.locator('#r-sharehero').scrollIntoViewIfNeeded();
    await p.waitForTimeout(400);
  });
}

const baseRoot = new URL(BASE).origin;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: KAKAO, locale: 'ko-KR' });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__sh = d; } }); });
  const p = await ctx.newPage();
  await p.goto(BASE, { waitUntil: 'networkidle' });
  await p.click('#btn-start');
  await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + 'image1016.jpg');
  await p.waitForSelector('#s-result.active', { timeout: 120000 });
  await p.click('#sh-native');
  const koShare = new URL(await p.evaluate(() => window.__sh?.url));
  await ctx.close();
  for (const lang of ['ko', 'en']) {
    const u = new URL(koShare);
    u.host = new URL(baseRoot).host;
    u.protocol = new URL(baseRoot).protocol;
    if (lang !== 'ko') u.pathname = `/${lang}${u.pathname}`;
    await shot(lang, `share_landing_${lang}.png`, async (p) => {
      await p.goto(u.href, { waitUntil: 'networkidle' });
      await p.waitForSelector('#sl-start');
      await p.waitForTimeout(300);
    });
  }
}

await browser.close();
console.log('screenshots ->', OUT);