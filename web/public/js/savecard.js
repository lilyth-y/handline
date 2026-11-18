// Result-card save helpers: in-app WebViews (KakaoTalk, etc.) often cannot
// <a download> a blob, and navigator.share({files}) may throw AbortError
// without actually saving — so callers should skip file-share in those UAs
// and show a long-press modal plus an "open in external browser" link.

export function isInApp(ua) {
  return /KAKAOTALK|NAVER\(inapp|; wv\)|Instagram|FBAN|FBAV|Line\//i.test(ua || '');
}
export function isIOS(ua) {
  return /iPhone|iPad|iPod/i.test(ua || '');
}
export function isAndroid(ua) {
  return /Android/i.test(ua || '');
}
export function isKakao(ua) {
  return /KAKAOTALK/i.test(ua || '');
}
export function canUseAnchorDownload(ua) {
  return !isInApp(ua) && !isIOS(ua);
}
export function shouldSkipFileShare(ua) {
  return isInApp(ua);
}

export function externalBrowserHref(httpsUrl, ua) {
  if (isKakao(ua)) return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(httpsUrl);
  if (isAndroid(ua)) {
    const u = new URL(httpsUrl);
    const fallback = encodeURIComponent(httpsUrl);
    return `intent://${u.host}${u.pathname}${u.search}${u.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }
  return httpsUrl;
}

export function triggerDownload(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 4000);
}

export async function canShareFiles(file) {
  if (!file || !navigator.canShare || !navigator.share) return false;
  try { return !!navigator.canShare({ files: [file] }); } catch { return false; }
}
