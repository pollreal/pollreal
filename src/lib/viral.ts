// Viral structures: where a voter came from (share / embed / maker campaign / invite), counters, maker claims.
// Attribution is a signed 24-hour cookie set on arrival; the vote stores only the channel (and the maker claim id).
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { CLAIMS_PER_MEMBER_PER_DAY, CLAIM_RESEND_MS, FREE_MAIL_DOMAINS, SOURCE_COOKIE_HOURS, type Source } from '../config'
import { type AppEnv, type Bindings, isDev, pepperOf } from '../env'
import { hmacHex, randomId, signPayload, verifyPayload } from './crypto'
import { kstDay } from './metrics'

type Ctx = Context<AppEnv>
const SRC_COOKIE = 'vs_src'

// p = the poll the visitor arrived at (share, embed, maker campaign); invites carry no poll.
type SourceMark = { k: Exclude<Source, 'direct'>; p?: string; m?: string; t: number }

export async function markSource(c: Ctx, kind: SourceMark['k'], o: { pollId?: string; makerClaimId?: string } = {}) {
  const now = Date.now()
  const current = await readSource(c, now)
  if (current?.k === 'maker' && kind !== 'maker' && current.p === o.pollId) return
  const mark: SourceMark = { k: kind, t: now, ...(o.pollId ? { p: o.pollId } : {}), ...(o.makerClaimId ? { m: o.makerClaimId } : {}) }
  setCookie(c, SRC_COOKIE, await signPayload(pepperOf(c.env), mark), {
    httpOnly: true,
    secure: !isDev(c.env),
    sameSite: 'Lax',
    path: '/',
    maxAge: SOURCE_COOKIE_HOURS * 60 * 60,
  })
}

export async function readSource(c: Ctx, now: number): Promise<SourceMark | null> {
  const p = await verifyPayload<SourceMark>(pepperOf(c.env), getCookie(c, SRC_COOKIE))
  if (!p || now - p.t > SOURCE_COOKIE_HOURS * 60 * 60 * 1000) return null
  return p
}

// The channel of a vote: a share/embed/maker mark counts only on the poll it was made for.
export async function sourceForVote(c: Ctx, pollId: string, now: number): Promise<{ source: Source; makerClaimId: string | null }> {
  const s = await readSource(c, now)
  if (!s) return { source: 'direct', makerClaimId: null }
  if (s.k === 'invite') return { source: 'invite', makerClaimId: null }
  if (s.p !== pollId) return { source: 'direct', makerClaimId: null }
  if (s.k === 'maker') return s.m && (await claimValidForPoll(c.env.DB, s.m, pollId)) ? { source: 'maker', makerClaimId: s.m } : { source: 'direct', makerClaimId: null }
  return { source: s.k, makerClaimId: null }
}

// Counters only — no visitor data. kind: share_click | arrive_share | arrive_embed | arrive_maker | arrive_invite | embed_load | og_render
export const COUNT_KINDS = ['share_click', 'arrive_share', 'arrive_embed', 'arrive_maker', 'arrive_invite', 'embed_load', 'og_render'] as const
export type CountKind = (typeof COUNT_KINDS)[number]

export const bump = (db: D1Database, pollId: string, kind: CountKind, now: number) =>
  db
    .prepare('INSERT INTO share_counts (poll_id, day, kind, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT (poll_id, day, kind) DO UPDATE SET n = n + 1')
    .bind(pollId, kstDay(now), kind)
    .run()

// ---- maker claims ----

export type ClaimRow = { id: string; card_id: string; member_id: string; email_domain: string; code: string; status: string; maker: string; product: string }

// The registrable part of an official URL's host, good enough to match a work email ("www.openai.com" -> "openai.com").
export function officialDomain(url: string | null): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) return null
    // A product page on a free-mail provider's domain would let anyone with a free address "verify".
    return [...FREE_MAIL_DOMAINS].some((d) => host === d || host.endsWith(`.${d}`)) ? null : host
  } catch {
    return null
  }
}

// The email must be at the official domain or one of its subdomains (team@openai.com, a@eu.openai.com).
export function emailMatches(email: string, domain: string): boolean {
  const m = /^[^@\s]{1,64}@([a-z0-9.-]+\.[a-z]{2,})$/i.exec(email.trim())
  if (!m?.[1]) return false
  const host = m[1].toLowerCase()
  return host === domain || host.endsWith(`.${domain}`)
}

