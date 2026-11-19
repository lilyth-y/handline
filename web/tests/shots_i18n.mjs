// 언어별 모바일 스크린샷(390x844): 홈 · 친구 공유 링크 도착 · 결과 · 근거 펼침 · 궁합 비교
//   OUT=/workspace/palm-promo/i18n/ node tests/shots_i18n.mjs [baseURL]
// 분석에는 로컬 val 테스트 사진을 쓰지만, 결과 오버레이(손바닥 사진 위 선 그림)는 항상 숨겨서 사진이 이미지에 남지 않게 한다.
import { chromium } from 'playwright-core';
import fs from 'fs';
import { LANGS, LANG_IDS } from '../public/js/i18n/langs.js';
const BASE = (process.argv[2] || 'http://localhost:8787/').replace(/\/$/, '');
const VAL = process.env.VAL || '/workspace/palm-ai/data/palm_lines_yolo_v2/images/val/';
const OUT = process.env.OUT || '/workspace/palm-promo/i18n/';
const ONLY = (process.env.LANGS || LANG_IDS.join(',')).split(',');
fs.mkdirSync(OUT, { recursive: true });
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const mk = async (lang) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: KAKAO, locale: { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', 'zh-tw': 'zh-TW' }[lang] });
  await ctx.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); localStorage.setItem('hoa_lang_dismissed', '1'); } catch {} Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__shared = d; } }); });
  const p = await ctx.newPage();
  await p.addInitScript(() => { const s = document.createElement('style'); s.textContent = '#r-overlay{visibility:hidden!important}'; document.addEventListener('DOMContentLoaded', () => document.head.appendChild(s)); });
  return p;
};
async function analyse(p, img) {
  await p.click('#btn-start'); await p.waitForSelector('#s-capture.active');
  await p.setInputFiles('#in-album', VAL + img);
  await p.waitForSelector('#s-result.active, #s-compare.active, #s-error.active', { timeout: 120000 }); await p.waitForTimeout(900);
}
for (const lang of ONLY) {
  const pre = LANGS[lang].prefix;
  const A = await mk(lang);
  await A.goto(`${BASE}${pre}/`, { waitUntil: 'networkidle' }); await A.waitForTimeout(400);
  await A.screenshot({ path: `${OUT}${lang}_1_home.png` });
  await analyse(A, 'image1016.jpg');
  await A.screenshot({ path: `${OUT}${lang}_3_result.png` });
  await A.click('.luck-tile[data-open="wealth"]'); await A.waitForSelector('#r-evidence:not(.hidden)');
  await A.locator('#r-lucks').scrollIntoViewIfNeeded(); await A.waitForTimeout(500);
  await A.screenshot({ path: `${OUT}${lang}_4_evidence.png` });
  await A.click('.luck-tile[data-open="wealth"]'); await A.locator('#r-sharehero').scrollIntoViewIfNeeded(); await A.click('#sh-native');
  const sh = await A.evaluate(() => window.__shared); const su = new URL(sh.url);
  const C = await mk(lang);
  await C.goto(BASE + su.pathname + su.search, { waitUntil: 'networkidle' });
  await C.waitForSelector('#shared-banner:not(.hidden)'); await C.waitForTimeout(400);
  await C.screenshot({ path: `${OUT}${lang}_2_landing.png` });
  await analyse(C, 'image1047.jpg');
  await C.screenshot({ path: `${OUT}${lang}_5_compare.png` });
  await C.screenshot({ path: `${OUT}${lang}_5_compare_full.png`, fullPage: true });
  await A.context().close(); await C.context().close();
  console.log('shots', lang);
}
await browser.close();
