// In-app browsers (KakaoTalk, Instagram, Facebook, LINE, NAVER, Band, Android WebViews …) cannot create or use
// passkeys: the WebView has no webcredentials association with pollreal.com, so sign-up fails at "Create passkey"
// (2026-11-04: every friend who opened the KakaoTalk link hit this). We show a banner with a way out, and send
// KakaoTalk straight to the phone's browser on the pages that need a passkey.

export type InApp = { app: string; os: 'ios' | 'android' | 'other'; openUrl: string | null }

export function inAppOf(ua: string | undefined, url: string): InApp | null {
  if (!ua) return null
  const os = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'other'
  const app = /KAKAOTALK/i.test(ua)
    ? 'kakaotalk'
    : /Instagram/i.test(ua)
      ? 'instagram'
      : /FBAN|FBAV|FB_IAB|FB4A/i.test(ua)
        ? 'facebook'
        : /\bLine\//i.test(ua)
          ? 'line'
          : /NAVER\(inapp|NAVER\//i.test(ua)
            ? 'naver'
            : /BAND\//i.test(ua)
              ? 'band'
              : /DaumApps/i.test(ua)
                ? 'daum'
                : os === 'android' && /; wv\)/.test(ua)
                  ? 'webview'
                  : null
  if (!app) return null
  const u = new URL(url)
  u.protocol = 'https:'
  let openUrl: string | null = null
  if (app === 'kakaotalk') openUrl = `kakaotalk://web/openExternal?url=${encodeURIComponent(u.toString())}`
  else if (os === 'android') openUrl = `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;action=android.intent.action.VIEW;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`
  return { app, os, openUrl }
}
