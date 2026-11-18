// Kakao AdFit banner for the result screen.
// Official snippet (AdFit Web SDK): <ins class="kakao_ad_area" style="display:none;width:100%;"
//   data-ad-unit="…" data-ad-width="…" data-ad-height="…"></ins>
//   <script async type="text/javascript" charset="utf-8" src="https://t1.kakaocdn.net/kas/static/ba.min.js"></script>
// Leave ADFIT_UNIT empty until a unit ID is issued. Then set only that constant — no other code changes.
// To use the optional 300×250 size, set ADFIT_WIDTH/ADFIT_HEIGHT to 300 and 250.

export const ADFIT_UNIT = '';
export const ADFIT_WIDTH = 320;
export const ADFIT_HEIGHT = 100;

const SCRIPT_SRC = 'https://t1.kakaocdn.net/kas/static/ba.min.js';
const SCRIPT_ID = 'kakao-adfit-sdk';

let scriptPromise = null;

export function wantPreview() {
  try { return new URLSearchParams(location.search).get('adpreview') === '1'; }
  catch { return false; }
}

function ensureScript() {
  if (window.adfit) return Promise.resolve('ready');
  const existing = document.getElementById(SCRIPT_ID);
  if (existing && scriptPromise) return scriptPromise;
  if (existing) {
    scriptPromise = new Promise((resolve, reject) => {
      if (window.adfit) return resolve('ready');
      existing.addEventListener('load', () => resolve('ready'), { once: true });
      existing.addEventListener('error', () => reject(new Error('adfit script')), { once: true });
    });
    return scriptPromise;
  }
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.async = true;
    s.type = 'text/javascript';
    s.charset = 'utf-8';
    s.src = SCRIPT_SRC;
    s.onload = () => resolve('ready');
    s.onerror = () => reject(new Error('adfit script'));
    document.body.appendChild(s);
  });
  return scriptPromise;
}

function renderIns(ins, firstLoad) {
  if (!firstLoad && window.adfit && typeof window.adfit.render === 'function') {
    try { window.adfit.render(ins); } catch { /* SDK will retry on its own if present */ }
  }
}

export function isAdfitReady() {
  return Boolean(String(ADFIT_UNIT || '').trim());
}

export function mountAdfit(root = document.getElementById('r-adfit')) {
  if (!root) return false;
  const unit = String(ADFIT_UNIT || '').trim();
  if (!unit) return false;
  root.replaceChildren();
  root.hidden = false;
  root.classList.add('show');

  const label = document.createElement('span');
  label.className = 'adfit-label';
  label.textContent = '광고';
  root.appendChild(label);

  const box = document.createElement('div');
  box.className = 'adfit-box';
  box.style.width = ADFIT_WIDTH + 'px';
  box.style.minHeight = ADFIT_HEIGHT + 'px';

  const ins = document.createElement('ins');
  ins.className = 'kakao_ad_area';
  ins.style.display = 'none';
  ins.style.width = '100%';
  ins.setAttribute('data-ad-unit', unit);
  ins.setAttribute('data-ad-width', String(ADFIT_WIDTH));
  ins.setAttribute('data-ad-height', String(ADFIT_HEIGHT));
  box.appendChild(ins);
  root.appendChild(box);

  const firstLoad = !document.getElementById(SCRIPT_ID) && !window.adfit;
  ensureScript().then(() => renderIns(ins, firstLoad)).catch(() => {});
  return true;
}
