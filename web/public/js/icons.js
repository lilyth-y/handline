// Thin line icons for the 호아 도사 UI. 24x24, 1.5px stroke, rounded caps.
// Hand-drawn in a Lucide-like style (ISC). Fox, crystal and type marks are custom.

export const LUCK_ICON = { wealth: 'coins', love: 'heart', health: 'leaf', career: 'trophy' };
export const TYPE_ICON = {
  gold: 'coin', fire: 'flame', moon: 'moon', star: 'star',
  wind: 'wind', sun: 'sun', cloud: 'cloud', flower: 'flower',
  rock: 'mountain', wave: 'wave', lightning: 'bolt', galaxy: 'galaxy',
};

// Inner SVG markup (paths/circles) for a 24x24 viewBox. Stroke/fill come from the host <svg> or <symbol>.
export const ICONS = {
  fox: `
    <path d="M7.6 10.2 5.8 3.8 11.4 8.6"/>
    <path d="M16.4 10.2 18.2 3.8 12.6 8.6"/>
    <path d="M6.2 12.4c0-3 2.5-4.8 5.8-4.8s5.8 1.8 5.8 4.8c0 3.6-2.5 6.4-5.8 6.4s-5.8-2.8-5.8-6.4Z"/>
    <circle cx="10" cy="12.4" r=".7" fill="currentColor"/>
    <circle cx="14" cy="12.4" r=".7" fill="currentColor"/>
    <path d="M12 13.6v1.1"/>
    <path d="M10.5 15.8c.8.7 2.2.7 3 0"/>
    <path d="M7.2 17.6c-2.6 1.2-4.2-.2-4-2.2 1.4.3 2.8 0 3.6-1"/>`,
  sparkles: `
    <path d="m11.5 3.2 1.15 5.6 5.6 1.15-5.6 1.15-1.15 5.6-1.15-5.6-5.6-1.15 5.6-1.15Z"/>
    <path d="m18.3 3.4.55 2.5 2.5.55-2.5.55-.55 2.5-.55-2.5-2.5-.55 2.5-.55Z"/>`,
  sparkle: `<path d="m12 3 1.3 6.2L19.5 10.5 13.3 11.8 12 18l-1.3-6.2L4.5 10.5l6.2-1.3Z"/>`,
  scroll: `
    <path d="M6.8 6.2h11.2a1.9 1.9 0 1 1 0 3.8H6.8a1.9 1.9 0 1 1 0-3.8Z"/>
    <path d="M6.8 8.1v9.4"/>
    <path d="M18 8.1v9.4"/>
    <path d="M6.8 17.5h11.2a1.9 1.9 0 1 0 0 3.2H6.8a1.9 1.9 0 1 0 0-3.2Z"/>
    <path d="M10 11.4h5.2M10 14.2h3.6"/>`,
  palm: `
    <path d="M9.2 13.2c-2.4-.8-3.6-2.8-2.2-4 .9-.8 2.2 0 2.7 1.8"/>
    <path d="M10.2 11.6V6.2a1.2 1.2 0 0 1 2.4 0V12"/>
    <path d="M12.6 11.8V5a1.25 1.25 0 0 1 2.5 0v7"/>
    <path d="M15.1 12.2V6.6a1.15 1.15 0 0 1 2.3 0v7"/>
    <path d="M17.4 13V8.6a1.1 1.1 0 0 1 2.2 0V15"/>
    <path d="M9.4 13.2c-.2 3 .4 6.2 1.5 8h6.2c1.4-1.6 2-4.8 1.8-8"/>`,
  camera: `
    <path d="M4 9.2h3l1.3-2.4h7.4L17 9.2h3a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H4A1.6 1.6 0 0 1 2.4 18.8v-8A1.6 1.6 0 0 1 4 9.2Z"/>
    <circle cx="12" cy="14.8" r="3.2"/>`,
  image: `
    <rect x="3" y="5" width="18" height="14" rx="2"/>
    <circle cx="8.4" cy="10" r="1.5"/>
    <path d="m3.4 16.6 4.8-4.2 3.6 3 3.2-2.8 5.6 5"/>`,
  chart: `
    <path d="M4 20V11M10 20V5.5M16 20v-7.5M3 20h17"/>`,
  ruler: `
    <path d="m4.2 15.4 11.2-11.2 4.4 4.4-11.2 11.2Z"/>
    <path d="m7 12.6 1.5 1.5M9.4 10.2l1.5 1.5M11.8 7.8l1.5 1.5"/>`,
  users: `
    <circle cx="8.8" cy="8" r="2.5"/>
    <path d="M4.2 19c0-3.6 2-5.2 4.6-5.2s4.6 1.6 4.6 5.2"/>
    <circle cx="16.2" cy="8.3" r="2.2"/>
    <path d="M13.8 19c0-3 1.2-4.6 2.4-4.6 2.2 0 4 1.5 4 4.6"/>`,
  mail: `
    <rect x="3" y="6" width="18" height="12" rx="2"/>
    <path d="m3.6 7.6 8.4 5.8 8.4-5.8"/>`,
  download: `
    <path d="M12 4v11.2"/>
    <path d="m7.4 11.4 4.6 4.6 4.6-4.6"/>
    <path d="M5 20h14"/>`,
  ban: `
    <circle cx="12" cy="12" r="8"/>
    <path d="M6.4 6.4 17.6 17.6"/>`,
  lock: `
    <rect x="5" y="11" width="14" height="9.5" rx="2"/>
    <path d="M8 11V8a4 4 0 0 1 8 0v3"/>`,
  sliders: `
    <path d="M4 7h16M4 12h16M4 17h16"/>
    <circle cx="9" cy="7" r="2"/>
    <circle cx="15" cy="12" r="2"/>
    <circle cx="8" cy="17" r="2"/>`,
  pointer: `
    <path d="M9.2 21.5v-9.2a1.15 1.15 0 0 1 2.3 0V14"/>
    <path d="M11.5 14V5.4a1.2 1.2 0 0 1 2.4 0V14"/>
    <path d="M13.9 14.2v-4.2a1.15 1.15 0 0 1 2.3 0V16"/>
    <path d="M16.2 16v-4.4a1.1 1.1 0 0 1 2.2 0V18"/>
    <path d="M9.2 13.4c-2.2-1-3.2-2.8-1.8-3.8.9-.6 2.1.2 2.6 1.8"/>`,
  search: `
    <circle cx="11" cy="11" r="6.4"/>
    <path d="m16 16 4.4 4.4"/>`,
  link: `
    <path d="M9.4 14.6 8 16a3.2 3.2 0 0 1-4.5-4.5L6 9.1"/>
    <path d="M14.6 9.4 16 8a3.2 3.2 0 1 1 4.5 4.5L18 14.9"/>
    <path d="m9.2 14.8 5.6-5.6"/>`,
  eye: `
    <path d="M3 12q9-7.2 18 0q-9 7.2-18 0Z"/>
    <circle cx="12" cy="12" r="2.7"/>`,
  crystal: `
    <circle cx="12" cy="10.4" r="6.4"/>
    <path d="M9.2 16.6 7.6 21h8.8l-1.6-4.4"/>
    <path d="m9.8 8.6 1.2 1.6 1.8.4"/>`,
  heart: `
    <path d="M12 19.2C6.2 14.6 3.6 10.8 3.6 8.2A4.1 4.1 0 0 1 12 6.6 4.1 4.1 0 0 1 20.4 8.2c0 2.6-2.6 6.4-8.4 11Z"/>`,
  leaf: `
    <path d="M5.2 19.2c0-8.2 4.6-14.4 14.6-13.6 0 9.2-5.6 14.2-14.6 13.6Z"/>
    <path d="M8.2 16.2c2.8-2.6 5.8-6.6 8.6-8.8"/>`,
  trophy: `
    <path d="M8 4.2h8v3.8a4 4 0 0 1-8 0Z"/>
    <path d="M8 6.6c-2.8 0-3.8 2.4-1.6 4"/>
    <path d="M16 6.6c2.8 0 3.8 2.4 1.6 4"/>
    <path d="M12 12v3.6"/>
    <path d="M9.2 20.2h5.6"/>
    <path d="M10.2 15.6h3.6V20"/>`,
  coins: `
    <ellipse cx="9.6" cy="15.2" rx="5.6" ry="3"/>
    <path d="M4 15.2v-3.4c0-1.7 2.5-3 5.6-3s5.6 1.3 5.6 3v3.4"/>
    <ellipse cx="9.6" cy="11.8" rx="5.6" ry="3"/>
    <path d="M14.4 11.2c2.5.4 4.2 1.5 4.2 3v3.2"/>
    <ellipse cx="15.2" cy="17.2" rx="5" ry="2.6"/>`,
  coin: `
    <circle cx="12" cy="12" r="8"/>
    <circle cx="12" cy="12" r="5"/>`,
  flame: `
    <path d="M12.2 2.6c-1 5.2-5 6.4-5.4 11.4A5 5 0 0 0 12 21.4c4.4 0 6.8-3.4 6.4-8-0.4-3.2-2.6-4.8-2-8.4-1.4 3-2.4 3.2-4.2-2.4Z"/>
    <path d="M12 19.6c-1.8 0-2.8-1.6-2.8-3.6 0-2.4 1.8-3.8 2.8-6 1 2.2 2.8 3.6 2.8 6 0 2-1 3.6-2.8 3.6Z"/>`,
  moon: `<path d="M14.6 4.2A8.1 8.1 0 1 0 14.6 19.8 6.3 6.3 0 1 1 14.6 4.2Z"/>`,
  star: `<path d="m12 3.2 2.35 6.7h7.05l-5.7 4.22 2.18 6.78L12 16.9l-5.88 4 2.18-6.78-5.7-4.22h7.05Z"/>`,
  wind: `
    <path d="M4 8.4h9.2a2.5 2.5 0 1 0-1.4-4.5"/>
    <path d="M4 12.5h12.4a2.5 2.5 0 1 1-1.1 4.3"/>
    <path d="M4 16.6h6.8"/>`,
  sun: `
    <circle cx="12" cy="12" r="3.8"/>
    <path d="M12 3.2v2.3M12 18.5v2.3M3.2 12h2.3M18.5 12h2.3M5.7 5.7l1.6 1.6M16.7 16.7l1.6 1.6M5.7 18.3l1.6-1.6M16.7 7.3l1.6-1.6"/>`,
  cloud: `<path d="M7 17.4h10.2a3.4 3.4 0 0 0 .2-6.8 5 5 0 0 0-9.2-1.5A3.7 3.7 0 0 0 7 17.4Z"/>`,
  flower: `
    <circle cx="12" cy="7.4" r="2.5"/>
    <circle cx="16.4" cy="10.6" r="2.5"/>
    <circle cx="16.2" cy="15.5" r="2.5"/>
    <circle cx="7.8" cy="15.5" r="2.5"/>
    <circle cx="7.6" cy="10.6" r="2.5"/>
    <circle cx="12" cy="12" r="1.7"/>`,
  mountain: `
    <path d="m3.2 19 6-10.5 3.6 6 2.8-4.2 5.2 8.7Z"/>
    <path d="m11.2 15.2 1.6-1.2 2.2 1.8"/>`,
  wave: `
    <path d="M3 12.2c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.2 3 3 3"/>
    <path d="M3 17c2.5 0 2.5-3 5-3s2.5 3 5 3 2.5-3 5-3 2.2 3 3 3"/>`,
  bolt: `<path d="m13 3-6.6 10.4h5.4L11 21l6.6-10.4h-5.4Z"/>`,
  galaxy: `
    <ellipse cx="12" cy="12" rx="8.2" ry="3.6" transform="rotate(-28 12 12)"/>
    <path d="m12 8.2 1 2.3 2.4.4-2.4.4-1 2.3-1-2.3-2.4-.4 2.4-.4Z"/>
    <path d="m6.2 6 .4 1.1 1.1.4-1.1.4-.4 1.1-.4-1.1-1.1-.4 1.1-.4Z"/>
    <path d="m18 15.2.35 1 1 .35-1 .35-.35 1-.35-1-1-.35 1-.35Z"/>`,
  arrow: `
    <path d="M5 12h14"/>
    <path d="m14 6 6 6-6 6"/>`,
};