export async function createClaim(db: D1Database, pepper: string, cardId: string, memberId: string, email: string, domain: string, now: number) {
  const id = randomId(12)
  const code = randomId(10)
  const emailHash = await hmacHex(pepper, `email:${email.trim().toLowerCase()}`)
  await db
    .prepare(
      `INSERT INTO maker_claims (id, card_id, member_id, email_domain, email_hash, code, status, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)
       ON CONFLICT (card_id, member_id) DO UPDATE SET email_domain = ?4, email_hash = ?5, status = CASE WHEN status = 'verified' THEN 'verified' ELSE 'pending' END, created_at = ?7`,
    )
    .bind(id, cardId, memberId, domain, emailHash, code, now)
    .run()
  const row = await db.prepare('SELECT id FROM maker_claims WHERE card_id = ?1 AND member_id = ?2').bind(cardId, memberId).first<{ id: string }>()
  return row?.id ?? id
}

// null = allowed; otherwise why not (too many products today, or the same one asked again within 10 minutes).
export async function claimLimit(db: D1Database, memberId: string, cardId: string, now: number): Promise<'daily' | 'resend' | null> {
  const r = await db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM maker_claims WHERE member_id = ?1 AND created_at >= ?3) AS today,
              (SELECT COUNT(*) FROM maker_claims WHERE member_id = ?1 AND card_id = ?2 AND status = 'pending' AND created_at >= ?4) AS recent`,
    )
    .bind(memberId, cardId, now - 24 * 60 * 60 * 1000, now - CLAIM_RESEND_MS)
    .first<{ today: number; recent: number }>()
  if (!r) return null
  if (r.recent > 0) return 'resend'
  return r.today >= CLAIMS_PER_MEMBER_PER_DAY ? 'daily' : null
}

export const claimToken = (pepper: string, claimId: string, now: number) => signPayload(pepper, { c: claimId, exp: now + 24 * 60 * 60 * 1000 })

// confirm=false only reads (the GET page a mail scanner may prefetch); the POST from that page confirms.
export async function verifyClaimToken(db: D1Database, pepper: string, token: string | undefined, now: number, confirm: boolean) {
  const p = await verifyPayload<{ c: string; exp: number }>(pepper, token)
  if (!p || p.exp < now) return null
  if (confirm) await db.prepare("UPDATE maker_claims SET status = 'verified', verified_at = ?2 WHERE id = ?1 AND status = 'pending'").bind(p.c, now).run()
  return db
    .prepare(
      `SELECT m.id, m.card_id, m.member_id, m.email_domain, m.code, m.status, k.maker, k.product FROM maker_claims m JOIN cards k ON k.id = m.card_id WHERE m.id = ?1`,
    )
    .bind(p.c)
    .first<ClaimRow>()
}

export const claimsOf = async (db: D1Database, memberId: string) =>
  (
    await db
      .prepare(
        `SELECT m.id, m.card_id, m.member_id, m.email_domain, m.code, m.status, k.maker, k.product
         FROM maker_claims m JOIN cards k ON k.id = m.card_id WHERE m.member_id = ?1 AND m.status != 'revoked' ORDER BY m.created_at DESC`,
      )
      .bind(memberId)
      .all<ClaimRow>()
  ).results ?? []

// A campaign link is valid for a poll only if the claimed product is one of its candidates.
export const claimForPoll = (db: D1Database, code: string, pollId: string) =>
  db
    .prepare(
      `SELECT m.id, m.card_id, m.member_id, m.email_domain, m.code, m.status, k.maker, k.product
       FROM maker_claims m JOIN cards k ON k.id = m.card_id
       WHERE m.code = ?1 AND m.status = 'verified' AND EXISTS (SELECT 1 FROM candidates c WHERE c.poll_id = ?2 AND c.card_id = m.card_id)`,
    )
    .bind(code, pollId)
    .first<ClaimRow>()

export const claimValidForPoll = async (db: D1Database, claimId: string, pollId: string) =>
  !!(await db
    .prepare(
      `SELECT 1 AS ok FROM maker_claims m WHERE m.id = ?1 AND m.status = 'verified'
       AND EXISTS (SELECT 1 FROM candidates c WHERE c.poll_id = ?2 AND c.card_id = m.card_id)`,
    )
    .bind(claimId, pollId)
    .first())

// Email for maker verification: Resend when configured; development shows the link on screen instead.
export async function sendClaimEmail(env: Bindings, to: string, link: string, product: string): Promise<'sent' | 'dev' | 'off' | 'failed'> {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [to],
          subject: `Verify that you make ${product}`,
          text: `Open this link within 24 hours to verify that you work for the maker of ${product}:\n\n${link}\n\nIf you did not ask for this, ignore this email.`,
        }),
        signal: AbortSignal.timeout(8000),
      })
      return res.ok ? 'sent' : 'failed'
    } catch {
      return 'failed'
    }
  }
  return isDev(env) ? 'dev' : 'off'
}
