// Button wrap audit: share CTA line count per viewport/lang. node tests/share_btn_wrap.mjs [base]
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:8787/';
const VAL = process.env.VAL || '/agent/repos/handline/samples/relabel_pilot/';
const WIDTHS = [320, 360, 375, 390, 412];
const LANGS = [
  { id: 'ko', home: '/', label: 'share.native' },
  { id: 'en', home: '/en/', label: 'share.native' },
  { id: 'ja', home: '/ja/', label: 'share.native' },
  { id: 'zh-tw', home: '/zh-tw/', label: 'share.native' },
];
const KAKAO = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.102 Mobile Safari/537.36;KAKAOTALK 2410530';

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const results = {};

for (const lang of LANGS) {
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, userAgent: KAKAO, locale: lang.id === 'ko' ? 'ko-KR' : 'en-US' });
    await ctx.addInitScript(() => { try { localStorage.setItem('hoa_collect', 'off'); } catch {} });
    const p = await ctx.newPage();
    await p.goto(new URL(lang.home, BASE).href, { waitUntil: 'networkidle' });
    await p.click('#btn-start');
    await p.waitForSelector('#s-capture.active');
    await p.setInputFiles('#in-album', VAL + 'image1016.jpg');
    await p.waitForSelector('#s-result.active', { timeout: 180000 });
    const m = await p.evaluate(() => {
      const btn = document.getElementById('sh-native');
      const copy = document.getElementById('sh-copy');
      const row = document.querySelector('.share-row');
      const meas = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        const lines = Math.max(1, Math.round(r.height / lh));
        const cs = getComputedStyle(el);
        return { lines, h: r.height, lh, w: r.width, fs: cs.fontSize, text: el.textContent.trim().slice(0, 40), orphanEmoji: /^💞$|^💬$|^🔗$/.test(el.textContent.trim().split(/\s/)[0]) && lines > 1 };
      };
      return {
        native: meas(btn),
        copy: meas(copy),
        rowW: row?.getBoundingClientRect().width,
        overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
      };
    });
    const key = `${lang.id}_${w}`;
    results[key] = { ok: m.native && m.native.lines <= 2 && !m.overflowX && !m.native.orphanEmoji, ...m };
    await ctx.close();
  }
}

await browser.close();
console.log(JSON.stringify(results, null, 2));
const fail = Object.entries(results).filter(([, v]) => !v.ok);
console.log(fail.length ? `FAIL ${fail.length}` : 'ALL PASS');
process.exit(fail.length ? 1 : 0);