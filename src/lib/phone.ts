// Phone number step of sign-up / sign-in: one number = one account, internet and virtual numbers refused.
// Order of checks: numbering plan (free, offline; internet/VoIP ranges refused) -> rate limits -> Google reCAPTCHA
// (+ SMS toll-fraud score when enforced) -> send. The number itself lives only in phone_flows until its code is confirmed; afterwards only its HMAC remains.
import { type CountryCode, getCountries, getCountryCallingCode, parsePhoneNumberFromString } from 'libphonenumber-js/max'
import {
  ACCEPTED_NUMBER_TYPES,
  OTP_CAPS,
  OTP_PER_IP_PER_HOUR,
  OTP_PER_PHONE_PER_HOUR,
} from '../config'
import { type Bindings, isDev } from '../env'
import type { Lang } from '../i18n'
import { hmacHex, safeEqual } from './crypto'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export type ParsedPhone = { e164: string; country: string; hint: string }

export function parsePhone(country: string, input: string): ParsedPhone | 'invalid' | 'type' {
  const cc = (getCountries() as string[]).includes(country) ? (country as CountryCode) : undefined
  const raw = input.replace(/[^\d+]/g, '')
  if (!cc || raw.length < 4 || raw.length > 20) return 'invalid'
  const p = parsePhoneNumberFromString(raw, cc)
  if (!p || !p.isValid() || !p.country) return 'invalid'
  // The number must belong to the chosen country (no "+1…" typed under Korea and the like).
  if (p.country !== cc && getCountryCallingCode(cc) !== p.countryCallingCode) return 'invalid'
  const type = p.getType()
  if (!type || !ACCEPTED_NUMBER_TYPES.includes(type)) return 'type'
  const e164 = p.number as string
  return { e164, country: p.country, hint: `+${p.countryCallingCode} •••• ${e164.slice(-4)}` }
}

export const phoneHash = (pepper: string, e164: string) => hmacHex(pepper, `phone:${e164}`)

// Country picker: the visitor's country first, then everything else by name in the page language.
export function countryOptions(lang: Lang, first: string | null) {
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames([lang], { type: 'region' })
  } catch {
    names = null
  }
  const all = (getCountries() as string[]).map((code) => ({
    code,
    label: `${names?.of(code) ?? code} (+${getCountryCallingCode(code as CountryCode)})`,
  }))
  all.sort((a, b) => a.label.localeCompare(b.label, lang))
  const top = first && all.find((c) => c.code === first)
  return top ? [top, ...all.filter((c) => c.code !== first)] : all
}

// ---- rate limits (otp_log) ----

export type LimitHit = 'limitPhone' | 'limitIp' | 'limitSite' | null

// asn_key rides in the country column as "KR/AS4766" for the per-provider cap (no extra personal data).
const providerKey = (country: string, asn: number | undefined) => `${country}/AS${asn ?? 0}`

