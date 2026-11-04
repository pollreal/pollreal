import type { PropsWithChildren } from 'hono/jsx'
import { APP_JS_VERSION, CSS_VERSION } from '../assets'
import { BRAND, TURNSTILE_SCRIPT } from '../config'
import type { Member } from '../env'
import type { InApp } from '../lib/inapp'
import { LANGS, LANG_NAMES, type Lang, href, tr } from '../i18n'

export type LayoutProps = {
  title: string
  description?: string
  canonicalPath?: string // path without the language prefix; both language versions are linked (hreflang)
  noindex?: boolean
  refresh?: number // seconds — the poll page reloads itself while its AI cards are being written
  botScript?: boolean // the bot-check widget script — only on pages with a protected form (step 7)
  recaptcha?: { mode: 'enterprise' | 'v2'; siteKey: string } | null // Google reCAPTCHA for Firebase phone auth — phone step only
  ogImage?: string // absolute URL of the result card image
  member: Member | null
  unread?: number // operator notices not yet seen on My page — shown as "(n)" next to the link
  dev: boolean
  inApp?: InApp | null // in-app browser (KakaoTalk …): passkeys do not work there — banner + way out
  autoExternal?: boolean // pages that need a passkey: KakaoTalk opens the phone's browser by itself
  lang: Lang
  origin: string
  path: string // current path without the language prefix (for the language switch)
  wide?: boolean // home and list pages use the full 1200 px frame (Stitch layout); reading pages stay at 880 px
}

export function Layout(p: PropsWithChildren<LayoutProps>) {
  const t = tr(p.lang)
  const fullTitle = p.title === BRAND ? t.homeTitleDefault : `${p.title} | ${BRAND}`
  const canonical = p.canonicalPath !== undefined ? `${p.origin}${href(p.lang, p.canonicalPath)}` : undefined
  return (
    <html lang={p.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        {p.description && <meta name="description" content={p.description} />}
        {canonical && <link rel="canonical" href={canonical} />}
        {p.canonicalPath !== undefined && (
          <>
            {LANGS.map((l) => (
              <link rel="alternate" hreflang={l === 'zh' ? 'zh-Hans' : l} href={`${p.origin}${href(l, p.canonicalPath ?? '/')}`} />
            ))}
            <link rel="alternate" hreflang="x-default" href={`${p.origin}${href('en', p.canonicalPath)}`} />
          </>
        )}
        {p.noindex && <meta name="robots" content="noindex" />}
        {p.refresh && <meta http-equiv="refresh" content={String(p.refresh)} />}
        <meta property="og:site_name" content={BRAND} />
        <meta property="og:title" content={fullTitle} />
        {p.description && <meta property="og:description" content={p.description} />}
        {canonical && <meta property="og:url" content={canonical} />}
        {p.ogImage && (
          <>
            <meta property="og:image" content={p.ogImage} />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta name="twitter:card" content="summary_large_image" />
          </>
        )}
        <link rel="stylesheet" href={`/assets/app.css?v=${CSS_VERSION}`} />
        <script src={`/assets/app.js?v=${APP_JS_VERSION}`} defer></script>
        {p.botScript && <script src={TURNSTILE_SCRIPT} async defer></script>}
        {p.recaptcha?.mode === 'v2' && <script src="https://www.google.com/recaptcha/api.js?render=explicit" async defer></script>}
        {p.recaptcha?.mode === 'enterprise' && <script src={`https://www.google.com/recaptcha/enterprise.js?render=${encodeURIComponent(p.recaptcha.siteKey)}`} async defer></script>}
      </head>
      <body>
        {p.dev && <div class="devbar">{t.devBar}</div>}
        <header class="top">
          <div class="wrap bar">
          <a class="logo" href={href(p.lang, '/')}>
            {BRAND}
          </a>
          <nav>
            <a href={href(p.lang, '/new')}>{t.navCreate}</a>
            <a href={href(p.lang, '/rank')}>{t.navRank}</a>
            <a href={href(p.lang, '/board')}>{t.navBoard}</a>
            {p.member ? (
              <a href={href(p.lang, '/me')}>
                {t.navMe}
                {p.unread ? ` (${p.unread})` : ''}
              </a>
            ) : (
              <a href={href(p.lang, '/login')}>{t.navLogin}</a>
            )}
            <details class="langs">
              <summary aria-label={t.language}>{LANG_NAMES[p.lang]}</summary>
              <ul>
                {LANGS.map((l) => (
                  <li>
                    <a href={href(l, p.path)} hreflang={l} lang={l} aria-current={l === p.lang ? 'true' : undefined}>
                      {LANG_NAMES[l]}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
          </div>
        </header>
        {p.inApp && (
          <div class="inapp" data-auto={p.autoExternal && p.inApp.openUrl ? p.inApp.openUrl : undefined}>
            <div class="wrap">
              <p>{t.inAppText}</p>
              {p.inApp.openUrl ? (
                <a class="btn" href={p.inApp.openUrl}>
                  {t.inAppOpen}
                </a>
              ) : (
                <p class="note">{t.inAppIos}</p>
              )}
            </div>
          </div>
        )}
        <main class={p.wide ? 'wide' : undefined}>{p.children}</main>
        <footer class="foot">
          <div class="wrap">
            <p class="trust">{t.footTrust}</p>
            <p class="links">
              <a href={href(p.lang, '/terms')}>{t.footTerms}</a>
              <a href={href(p.lang, '/privacy')}>
                <strong>{t.footPrivacy}</strong>
              </a>
              <a href={href(p.lang, '/policy')}>{t.footPolicy}</a>
              <a href={href(p.lang, '/ai')}>{t.footAi}</a>
            </p>
            {/* No business line while nothing is sold (operator 2026-10-29); the operator is named in the privacy policy. */}
          </div>
        </footer>
      </body>
    </html>
  )
}
