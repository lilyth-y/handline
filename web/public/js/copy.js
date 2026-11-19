// 호아 도사 말투 템플릿 (LLM 없이). 근거는 interpret 결과의 유형 / 별점 / 이유 id 만 사용.
// 문구는 모두 js/i18n/<언어>.js 사전에 있다 (키: type.<id>.* / luck.<k> / reason.<id> / closing.* / short.*).
import { t } from './i18n/runtime.js';

export const LUCK_EMOJI = { wealth: '💰', love: '💕', health: '🌿', career: '🏆' };
export const ANALYZE_COUNT = 5;
export const analyzeLine = (i) => t(`ana.${i}`);

export const typeName = (id) => t(`type.${id}.name`);
export const typeKeyword = (id) => t(`type.${id}.keyword`);          // '재물·실속' 처럼 · 로 구분 (화면에서는 #재물 #실속)
export const typeElement = (id) => t(`type.${id}.element`);
export const typeCopy = (id) => ({ intro: t(`type.${id}.intro`), charm: t(`type.${id}.charm`) });
export const hashtags = (id) => `#${typeKeyword(id).replace('·', ' #')}`;
export const luckLabel = (k) => t(`luck.${k}`);
export const reasonText = (id) => t(`reason.${id}`);

export const shortFor = (luck) => t(`short.${luck.stars >= 1 && luck.stars <= 5 ? luck.stars : 3}`);
export function readingFor(key, luck) {
  const reason = reasonText(luck.reasons[0]);
  const n = luck.stars >= 1 && luck.stars <= 5 ? luck.stars : 3;
  const idx = (reason.length + key.length) % 2;   // deterministic per result
  return t('reading.fmt', { reason, closing: t(`closing.${n}.${idx}`) });
}
export const TYPE_EMOJI = {
  gold: '🪙', fire: '🔥', moon: '🌙', star: '⭐', wind: '🍃', sun: '☀️',
  cloud: '☁️', flower: '🌸', rock: '🪨', wave: '🌊', lightning: '⚡', galaxy: '🌌',
};
export const APP_HOST = 'hoadosa.com';
