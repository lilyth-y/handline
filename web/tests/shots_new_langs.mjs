// Screenshots for new locales: node tests/shots_new_langs.mjs [baseURL]
import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';
import { LANGS } from '../public/js/i18n/langs.js';

const BASE = (process.argv[2] || 'http://localhost:8787/').replace(/\/$/, '');
const VAL = process.env.VAL || '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = '/opt/cursor/artifacts/new_langs';
const NEW = ['es', 'zh-cn', 'vi', 'th', 'id', 'de', 'fr'];
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });

async function analyse(p) {
  await p.click('#btn-start');
  await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + 'image1016.jpg');
  await p.waitForSelector('#s-result.active, #s-error.active', { timeout: 120000 });
  await p.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' });
  await p.waitForTimeout(400);
}

for (const lang of NEW) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: LANGS[lang].intl, userAgent: KAKAO, deviceScaleFactor: 2 });
  await ctx.addInitScript((l) => {
    try { localStorage.setItem('hoa_collect', 'off'); localStorage.setItem('hoa_lang', l); } catch {}
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } });
  }, lang);
  const p = await ctx.newPage();
  await p.goto(`${BASE}${LANGS[lang].prefix}/`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(OUT, `${lang}_home.png`) });
  await analyse(p);
  await p.screenshot({ path: path.join(OUT, `${lang}_result.png`) });
  await p.locator('#r-sharehero').scrollIntoViewIfNeeded();
  await p.click('#sh-native');
  const sh = await p.evaluate(() => window.__shared);
  await ctx.close();
  const C = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: LANGS[lang].intl, userAgent: KAKAO, deviceScaleFactor: 2 });
  await C.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
  const fp = await C.newPage();
  await fp.goto(BASE + (sh?.url ? new URL(sh.url).pathname + new URL(sh.url).search : `${LANGS[lang].prefix}/`), { waitUntil: 'networkidle' });
  if (sh?.url) {
    await fp.waitForSelector('#shared-banner:not(.hidden)', { timeout: 15000 }).catch(() => {});
    await fp.click('#btn-start');
    await fp.waitForSelector('#s-capture.active');
    await fp.setInputFiles('#in-album', VAL + 'image1047.jpg');
    await fp.waitForSelector('#s-compare.active, #s-result.active', { timeout: 120000 });
    await fp.addStyleTag({ content: '#r-overlay{visibility:hidden!important}' });
    await fp.waitForTimeout(400);
  }
  await fp.screenshot({ path: path.join(OUT, `${lang}_compare.png`) });
  await C.close();
  console.log('shots', lang);
}

// redirect checks
const REDIRECTS = [
  ['es-ES', 'es', '/es/'], ['zh-CN', 'zh-cn', '/zh-cn/'], ['vi-VN', 'vi', '/vi/'],
  ['th-TH', 'th', '/th/'], ['id-ID', 'id', '/id/'], ['de-DE', 'de', '/de/'], ['fr-FR', 'fr', '/fr/'],
];
for (const [loc, tag, expect] of REDIRECTS) {
  const ctx = await browser.newContext({ locale: loc, userAgent: KAKAO });
  await ctx.addInitScript(() => { try { localStorage.removeItem('hoa_lang'); sessionStorage.setItem('hoa_test_fresh','1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.screenshot({ path: path.join(OUT, `redirect_${tag}.png`) });
  const ok = new URL(p.url()).pathname === expect;
  console.log('redirect', tag, ok ? 'ok' : 'FAIL', p.url());
  await ctx.close();
}

await browser.close();
console.log('saved', OUT);