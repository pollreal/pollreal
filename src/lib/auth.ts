// Accounts (design v0.2 §2): phone number once -> code -> birth year + gender -> passkey -> member.
// Sessions: a random token in an HttpOnly cookie, only its SHA-256 in the database.
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { INVITE_COOKIE_DAYS, MIN_AGE_BY_COUNTRY, MIN_AGE_DEFAULT, OLDEST_BIRTH_YEAR, OTP_MAX_ATTEMPTS, OTP_TTL_MS, PHONE_FLOW_COOKIE_MIN, SESSION_DAYS } from '../config'
import { type AppEnv, type Member, isDev, pepperOf } from '../env'
import type { Lang, Msg } from '../i18n'
import { hmacHex, randomId, randomToken, sha256Hex, signPayload, verifyPayload } from './crypto'
import * as db from './db'
import { ipKey } from './device'
import { whenText } from './time'

const SESSION_COOKIE = 'vs_sid'
const FLOW_COOKIE = 'vs_flow'
const INVITE_COOKIE = 'vs_inv'

type Ctx = Context<AppEnv>

const cookieOpts = (c: Ctx, maxAge: number) => ({ httpOnly: true, secure: !isDev(c.env), sameSite: 'Lax', path: '/', maxAge }) as const

// Only same-site paths are allowed as a post-login destination (no open redirect).
// Browsers drop tabs/newlines in URLs ("/\t/evil.com" becomes "//evil.com"), so control characters and backslashes are refused.
export const safeNext = (next: unknown) =>
  typeof next === 'string' && next.length < 300 && /^\/(?![/\\])[^\x00-\x1f\x7f\\]*$/.test(next) ? next : '/'

// The one rule for "may this member use the Service": active, or suspended with an end date that has passed (the cron
// sets such rows back to 'active' within minutes; the member must not have to wait for it). A suspension without an
// end date and a withdrawn account are not active.
export const memberActive = (m: Pick<Member, 'status' | 'suspended_until'>, now: number) =>
  m.status === 'active' || (m.status === 'suspended' && m.suspended_until != null && m.suspended_until <= now)

// Sign-in refusal for a member who is not active: with the end date when there is one (community rules §7).
export const restrictionMsg = (m: Pick<Member, 'status' | 'suspended_until'>, lang: Lang): Msg =>
  m.status === 'suspended' && m.suspended_until != null ? { k: 'e.suspendedUntil', p: [whenText(lang, m.suspended_until)] } : { k: 'e.suspended' }

export async function loadMember(c: Ctx, now: number) {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) return null
  const m = await db.memberBySession(c.env.DB, await sha256Hex(token), now)
  return m && memberActive(m, now) ? m : null
}

export async function startSession(c: Ctx, memberId: string, now: number) {
  const token = randomToken()
  const maxAge = SESSION_DAYS * 24 * 60 * 60
  await db.createSession(c.env.DB, await sha256Hex(token), memberId, now, now + maxAge * 1000)
  setCookie(c, SESSION_COOKIE, token, cookieOpts(c, maxAge))
}

export async function endSession(c: Ctx) {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await db.deleteSession(c.env.DB, await sha256Hex(token))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

// ---- phone flow (the cookie carries only the signed flow id) ----

export type FlowRow = {
  id: string
  phone_e164: string | null
  phone_hash: string
  phone_country: string
  phone_hint: string
  code_hash: string | null
  provider_session: string | null
  attempts: number
  verified_at: number | null
  birth_year: number | null
  gender: 'M' | 'F' | null
  lang: Lang
  next: string
  invited_by: string | null
  user_handle: string | null
  expires_at: number
}

export async function setFlowCookie(c: Ctx, flowId: string) {
  setCookie(c, FLOW_COOKIE, await signPayload(pepperOf(c.env), { f: flowId }), cookieOpts(c, PHONE_FLOW_COOKIE_MIN * 60))
}

export async function currentFlow(c: Ctx, now: number): Promise<FlowRow | null> {
  const p = await verifyPayload<{ f: string }>(pepperOf(c.env), getCookie(c, FLOW_COOKIE))
  if (!p?.f) return null
  const row = await c.env.DB.prepare('SELECT * FROM phone_flows WHERE id = ?1').bind(p.f).first<FlowRow>()
  return row && row.expires_at > now ? row : null
}

export async function endFlow(c: Ctx, flowId: string) {
  await c.env.DB.prepare('DELETE FROM phone_flows WHERE id = ?1').bind(flowId).run()
  deleteCookie(c, FLOW_COOKIE, { path: '/' })
}

export async function createFlow(
  c: Ctx,
  f: { id: string; e164: string; phoneHash: string; country: string; hint: string; codeHash: string | null; session?: string | null; lang: Lang; next: string; invitedBy: string | null },
  now: number,
) {
  await c.env.DB.prepare(
    `INSERT INTO phone_flows (id, phone_e164, phone_hash, phone_country, phone_hint, code_hash, provider_session, lang, next, invited_by, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?12, ?7, ?8, ?9, ?10, ?11)`,
  )
    .bind(f.id, f.e164, f.phoneHash, f.country, f.hint, f.codeHash, f.lang, f.next, f.invitedBy, now, now + OTP_TTL_MS, f.session ?? null)
    .run()
  await setFlowCookie(c, f.id)
}

export const newFlowId = () => randomId(16)

// The newest open flow for a number started in the last two minutes, waiting up to 3 s for a sibling request still
// writing it. Used when a repeat submit finds its bot check already spent by the first one (double tap, 2026-11-02).
export async function recentFlowFor(c: Ctx, phoneHash: string, now: number): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const row = await c.env.DB.prepare(
      'SELECT id FROM phone_flows WHERE phone_hash = ?1 AND verified_at IS NULL AND created_at > ?2 AND expires_at > ?3 ORDER BY created_at DESC LIMIT 1',
    )
      .bind(phoneHash, now - 2 * 60 * 1000, Date.now())
      .first<{ id: string }>()
    if (row) return row.id
    if (i < 4) await new Promise((r) => setTimeout(r, 750))
  }
  return null
}