// Reserve a send in one atomic statement (no race between check and send): the row is written as 'sent' only when every
// limit still has room; the caller turns it into 'send_failed' if the SMS does not go out. Every attempt from a network
// counts toward that network's hourly allowance.
export async function reserveSend(db: D1Database, o: { phoneH: string; ipH: string; country: string; asn?: number; now: number }): Promise<{ id: number } | { hit: LimitHit }> {
  const r = await db
    .prepare(
      `INSERT INTO otp_log (phone_hash, ip_hash, country, outcome, created_at)
       SELECT ?1, ?2, ?3, 'sent', ?4
       WHERE (SELECT COUNT(*) FROM otp_log WHERE phone_hash = ?1 AND outcome = 'sent' AND created_at >= ?5) < ?7
         AND (SELECT COUNT(*) FROM otp_log WHERE ip_hash = ?2 AND outcome = 'sent' AND created_at >= ?5) < ?8
         AND (SELECT COUNT(*) FROM otp_log WHERE ip_hash = ?2 AND created_at >= ?5) < ?8 * 2
         AND (SELECT COUNT(*) FROM otp_log WHERE outcome = 'sent' AND created_at >= ?6) < ?9
         AND (SELECT COUNT(*) FROM otp_log WHERE substr(country, 1, 2) = substr(?3, 1, 2) AND outcome = 'sent' AND created_at >= ?6) < ?10
         AND (SELECT COUNT(*) FROM otp_log WHERE country = ?3 AND outcome = 'sent' AND created_at >= ?6) < ?11
       RETURNING id`,
    )
    .bind(o.phoneH, o.ipH, o.country, o.now, o.now - HOUR, o.now - DAY, OTP_PER_PHONE_PER_HOUR, OTP_PER_IP_PER_HOUR, OTP_CAPS.daily, OTP_CAPS.country, OTP_CAPS.asn)
    .first<{ id: number }>()
  if (r) return { id: r.id }
  const why = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM otp_log WHERE phone_hash = ?1 AND outcome = 'sent' AND created_at >= ?2) AS phone_n,
              (SELECT COUNT(*) FROM otp_log WHERE ip_hash = ?3 AND created_at >= ?2) AS ip_all,
              (SELECT COUNT(*) FROM otp_log WHERE ip_hash = ?3 AND outcome = 'sent' AND created_at >= ?2) AS ip_n`,
    )
    .bind(o.phoneH, o.now - HOUR, o.ipH)
    .first<{ phone_n: number; ip_all: number; ip_n: number }>()
  if (why && why.phone_n >= OTP_PER_PHONE_PER_HOUR) return { hit: 'limitPhone' }
  if (why && (why.ip_n >= OTP_PER_IP_PER_HOUR || why.ip_all >= OTP_PER_IP_PER_HOUR * 2)) return { hit: 'limitIp' }
  return { hit: 'limitSite' }
}

export const sendKey = providerKey

export const logOtp = (db: D1Database, phoneH: string, ipH: string, country: string, outcome: string, now: number) =>
  db.prepare('INSERT INTO otp_log (phone_hash, ip_hash, country, outcome, created_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(phoneH, ipH, country, outcome, now).run()

export const markSendFailed = (db: D1Database, id: number) => db.prepare("UPDATE otp_log SET outcome = 'send_failed' WHERE id = ?1").bind(id).run()

// ---- senders ----
// firebase = Google Identity Platform phone auth (sole provider since — Twilio removed 2026-11-04): the
// browser gets a Google reCAPTCHA token, our server asks Google to send the code and later checks it, then deletes the
// user record Google created (we keep only the hash). dev = code shown on screen, nothing sent.
// reCAPTCHA mode: when the project's phone reCAPTCHA enforcement is ENFORCE (SMS defense), the browser sends a
// reCAPTCHA Enterprise token and Google scores the number for SMS toll fraud before sending; otherwise the classic
// invisible reCAPTCHA v2 token is used. Switching the console setting back to OFF/AUDIT returns to v2 within minutes.

export type Sender = 'firebase' | 'dev'

export function senderOf(env: Bindings): Sender | null {
  if (env.SMS_PROVIDER === 'firebase' && env.FIREBASE_API_KEY) return 'firebase'
  return isDev(env) ? 'dev' : null
}

const GIT = 'https://identitytoolkit.googleapis.com/v1'
const GIT2 = 'https://identitytoolkit.googleapis.com/v2'

async function google(env: Bindings, path: string, body?: Record<string, unknown>, lang?: string, base = GIT) {
  const res = await fetch(`${base}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(env.FIREBASE_API_KEY ?? '')}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(lang ? { 'x-firebase-locale': lang } : {}),
      referer: `${(env.SITE_URL ?? 'https://pollreal.com').replace(/\/$/, '')}/`,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, data }
}

// Google's error code only (e.g. INVALID_CODE, CAPTCHA_CHECK_FAILED) — never the number or the key.
const googleError = (r: { status: number; data: Record<string, unknown> }) => `${r.status} ${String((r.data.error as { message?: string } | undefined)?.message ?? '').slice(0, 120)}`

export type Recaptcha = { mode: 'enterprise' | 'v2'; siteKey: string }

