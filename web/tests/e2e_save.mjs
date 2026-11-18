// Save-card fallbacks: node tests/e2e_save.mjs [baseURL]
// Emulates KakaoTalk in-app, Android Chrome, and iPhone Safari.
import { chromium } from 'playwright-core';
import fs from 'fs';
import { isInApp, isIOS, canUseAnchorDownload, shouldSkipFileShare, externalBrowserHref } from '../public/js/savecard.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8787/';
const PALM = process.env.PALM || '/workspace/palm-promo/reels/_src/generated_palm.jpg';
const OUT = process.env.OUT || '/tmp/e2e_save/';
fs.mkdirSync(OUT, { recursive: true });

const UAS = {
  kakao: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
};

const results = {}, errors = [];
const check = (name, ok, extra) => { results[name] = { ok: !!ok, ...(extra || {}) }; };
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = (ua) => browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  userAgent: ua, locale: 'ko-KR', acceptDownloads: true,
});

// href builders (no browser)
{
  const url = 'https://hoadosa.com/?t=flower&s=4554&ref=share&save=1';
  const kakao = externalBrowserHref(url, UAS.kakao);
  const intent = externalBrowserHref(url, UAS.android);
  check('href_kakao_scheme', kakao.startsWith('kakaotalk://web/openExternal?url=') && decodeURIComponent(kakao.split('url=')[1]) === url, { kakao: kakao.slice(0, 80) });
  check('href_android_intent', intent.startsWith('intent://hoadosa.com/') && intent.includes('package=com.android.chrome') && intent.includes('S.browser_fallback_url='), { intent: intent.slice(0, 120) });
  check('flags_kakao', isInApp(UAS.kakao) && shouldSkipFileShare(UAS.kakao) && !canUseAnchorDownload(UAS.kakao));
  check('flags_android', !isInApp(UAS.android) && canUseAnchorDownload(UAS.android) && !isIOS(UAS.android));
  check('flags_iphone', !isInApp(UAS.iphone) && isIOS(UAS.iphone) && !canUseAnchorDownload(UAS.iphone));
}

async function analyse(page) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.click('#btn-start');
  await page.waitForSelector('#s-capture.active');
  await page.setInputFiles('#in-album', PALM);
  await page.waitForSelector('#s-result.active, #s-error.active', { timeout: 180000 });
  if (await page.$('#s-error.active')) throw new Error('analysis failed');
}

// A. KakaoTalk in-app: modal + long-press copy + external button
{
  const ctx = await mk(UAS.kakao);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('kakao ' + e));
  await analyse(page);
  await page.click('#btn-card');
  await page.waitForSelector('#card-modal:not(.hidden)', { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth > 0);
  const info = await page.evaluate(() => {
    const img = document.getElementById('card-img');
    return {
      via: window.__card?.via, bytes: window.__card?.bytes, name: window.__card?.name, type: window.__card?.type,
      w: img.naturalWidth, h: img.naturalHeight, src: img.src.slice(0, 8),
      tip: document.querySelector('.modal-tip')?.innerText?.replace(/\s+/g, ' ').trim(),
      externalHidden: document.getElementById('btn-card-external').classList.contains('hidden'),
    };
  });
  check('kakao_via_modal', info.via === 'modal' && info.w === 1080 && info.h === 1920, info);
  check('kakao_jpeg_small', info.type === 'image/jpeg' && info.name.endsWith('.jpg') && info.bytes > 20000 && info.bytes < 900000, { bytes: info.bytes, name: info.name, type: info.type });
  check('kakao_tip', info.tip === '이미지를 길게 눌러 저장하세요', { tip: info.tip });
  check('kakao_external_visible', info.externalHidden === false);
  await page.screenshot({ path: OUT + 'kakao_modal.png' });
  await page.evaluate(() => { window.__preventExternal = true; });
  await page.click('#btn-card-external');
  const ext = await page.evaluate(() => ({ href: window.__card?.external, via: window.__card?.via }));
  let decoded = '';
  try { decoded = decodeURIComponent((ext.href || '').split('url=')[1] || ''); } catch { decoded = ''; }
  check('kakao_external_href', (ext.href || '').startsWith('kakaotalk://web/openExternal?url=') && decoded.includes('save=1') && decoded.includes('t='), { href: ext.href, decoded });
  await ctx.close();
}

// B. Android Chrome: <a download> JPEG
{
  const ctx = await mk(UAS.android);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('android ' + e));
  await analyse(page);
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }).catch(() => null),
    page.click('#btn-card'),
  ]);
  const info = await page.evaluate(() => ({ ...window.__card, modal: !document.getElementById('card-modal').classList.contains('hidden') }));
  const name = dl?.suggestedFilename() || '';
  check('android_via_download', info.via === 'download' && !!dl && /\.jpe?g$/i.test(name) && !info.modal, { via: info.via, name, bytes: info.bytes, modal: info.modal });
  if (dl) await dl.saveAs(OUT + 'android_download.jpg');
  await ctx.close();
}

// C. iPhone Safari: no <a download>; modal (Playwright has no Web Share). External button hidden (already in Safari).
{
  const ctx = await mk(UAS.iphone);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('iphone ' + e));
  await analyse(page);
  await page.click('#btn-card');
  await page.waitForSelector('#card-modal:not(.hidden)', { timeout: 20000 });
  const info = await page.evaluate(() => ({
    ...window.__card,
    tip: document.querySelector('.modal-tip')?.innerText?.replace(/\s+/g, ' ').trim(),
    externalHidden: document.getElementById('btn-card-external').classList.contains('hidden'),
    w: document.getElementById('card-img').naturalWidth,
  }));
  check('iphone_via_modal', info.via === 'modal' && info.w === 1080 && info.externalHidden === true, info);
  check('iphone_tip', info.tip === '이미지를 길게 눌러 저장하세요', { tip: info.tip });
  await page.screenshot({ path: OUT + 'iphone_modal.png' });
  await ctx.close();
}

// D. ?save=1 landing (external-browser target): modal without a palm photo
{
  const ctx = await mk(UAS.android);
  const page = await ctx.newPage();
  await page.goto(BASE + '?t=flower&s=4554&ref=share&save=1', { waitUntil: 'networkidle' });
  await page.waitForSelector('#card-modal:not(.hidden)', { timeout: 20000 });
  await page.waitForFunction(() => document.getElementById('card-img').complete && document.getElementById('card-img').naturalWidth === 1080);
  const info = await page.evaluate(() => ({ ...window.__card, w: document.getElementById('card-img').naturalWidth, h: document.getElementById('card-img').naturalHeight, autoload: window.__card?.autoload }));
  check('save_query_autoload', info.autoload === true && info.w === 1080 && info.h === 1920 && info.bytes < 900000, info);
  await page.screenshot({ path: OUT + 'save_query_modal.png' });
  await ctx.close();
}

await browser.close();
const failed = Object.entries(results).filter(([, v]) => !v.ok);
console.log(JSON.stringify({ results, errors }, null, 2));
if (failed.length || errors.length) {
  console.error('FAIL', failed.map(([k]) => k));
  process.exit(1);
}
console.log('ALL PASS');
