// Monetization slots for the result screen.
// Fill these constants when IDs/links are issued. Empty values load nothing
// (unless the page is opened with ?adpreview=1, which shows placeholders).
//
// ads.txt lives at web/public/ads.txt and must stay a single line:
//   google.com, pub-1321078614012821, DIRECT, f08c47fec0942fa0
// Use the numeric publisher id (pub-...), not the ca-pub- client prefix.
// The last field is Google's official certified-seller ID (ends in fa0).
// The AdSense verification script is already in each page <head>. Do not
// insert a second copy here; only push a unit when ADSENSE_SLOT is set.

import { ADFIT_UNIT, ADFIT_WIDTH, ADFIT_HEIGHT, mountAdfit, wantPreview } from './adfit.js';
import { t, isKo } from './i18n/runtime.js';

// 카카오 애드핏·쿠팡 파트너스·토스/카카오페이 후원은 한국 전용이라 한국어 페이지에서만 쓴다 (값은 그대로, 외국어 페이지에서는 숨김).

// AdSense client is set for site verification. Leave ADSENSE_SLOT empty
// until an ad unit id is issued — a unit is rendered only when both are set.
export const ADSENSE_CLIENT = 'ca-pub-1321078614012821';
export const ADSENSE_SLOT = '';

// Coupang Partners links, keyed by fox type id (gold, fire, …) or luck
// category (wealth, love, health, career). Type id wins, then the result's
// strongest luck key that has a link. Leave entries empty to hide the card.
// Example: gold: { name: '황금빛 재물 부적', url: 'https://link.coupang.com/…' }
export const COUPANG_LINKS = {
  gold: null,
  fire: null,
  moon: null,
  star: null,
  wind: null,
  sun: null,
  cloud: null,
  flower: null,
  rock: null,
  wave: null,
  lightning: null,
  galaxy: null,
  wealth: null,
  love: null,
  health: null,
  career: null,
};

// Toss or KakaoPay send-money link. Hidden when empty.
export const DONATE_URL = '';

export const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';   // 한국어 페이지 전용 (법정 고지 문구라 번역하지 않음)

const ADSENSE_SCRIPT_ID = 'adsense-sdk';
const LUCK_ORDER = ['wealth', 'love', 'health', 'career'];

function isFilled(v) {
  return Boolean(v && String(v).trim());
}

export function isAdfitReady() {
  return isFilled(ADFIT_UNIT);
}

export function isAdsenseReady() {
  return isFilled(ADSENSE_CLIENT) && isFilled(ADSENSE_SLOT);
}

function showSlot(el, on) {
  if (!el) return;
  el.hidden = !on;
  el.classList.toggle('show', on);
  if (!on) el.replaceChildren();
}

function mountAdsense(root) {
  root.replaceChildren();
  showSlot(root, true);

  const label = document.createElement('span');
  label.className = 'adfit-label';
  label.textContent = t('ads.label');
  root.appendChild(label);

  const box = document.createElement('div');
  box.className = 'adfit-box';
  box.style.width = '320px';
  box.style.minHeight = '100px';

  const ins = document.createElement('ins');
  ins.className = 'adsbygoogle';
  ins.style.display = 'inline-block';
  ins.style.width = '320px';
  ins.style.height = '100px';
  ins.setAttribute('data-ad-client', ADSENSE_CLIENT.trim());
  ins.setAttribute('data-ad-slot', ADSENSE_SLOT.trim());
  box.appendChild(ins);
  root.appendChild(box);

  const script = ensureAdsenseScript();
  const push = () => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* ignore */ }
  };
  if (window.adsbygoogle) push();
  else script.addEventListener('load', push, { once: true });
}

const ADSENSE_SCRIPT_MARK = 'pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';

function findAdsenseScript() {
  const byId = document.getElementById(ADSENSE_SCRIPT_ID);
  if (byId) return byId;
  return document.querySelector(`script[src*="${ADSENSE_SCRIPT_MARK}"]`);
}

