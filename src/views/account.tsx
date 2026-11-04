// Sign-in / sign-up (design v0.2 §2), my page, maker claims.
import type { Member } from '../env'
import { type Lang, type Msg, href, msgText, tr } from '../i18n'
import type { PostRow } from '../lib/board'
import type { CandRow, NoticeRow, PollSummary } from '../lib/db'
import { candidateName, pollTitle } from '../lib/text'
import { whenText } from '../lib/time'
import type { ClaimRow } from '../lib/viral'
import { PostList } from './board'
import { BotCheck, Status, pollPath } from './common'
import { PollList } from './pages'

const ErrorLine = (p: { lang: Lang; error?: Msg | null }) => (p.error ? <p class="warn">{msgText(p.lang, p.error)}</p> : <></>)

// The page script reads these to show messages in the page language.
const passkeyMsgs = (lang: Lang) => {
  const t = tr(lang)
  return { 'data-msg-working': t.passkeyWorking, 'data-msg-cancelled': t.passkeyCancelled, 'data-msg-unsupported': t.passkeyUnsupported }
}

export function LoginPage(p: {
  lang: Lang
  next: string
  countries: { code: string; label: string }[]
  country: string
  phone?: string
  error?: Msg | null
  botSiteKey: string | null
  recaptchaSiteKey?: string | null
  recaptchaMode?: 'enterprise' | 'v2' | null
}) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.loginTitle}</h1>
      <section class="passkey-login" data-next={p.next} {...passkeyMsgs(p.lang)}>
        <p>
          <button type="button" data-passkey-login disabled>
            {t.loginPasskey}
          </button>
        </p>
        <p class="note">{t.loginPasskeyHelp}</p>
        <Status />
      </section>
      <section>
        <h2>{t.loginOr}</h2>
        <p class="note">{t.phoneHelp}</p>
        <ErrorLine lang={p.lang} error={p.error} />
        <form method="post" action={href(p.lang, '/auth/phone')} class="stack" data-recaptcha={p.recaptchaSiteKey ?? undefined} data-rcmode={p.recaptchaMode ?? undefined}>
          <label>
            {t.country}
            <select name="country" required>
              {p.countries.map((c) => (
                <option value={c.code} selected={c.code === p.country}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.phoneNumber}
            <input name="phone" type="tel" inputmode="tel" autocomplete="tel-national" value={p.phone ?? ''} placeholder={t.phonePh} maxlength={24} required />
          </label>
          <input type="hidden" name="next" value={p.next} />
          <BotCheck siteKey={p.botSiteKey} action="phone" lang={p.lang} />
          {p.recaptchaSiteKey && (
            <>
              <input type="hidden" name="recaptcha" value="" />
              <input type="hidden" name="rcmode" value={p.recaptchaMode === 'enterprise' ? 'e' : '2'} />
              <div class="recaptcha"></div>
            </>
          )}
          <button type="submit">{t.sendCode}</button>
        </form>
      </section>
    </>
  )
}

export function CodePage(p: { lang: Lang; hint: string; devCode?: string | null; error?: Msg | null }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.codeTitle}</h1>
      <p>{t.codeSentTo(p.hint)}</p>
      {p.devCode && (
        <p class="flash" data-dev-code={p.devCode}>
          {t.devCode(p.devCode)}
        </p>
      )}
      <ErrorLine lang={p.lang} error={p.error} />
      <form method="post" action={href(p.lang, '/auth/code')} class="stack">
        <label>
          {t.code}
          <input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength={6} required />
        </label>
        <button type="submit">{t.confirm}</button>
      </form>
      <p>
        <a href={href(p.lang, '/login')}>{t.startOver}</a>
      </p>
    </>
  )
}

export function ProfilePage(p: { lang: Lang; years: number[]; birthYear?: number | null; gender?: string | null; error?: Msg | null }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.profileTitle}</h1>
      <p class="note">{t.profileHelp}</p>
      <ErrorLine lang={p.lang} error={p.error} />
      <form method="post" action={href(p.lang, '/join/profile')} class="stack">
        <label>
          {t.birthYear}
          <select name="birth_year" required>
            <option value="">{t.choose}</option>
            {p.years.map((y) => (
              <option value={String(y)} selected={p.birthYear === y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>{t.genderLabel}</legend>
          <label class="row">
            <input type="radio" name="gender" value="M" required checked={p.gender === 'M'} /> {t.male}
          </label>{' '}
          <label class="row">
            <input type="radio" name="gender" value="F" checked={p.gender === 'F'} /> {t.female}
          </label>
        </fieldset>
        <label class="row">
          <input type="checkbox" name="agree" value="yes" required /> <a href={href(p.lang, '/terms')}>{t.footTerms}</a> ·{' '}
          <a href={href(p.lang, '/privacy')}>{t.footPrivacy}</a> — {t.agree}
        </label>
        <button type="submit">{t.next}</button>
      </form>
    </>
  )
}

export function PasskeyPage(p: { lang: Lang }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.passkeyTitle}</h1>
      <p>{t.passkeyHelp}</p>
      <section data-passkey-register-section {...passkeyMsgs(p.lang)}>
        <p>
          <button type="button" data-passkey-register disabled>
            {t.passkeyCreate}
          </button>
        </p>
        <noscript>
          <p class="warn">{t.votingNeedsJs}</p>
        </noscript>
        <Status />
      </section>
    </>
  )
}

