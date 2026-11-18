// Monetization slots for the result screen.
// Fill these constants when IDs/links are issued. Empty values load nothing
// (unless the page is opened with ?adpreview=1, which shows placeholders).
//
// ads.txt: do NOT create web/public/ads.txt until a Google AdSense publisher
// id is issued. Then add a file containing exactly one line:
//   google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa7
// Use the numeric publisher id (pub-...), not the ca-pub- client prefix.
// The last field is Google's official certified-seller ID.

import { ADFIT_UNIT, ADFIT_WIDTH, ADFIT_HEIGHT, mountAdfit, wantPreview } from './adfit.js';

// AdSense: set to 'ca-pub-…' and the numeric slot id. Both must be set.
export const ADSENSE_CLIENT = '';
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

export const COUPANG_DISCLOSURE = '이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.';

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
  label.textContent = '광고';
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

  if (!document.getElementById(ADSENSE_SCRIPT_ID)) {
    const s = document.createElement('script');
    s.id = ADSENSE_SCRIPT_ID;
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ADSENSE_CLIENT.trim())}`;
    s.crossOrigin = 'anonymous';
    document.head.appendChild(s);
  }
  const push = () => {
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* ignore */ }
  };
  if (window.adsbygoogle) push();
  else document.getElementById(ADSENSE_SCRIPT_ID)?.addEventListener('load', push, { once: true });
}

function showAdPreview(root) {
  root.replaceChildren();
  showSlot(root, true);
  const label = document.createElement('span');
  label.className = 'adfit-label';
  label.textContent = '광고';
  root.appendChild(label);
  const ph = document.createElement('div');
  ph.className = 'adfit-preview';
  ph.style.width = ADFIT_WIDTH + 'px';
  ph.style.height = ADFIT_HEIGHT + 'px';
  ph.textContent = `광고 자리 (${ADFIT_WIDTH}×${ADFIT_HEIGHT})`;
  root.appendChild(ph);
}

function mountAdSlot() {
  const root = document.getElementById('r-adfit');
  if (!root) return;
  // AdFit takes priority over AdSense in the same result-bottom slot.
  if (isAdfitReady()) {
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
  kicker.textContent = '호아 도사의 행운 아이템';
  card.appendChild(kicker);

  if (preview) {
    const name = document.createElement('span');
    name.className = 'coupang-name';
    name.textContent = '행운 아이템 자리 (링크를 넣으면 여기에 보여요)';
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
  a.textContent = '호아 도사에게 유부 사주기 🍙';
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
