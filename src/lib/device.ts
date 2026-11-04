// One vote per device per poll and the network check.
//  R1 device token — a signed random id in a long-lived cookie, mirrored by the page script into browser storage;
//     both are checked, so clearing only one of them does not give a second vote.
//  R2 device fingerprint — HMAC(poll + network + browser + screen/time-zone/hardware signals).
//  R3 network cap — at most VOTES_PER_NETWORK_PER_POLL votes from one IPv4 address / IPv6 /64 in a poll.
// Every value is an HMAC that includes the poll id: one poll's voters cannot be linked to another's, and the values
// are erased after DEVICE_HASH_KEEP_DAYS. A scripted attacker can forge browser signals; R3 and the per-number,
// per-vote passkey keep that expensive — the honest limit of a web page (no hardware id exists on the web).
import type { Context } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { BLOCKED_ASNS, BLOCKED_ORG, DEVICE_TOKEN_DAYS } from '../config'
import { type AppEnv, isDev, pepperOf } from '../env'
import { hmacHex, randomId, safeEqual } from './crypto'

type Ctx = Context<AppEnv>

const DT_COOKIE = 'vs_dt'

async function signToken(pepper: string, id: string) {
  return `${id}.${(await hmacHex(pepper, `dt:${id}`)).slice(0, 32)}`
}

export async function readDeviceToken(pepper: string, value: string | undefined | null): Promise<string | null> {
  if (!value || value.length > 80) return null
  const i = value.indexOf('.')
  if (i <= 0) return null
  const id = value.slice(0, i)
  if (!/^[a-z0-9]{16,32}$/.test(id)) return null
  return safeEqual(value, await signToken(pepper, id)) ? id : null
}

// The device token of this browser (created on first need). Returns the signed value the page may mirror.
export async function ensureDeviceToken(c: Ctx): Promise<{ id: string; value: string }> {
  const pepper = pepperOf(c.env)
  const current = getCookie(c, DT_COOKIE)
  const id = await readDeviceToken(pepper, current)
  if (id && current) return { id, value: current }
  const fresh = randomId(22)
  const value = await signToken(pepper, fresh)
  setCookie(c, DT_COOKIE, value, { httpOnly: true, secure: !isDev(c.env), sameSite: 'Lax', path: '/', maxAge: DEVICE_TOKEN_DAYS * 24 * 60 * 60 })
  return { id: fresh, value }
}

export async function cookieDeviceToken(c: Ctx) {
  return readDeviceToken(pepperOf(c.env), getCookie(c, DT_COOKIE))
}

// After a vote with an older mirrored token, put that token back into the cookie (the two converge).
export function restoreDeviceCookie(c: Ctx, value: string) {
  setCookie(c, DT_COOKIE, value, { httpOnly: true, secure: !isDev(c.env), sameSite: 'Lax', path: '/', maxAge: DEVICE_TOKEN_DAYS * 24 * 60 * 60 })
}

// ---- network ----

// Development may simulate a visitor's address and network with x-dev-ip / x-dev-asn / x-dev-org / x-dev-country.
export function clientIp(c: Ctx): string {
  if (isDev(c.env)) return c.req.header('x-dev-ip') ?? c.req.header('cf-connecting-ip') ?? '127.0.0.1'
  return c.req.header('cf-connecting-ip') ?? ''
}

// IPv4 address as is; IPv6 cut to its /64 (one home or one phone; the rest rotates for privacy).
export function ipKey(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail = ''] = ip.split('::')
  const h = head ? head.split(':') : []
  const t = tail ? tail.split(':') : []
  const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t] : h
  return `${groups
    .slice(0, 4)
    .map((g) => (g || '0').toLowerCase().replace(/^0+(?=.)/, ''))
    .join(':')}::/64`
}

type CfInfo = { asn?: number; asOrganization?: string; country?: string }

export function networkInfo(c: Ctx): CfInfo {
  const cf = (c.req.raw as unknown as { cf?: CfInfo }).cf ?? {}
  if (isDev(c.env)) {
    const asn = c.req.header('x-dev-asn')
    return {
      asn: asn ? Number(asn) : cf.asn,
      asOrganization: c.req.header('x-dev-org') ?? cf.asOrganization,
      country: c.req.header('x-dev-country') ?? cf.country,
    }
  }
  return cf
}

// null = allowed. Tor exits carry the country code T1 at Cloudflare.
export function blockedNetwork(info: CfInfo): string | null {
  if (info.country === 'T1') return 'tor'
  if (info.asn && BLOCKED_ASNS.has(info.asn)) return `asn:${info.asn}`
  if (info.asOrganization && BLOCKED_ORG.test(info.asOrganization)) return `org:${info.asOrganization}`
  return null
}

// ---- per-poll values stored on the vote ----

export type DeviceValues = { dtHash: string; dtHash2: string | null; fpHash: string; netHash: string }

// Browser signals sent by the page script; trimmed and length-capped (they are hashed, never stored).
export function cleanSignals(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.slice(0, 600)
}

export async function deviceValues(
  pepper: string,
  pollId: string,
  o: { token: string; mirror: string | null; ip: string; userAgent: string; signals: string },
): Promise<DeviceValues> {
  const net = ipKey(o.ip)
  return {
    dtHash: await hmacHex(pepper, `dt:${pollId}:${o.token}`),
    dtHash2: o.mirror && o.mirror !== o.token ? await hmacHex(pepper, `dt:${pollId}:${o.mirror}`) : null,
    fpHash: await hmacHex(pepper, `fp:${pollId}:${net}:${o.userAgent}:${o.signals}`),
    netHash: await hmacHex(pepper, `net:${pollId}:${net}`),
  }
}

// One count per person, poll and reason for the "blocked at the door" line (no member link stored).
export const refusalWho = (pepper: string, pollId: string, memberId: string) => hmacHex(pepper, `who:${pollId}:${memberId}`)