// Every try spends one attempt before the code is compared (atomic, so parallel requests cannot test extra codes).
// null = no attempts left (the flow is closed).
export async function spendAttempt(c: Ctx, flow: FlowRow): Promise<number | null> {
  const r = await c.env.DB.prepare('UPDATE phone_flows SET attempts = attempts + 1 WHERE id = ?1 AND attempts < ?2 RETURNING attempts')
    .bind(flow.id, OTP_MAX_ATTEMPTS)
    .first<{ attempts: number }>()
  if (!r) await endFlow(c, flow.id)
  return r?.attempts ?? null
}

export async function wrongCode(c: Ctx, flow: FlowRow, used: number): Promise<'codeWrong' | 'codeTooMany'> {
  if (used >= OTP_MAX_ATTEMPTS) {
    await endFlow(c, flow.id)
    return 'codeTooMany'
  }
  return 'codeWrong'
}

// Code confirmed: drop the number itself and keep 30 more minutes for the profile and passkey steps.
export const markVerified = (c: Ctx, flowId: string, now: number) =>
  c.env.DB.prepare('UPDATE phone_flows SET verified_at = ?2, phone_e164 = NULL, code_hash = NULL, expires_at = ?3 WHERE id = ?1')
    .bind(flowId, now, now + PHONE_FLOW_COOKIE_MIN * 60 * 1000)
    .run()

export const minAgeFor = (country: string) => MIN_AGE_BY_COUNTRY[country] ?? MIN_AGE_DEFAULT

// Self-reported. Only the birth year is asked: the youngest possible age in that year must reach the minimum.
export function profileError(country: string, birthYear: number, gender: string, agreed: boolean, now: number): Msg | null {
  const year = new Date(now).getUTCFullYear()
  if (!Number.isInteger(birthYear) || birthYear < OLDEST_BIRTH_YEAR || birthYear > year) return { k: 'e.birthYear' }
  if (gender !== 'M' && gender !== 'F') return { k: 'e.gender' }
  if (!agreed) return { k: 'e.agree' }
  const min = minAgeFor(country)
  if (year - birthYear - 1 < min) return { k: 'e.age', p: [min] }
  return null
}

// ---- invites ----

export async function setInviteCookie(c: Ctx, inviterId: string) {
  setCookie(c, INVITE_COOKIE, await signPayload(pepperOf(c.env), { i: inviterId }), cookieOpts(c, INVITE_COOKIE_DAYS * 24 * 60 * 60))
}

export async function inviterFromCookie(c: Ctx) {
  const p = await verifyPayload<{ i: string }>(pepperOf(c.env), getCookie(c, INVITE_COOKIE))
  return p?.i ?? null
}

// ---- member creation (after the passkey is verified) ----

export async function newMemberStatement(c: Ctx, flow: FlowRow, now: number) {
  const id = randomId(12)
  let inviter: string | null = null
  if (flow.invited_by) {
    const m = await db.memberById(c.env.DB, flow.invited_by)
    inviter = m && memberActive(m, now) ? m.id : null
  }
  return {
    id,
    stmt: c.env.DB.prepare(
      `INSERT INTO members (id, provider, phone_hash, phone_country, birth_year, gender, nickname, status, lang, invited_by, invite_code, user_handle, created_at)
       VALUES (?1, 'phone', ?2, ?3, ?4, ?5, ?6, 'active', ?7, ?8, ?9, ?10, ?11)`,
    ).bind(id, flow.phone_hash, flow.phone_country, flow.birth_year, flow.gender, `anon-${randomId(5)}`, flow.lang, inviter, randomId(8), flow.user_handle, now),
  }
}

// IPv6 counted by /64 (addresses rotate inside it), like the vote rules.
export const otpIpHash = (c: Ctx, ip: string) => hmacHex(pepperOf(c.env), `otpip:${ipKey(ip)}`)
