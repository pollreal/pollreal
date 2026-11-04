// Shared view helpers (kept apart so pages, board and account views do not import each other).
import { type Lang, type Msg, href, msgText, tr } from '../i18n'

// Canonical poll URL; the slug is percent-encoded so redirects and sitemaps stay plain ASCII.
export const pollPath = (p: { id: string; slug: string }, lang: Lang = 'en') => href(lang, `/v/${p.id}/${encodeURIComponent(p.slug)}`)

export const loginPath = (lang: Lang, next: string) => href(lang, `/login?next=${encodeURIComponent(next)}`)

export const reportPath = (lang: Lang, type: string, id: string) => href(lang, `/report?type=${type}&id=${id}`)

export function Errors(p: { lang: Lang; errors?: Msg[] }) {
  if (!p.errors?.length) return <></>
  return (
    <ul class="errors">
      {p.errors.map((e) => (
        <li>{msgText(p.lang, e)}</li>
      ))}
    </ul>
  )
}

// Bot-check widget. Inside a <form> it adds the hidden `cf-turnstile-response` field by itself.
// `siteKey` null = production without keys: the form is shown but the server refuses it (fail closed).
export function BotCheck(p: { siteKey: string | null; action: string; lang: Lang }) {
  if (!p.siteKey) return <p class="warn">{tr(p.lang).bot.not_configured}</p>
  return (
    <div class="botcheck">
      <div class="cf-turnstile" data-sitekey={p.siteKey} data-action={p.action} data-language={p.lang === 'zh' ? 'zh-cn' : p.lang === 'hi' ? 'auto' : p.lang} data-theme="light" data-size="flexible"></div>
      <noscript>
        <p class="note">{tr(p.lang).bot.missing}</p>
      </noscript>
    </div>
  )
}

// Status line the page script writes into (passkey prompts, errors).
export const Status = () => <p class="status" data-status role="status" aria-live="polite"></p>