const BOX = 'viewBox="0 0 24 24"';
const STROKE = 'stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const SVG_ATTRS = `${BOX} fill="none" stroke="currentColor" ${STROKE}`;

export function spriteSvg() {
  const symbols = Object.entries(ICONS).map(([k, inner]) =>
    `<symbol id="i-${k}" ${SVG_ATTRS}>${inner.trim()}</symbol>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" id="hoa-icons" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${symbols}</svg>`;
}

export function injectSprite() {
  if (typeof document === 'undefined' || document.getElementById('hoa-icons')) return;
  document.body.insertAdjacentHTML('afterbegin', spriteSvg());
}

export function ico(name, cls = 'ico') {
  if (!ICONS[name]) return '';
  return `<svg class="${cls}" ${SVG_ATTRS} aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

export function starHTML(n, { sizeClass = 'star-ico' } = {}) {
  const on = ico('star', `${sizeClass} on`);
  const off = ico('star', `${sizeClass} off`);
  return on.repeat(n) + off.repeat(5 - n);
}

function svgDataURL(name, { color = '#f3cc6b', size = 64, fill = 'none' } = {}) {
  const inner = ICONS[name];
  if (!inner) return '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ${BOX} fill="${fill}" stroke="${color}" ${STROKE} color="${color}">${inner}</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

const imgCache = new Map();
export function iconImage(name, opts = {}) {
  const key = `${name}|${opts.color || ''}|${opts.size || ''}|${opts.fill || ''}`;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = new Promise((res) => {
    const src = svgDataURL(name, opts);
    if (!src) { res(null); return; }
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
  imgCache.set(key, p);
  return p;
}