// Reuse the <head> verification script when present. Never add a second copy.
function ensureAdsenseScript() {
  const existing = findAdsenseScript();
  if (existing) return existing;
  const s = document.createElement('script');
  s.id = ADSENSE_SCRIPT_ID;
  s.async = true;
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT.trim())}`;
  s.crossOrigin = 'anonymous';
  document.head.appendChild(s);
  return s;
}

function showAdPreview(root) {
  root.replaceChildren();
  showSlot(root, true);
  const label = document.createElement('span');
  label.className = 'adfit-label';
  label.textContent = t('ads.label');
  root.appendChild(label);
  const ph = document.createElement('div');
  ph.className = 'adfit-preview';
  ph.style.width = ADFIT_WIDTH + 'px';
  ph.style.height = ADFIT_HEIGHT + 'px';
  ph.textContent = t('ads.preview', { w: ADFIT_WIDTH, h: ADFIT_HEIGHT });
  root.appendChild(ph);
}

function mountAdSlot() {
  const root = document.getElementById('r-adfit');
  if (!root) return;
  // AdFit takes priority over AdSense in the same result-bottom slot (AdFit is Korea-only: hidden on non-Korean pages).
  if (isKo && isAdfitReady()) {
    mountAdfit(root);
    return;
  }
  if (isAdsenseReady()) {
    mountAdsense(root);
    return;
  }
  if (wantPreview()) {
    showAdPreview(root);
    return;
  }
  showSlot(root, false);
}

function pickCoupang(result) {
  const links = COUPANG_LINKS || {};
  const tid = result?.type?.id;
  const typeHit = tid && links[tid];
  if (typeHit && isFilled(typeHit.url) && typeHit.name) return typeHit;
  const lucks = result?.lucks || {};
  const ranked = LUCK_ORDER.slice().sort((a, b) => (lucks[b]?.stars || 0) - (lucks[a]?.stars || 0));
  for (const k of ranked) {
    const hit = links[k];
    if (hit && isFilled(hit.url) && hit.name) return hit;
  }
  for (const v of Object.values(links)) {
    if (v && isFilled(v.url) && v.name) return v;
  }
  return null;
}

function mountCoupang(result) {
  const root = document.getElementById('r-coupang');
  if (!root) return;
  if (!isKo) { showSlot(root, false); return; }
  const item = pickCoupang(result);
  const preview = !item && wantPreview();
  if (!item && !preview) {
    showSlot(root, false);
    return;
  }
  root.replaceChildren();
  showSlot(root, true);

  const card = document.createElement('div');
  card.className = 'coupang-card';
  const kicker = document.createElement('p');
  kicker.className = 'coupang-kicker';
  kicker.textContent = t('ads.coupang_kicker');
  card.appendChild(kicker);

  if (preview) {
    const name = document.createElement('span');
    name.className = 'coupang-name';
    name.textContent = t('ads.coupang_preview');
    card.appendChild(name);
  } else {
    const a = document.createElement('a');
    a.className = 'coupang-name';
    a.href = item.url;
    a.target = '_blank';
    a.rel = 'sponsored noopener';
    a.textContent = item.name;
    card.appendChild(a);
  }

  const disc = document.createElement('p');
  disc.className = 'coupang-disc';
  disc.textContent = COUPANG_DISCLOSURE;
  card.appendChild(disc);
  root.appendChild(card);
}

function mountDonate() {
  const root = document.getElementById('r-donate');
  if (!root) return;
  if (!isKo) { showSlot(root, false); return; }
  const url = String(DONATE_URL || '').trim();
  const preview = !url && wantPreview();
  if (!url && !preview) {
    showSlot(root, false);
    return;
  }
  root.replaceChildren();
  showSlot(root, true);
  const a = document.createElement(preview ? 'span' : 'a');
  a.className = 'btn ghost donate-btn' + (preview ? ' preview' : '');
  a.textContent = t('donate.btn');
  if (!preview) {
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  root.appendChild(a);
}

export function mountMonetize(result) {
  mountDonate();
  mountAdSlot();
  mountCoupang(result);
}