export function MePage(p: {
  lang: Lang
  member: Member
  passkeys: number
  inviteUrl: string | null
  invited: number
  claims: ClaimRow[]
  notices: NoticeRow[]
  polls: PollSummary[]
  votes: { poll: PollSummary; choice: CandRow }[]
  posts: PostRow[]
  now: number
  flash?: string
}) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.meTitle}</h1>
      {p.flash && <p class="flash">{p.flash}</p>}
      <p>{t.meWho(p.member.nickname ?? '', p.member.phone_country ?? '')}</p>
      {/* Operator notices (community rules §7): newest first; the body is shown exactly as the operator wrote it. */}
      <section class="notices">
        <h2>{t.notices}</h2>
        {p.notices.length ? (
          <ul class="plain">
            {p.notices.map((n) => (
              <li>
                <span class="badge">{t.noticeKind[n.kind] ?? n.kind}</span> <span class="note">{whenText(p.lang, n.created_at)}</span>
                <p>{n.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty">{t.noticesNone}</p>
        )}
      </section>
      <section data-passkey-add-section {...passkeyMsgs(p.lang)}>
        <h2>{t.passkeys}</h2>
        <p class="note">{t.passkeysCount(p.passkeys)}</p>
        <p>
          <button type="button" class="ghost" data-passkey-add disabled>
            {t.passkeyAdd}
          </button>
        </p>
        <Status />
      </section>
      {p.inviteUrl && (
        <section>
          <h2>{t.invite}</h2>
          <p class="note">{t.inviteHelp}</p>
          <p>
            <code>{p.inviteUrl}</code>{' '}
            <button type="button" class="ghost" data-copy={p.inviteUrl} data-copied={t.copied}>
              {t.shareCopy}
            </button>
          </p>
          <p class="note">{t.invited(p.invited)}</p>
        </section>
      )}
      {p.claims.length > 0 && (
        <section>
          <h2>{t.makerSection}</h2>
          <ul class="plain">
            {p.claims.map((c) => (
              <li>
                {c.maker} {c.product} · {c.email_domain} · {t.claimStatus[c.status] ?? c.status}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>{t.myPolls}</h2>
        <PollList lang={p.lang} polls={p.polls} now={p.now} empty={t.none} />
      </section>
      <section>
        <h2>{t.myVotes}</h2>
        {p.votes.length ? (
          <ul class="plain">
            {p.votes.map((v) => (
              <li>
                <a href={pollPath(v.poll, p.lang)}>{pollTitle(v.poll.candidates)}</a> → {candidateName(v.choice)}
              </li>
            ))}
          </ul>
        ) : (
          <p class="empty">{t.none}</p>
        )}
      </section>
      <section>
        <h2>{t.myPosts}</h2>
        <PostList lang={p.lang} posts={p.posts} empty={t.none} />
      </section>
      <form method="post" action={href(p.lang, '/logout')}>
        <button type="submit" class="ghost">
          {t.logout}
        </button>
      </form>
      <section class="danger">
        <h2>{t.withdraw}</h2>
        <p>{t.withdrawText}</p>
        <form method="post" action={href(p.lang, '/me/withdraw')} class="stack">
          <label class="row">
            <input type="checkbox" name="confirm" value="yes" required /> {t.withdrawConfirm}
          </label>
          <button type="submit" class="ghost">
            {t.withdrawButton}
          </button>
        </form>
      </section>
    </>
  )
}

export function ClaimPage(p: { lang: Lang; name: string; cardId: string; domain: string | null; error?: string; email?: string }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.claimTitle(p.name)}</h1>
      {!p.domain ? (
        <p class="warn">{t.claimNoDomain}</p>
      ) : (
        <>
          <p class="note">{t.claimHelp(p.domain)}</p>
          {p.error && <p class="warn">{p.error}</p>}
          <form method="post" action={href(p.lang, `/maker/claim/${p.cardId}`)} class="stack">
            <label>
              {t.claimEmail}
              <input name="email" type="email" value={p.email ?? ''} placeholder={`you@${p.domain}`} maxlength={120} required />
            </label>
            <button type="submit">{t.claimSend}</button>
          </form>
        </>
      )}
    </>
  )
}