// The project's phone reCAPTCHA setup (public keys; cached per isolate for 5 minutes so a console change lands fast).
let rcCache: { value: Recaptcha | null; at: number } | null = null
export async function recaptchaSetup(env: Bindings): Promise<Recaptcha | null> {
  if (senderOf(env) !== 'firebase') return null
  if (rcCache && Date.now() - rcCache.at < 5 * 60 * 1000) return rcCache.value
  let value: Recaptcha | null = null
  try {
    const e = await google(env, 'recaptchaConfig?clientType=CLIENT_TYPE_WEB&version=RECAPTCHA_ENTERPRISE', undefined, undefined, GIT2)
    const key = typeof e.data.recaptchaKey === 'string' ? (e.data.recaptchaKey.split('/').pop() ?? null) : null
    const states = (e.data.recaptchaEnforcementState as { provider?: string; enforcementState?: string }[] | undefined) ?? []
    const phone = states.find((x) => x.provider === 'PHONE_PROVIDER')?.enforcementState
    if (key && phone === 'ENFORCE') value = { mode: 'enterprise', siteKey: key }
  } catch (err) {
    console.warn('recaptchaConfig failed', String(err))
  }
  if (!value) {
    try {
      const r = await google(env, 'recaptchaParams')
      const key = typeof r.data.recaptchaSiteKey === 'string' ? r.data.recaptchaSiteKey : null
      if (!key) console.warn('recaptchaParams refused', googleError(r))
      if (key) value = { mode: 'v2', siteKey: key }
    } catch (err) {
      console.warn('recaptchaParams failed', String(err))
    }
  }
  rcCache = { value, at: Date.now() }
  return value
}

// Launch check: does the key reach the project and is phone sign-in on? Free — nothing is sent.
export async function firebaseCheck(env: Bindings) {
  if (senderOf(env) !== 'firebase') return { sender: senderOf(env) }
  const rc = await recaptchaSetup(env)
  return { sender: 'firebase', recaptcha: rc ? 'ok' : 'FAILED', mode: rc?.mode ?? null }
}

const randomCode = () => {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] ?? 0
  return String(n % 1_000_000).padStart(6, '0')
}

export async function sendCode(
  env: Bindings,
  pepper: string,
  flowId: string,
  e164: string,
  lang: Lang,
  recaptchaToken = '',
  recaptchaMode: 'enterprise' | 'v2' = 'v2',
): Promise<{ ok: true; codeHash: string | null; session?: string; devCode?: string } | { ok: false; captcha?: boolean }> {
  const sender = senderOf(env)
  if (sender === 'firebase') {
    if (!recaptchaToken) return { ok: false, captcha: true }
    const body =
      recaptchaMode === 'enterprise'
        ? { phoneNumber: e164, captchaResponse: recaptchaToken, clientType: 'CLIENT_TYPE_WEB', recaptchaVersion: 'RECAPTCHA_ENTERPRISE' }
        : { phoneNumber: e164, recaptchaToken }
    try {
      const r = await google(env, 'accounts:sendVerificationCode', body, lang)
      const session = typeof r.data.sessionInfo === 'string' ? r.data.sessionInfo : null
      if (!session) {
        console.warn('firebase send refused', recaptchaMode, googleError(r))
        return { ok: false, captcha: /CAPTCHA/i.test(googleError(r)) }
      }
      return { ok: true, codeHash: null, session }
    } catch (e) {
      console.warn('firebase send failed', String(e))
      return { ok: false }
    }
  }
  if (sender === 'dev') {
    const code = randomCode()
    return { ok: true, codeHash: await hmacHex(pepper, `otp:${flowId}:${code}`), devCode: code }
  }
  return { ok: false }
}

export async function codeMatches(
  env: Bindings,
  pepper: string,
  flow: { id: string; phone_e164: string | null; code_hash: string | null; provider_session?: string | null },
  code: string,
) {
  if (!/^\d{6}$/.test(code)) return false
  if (flow.code_hash) return safeEqual(flow.code_hash, await hmacHex(pepper, `otp:${flow.id}:${code}`))
  if (!flow.provider_session || senderOf(env) !== 'firebase' || !flow.phone_e164) return false
  try {
    const r = await google(env, 'accounts:signInWithPhoneNumber', { sessionInfo: flow.provider_session, code })
    const ok = r.status < 300 && r.data.phoneNumber === flow.phone_e164
    if (r.status >= 300) console.warn('firebase check refused', googleError(r))
    // Google created a user record for the number: delete it at once (privacy policy — we keep only the hash).
    if (typeof r.data.idToken === 'string') await google(env, 'accounts:delete', { idToken: r.data.idToken }).catch(() => null)
    return ok
  } catch (e) {
    console.warn('firebase check failed', String(e))
    return false
  }
}
