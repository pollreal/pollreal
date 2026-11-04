import { describe, expect, it } from 'vitest'
import { ANOMALY, TURNSTILE_TEST_SITE_KEY, applyPrivateLimits } from '../src/config'
import type { Bindings } from '../src/env'
import { isNewMember, judgeSurge } from '../src/lib/anomaly'
import { blockedNetwork, deviceValues, ipKey, readDeviceToken } from '../src/lib/device'
import { parsePhone } from '../src/lib/phone'
import { dayStart, isDay, kstDay } from '../src/lib/metrics'
import { botKeys, verifyBot } from '../src/lib/turnstile'

const env = (o: Partial<Bindings>) => ({ DB: {} as D1Database, APP_ENV: 'production', ...o }) as Bindings
const reply = (body: object, status = 200) => async () => new Response(JSON.stringify(body), { status })
const TOKEN = { 'cf-turnstile-response': 'tok' }

describe('bot check (Turnstile)', () => {
  it('fails closed in production without keys and uses test keys in development', () => {
    expect(botKeys(env({}))).toBeNull()
    expect(botKeys(env({ APP_ENV: 'development' }))?.siteKey).toBe(TURNSTILE_TEST_SITE_KEY)
    expect(botKeys(env({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' }))).toEqual({ siteKey: 's', secret: 'k', test: false })
  })
  it('refuses without configuration or token, before any network call', async () => {
    const boom = async () => {
      throw new Error('no network expected')
    }
    expect(await verifyBot(env({}), TOKEN, { action: 'phone', host: 'versus.test', fetcher: boom })).toEqual({ ok: false, reason: 'not_configured' })
    const live = env({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' })
    expect(await verifyBot(live, {}, { action: 'phone', host: 'versus.test', fetcher: boom })).toEqual({ ok: false, reason: 'missing' })
  })
  it('real keys must match action and hostname', async () => {
    const live = env({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' })
    const good = reply({ success: true, action: 'phone', hostname: 'versus.test' })
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'versus.test', fetcher: good })).toEqual({ ok: true })
    expect((await verifyBot(live, TOKEN, { action: 'new_poll', host: 'versus.test', fetcher: good })).ok).toBe(false)
    expect((await verifyBot(live, TOKEN, { action: 'phone', host: 'evil.test', fetcher: good })).ok).toBe(false)
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'versus.test', fetcher: reply({ success: false, 'error-codes': ['invalid-input-response'] }) })).toEqual({
      ok: false,
      reason: 'rejected',
      codes: ['invalid-input-response'],
    })
    // a used token (double submit) is told apart from a failed check
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'versus.test', fetcher: reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }) })).toEqual({
      ok: false,
      reason: 'spent',
    })
  })
  it('trims a secret stored with a trailing newline and sends it form-encoded (2026-11-02 outage)', async () => {
    const live = env({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k\n' })
    let sent = ''
    const check = async (_u: unknown, init?: RequestInit) => {
      sent = String(init?.body)
      return new Response(JSON.stringify({ success: true, action: 'phone', hostname: 'h' }))
    }
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'h', fetcher: check as typeof fetch })).toEqual({ ok: true })
    expect(new URLSearchParams(sent).get('secret')).toBe('k')
  })
  it('test keys skip the action/hostname match (Cloudflare answers with sample values)', async () => {
    const dev = env({ APP_ENV: 'development' })
    expect(await verifyBot(dev, TOKEN, { action: 'phone', host: '127.0.0.1', fetcher: reply({ success: true, hostname: 'example.com', action: 'test' }) })).toEqual({ ok: true })
  })
  it('retries once on a server error, then reports unavailable', async () => {
    const live = env({ TURNSTILE_SITE_KEY: 's', TURNSTILE_SECRET_KEY: 'k' })
    let calls = 0
    const flaky = async () => (++calls === 1 ? new Response('x', { status: 502 }) : new Response(JSON.stringify({ success: true, action: 'phone', hostname: 'h' })))
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'h', fetcher: flaky })).toEqual({ ok: true })
    expect(calls).toBe(2)
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'h', fetcher: async () => new Response('x', { status: 503 }) })).toEqual({ ok: false, reason: 'unavailable' })
    // Cloudflare's own internal error twice = their outage, not the visitor's failure
    expect(await verifyBot(live, TOKEN, { action: 'phone', host: 'h', fetcher: reply({ success: false, 'error-codes': ['internal-error'] }) })).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('one vote per device', () => {
  it('keys IPv4 by address and IPv6 by its /64', () => {
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7')
    expect(ipKey('2001:db8:0:1:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:0:1::/64')
    expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64')
    expect(ipKey('2001:0db8:0000:0001::5')).toBe('2001:db8:0:1::/64')
  })
  it('makes per-poll values: the same device links within a poll, never across polls', async () => {
    const base = { token: 'tok1234567890abcdef', mirror: null, ip: '203.0.113.7', userAgent: 'UA', signals: 's' }
    const a = await deviceValues('pepper', 'pollA', base)
    expect(await deviceValues('pepper', 'pollA', base)).toEqual(a)
    const b = await deviceValues('pepper', 'pollB', base)
    expect(b.dtHash).not.toBe(a.dtHash)
    expect(b.fpHash).not.toBe(a.fpHash)
    expect(b.netHash).not.toBe(a.netHash)
    const otherIp = await deviceValues('pepper', 'pollA', { ...base, ip: '198.51.100.1' })
    expect(otherIp.dtHash).toBe(a.dtHash) // the device token does not depend on the network
    expect(otherIp.fpHash).not.toBe(a.fpHash)
    expect(a.dtHash2).toBeNull()
    expect((await deviceValues('pepper', 'pollA', { ...base, mirror: 'older1234567890abcd' })).dtHash2).not.toBeNull()
  })
  it('accepts only device tokens signed with the server key', async () => {
    expect(await readDeviceToken('pepper', 'abc')).toBeNull()
    expect(await readDeviceToken('pepper', 'aaaaaaaaaaaaaaaaaaaa.bad')).toBeNull()
  })
  it('blocks data centres, VPN providers, relays and Tor but not home or mobile networks', () => {
    expect(blockedNetwork({ asn: 16509, asOrganization: 'Amazon.com' })).toBe('asn:16509')
    // production adds the full list from PRIVATE_LIMITS; a test entry stands in for it here
    applyPrivateLimits(JSON.stringify({ blockedAsns: [13335] }))
    expect(blockedNetwork({ asn: 13335, asOrganization: 'Cloudflare, Inc.' })).toBe('asn:13335')
    expect(blockedNetwork({ asn: 99999, asOrganization: 'Example VPN Ltd' })).toMatch(/^org:/)
    expect(blockedNetwork({ asn: 99998, asOrganization: 'Some Hosting GmbH' })).toMatch(/^org:/)
    expect(blockedNetwork({ country: 'T1' })).toBe('tor')
    expect(blockedNetwork({ asn: 4766, asOrganization: 'Korea Telecom', country: 'KR' })).toBeNull()
    expect(blockedNetwork({ asn: 7922, asOrganization: 'Comcast Cable Communications, LLC', country: 'US' })).toBeNull()
    expect(blockedNetwork({})).toBeNull()
  })
  it('counts a member as new for ANOMALY.newMemberHours after joining', () => {
    const t = Date.UTC(2026, 10, 16)
    const h = ANOMALY.newMemberHours
    expect(isNewMember(t, t + (h - 1) * 3600000)).toBe(true)
    expect(isNewMember(t, t + (h + 1) * 3600000)).toBe(false)
  })
})

describe('phone numbers', () => {
  it('accepts mobile numbers of the chosen country in any common format', () => {
    const kr = parsePhone('KR', '010-1234-5678')
    expect(kr).toEqual({ e164: '+821012345678', country: 'KR', hint: '+82 •••• 5678' })
    expect(parsePhone('KR', '+82 10 1234 5678')).toEqual(kr)
    const us = parsePhone('US', '(201) 555-0123')
    expect(typeof us === 'object' && us.e164).toBe('+12015550123')
  })
  it('refuses landlines, internet phones and nonsense', () => {
    expect(parsePhone('KR', '02-312-3456')).toBe('type') // Seoul landline
    expect(parsePhone('KR', '070-1234-5678')).toBe('type') // Korean internet phone (VoIP)
    expect(parsePhone('KR', '12345')).toBe('invalid')
    expect(parsePhone('ZZ', '01012345678')).toBe('invalid')
    expect(parsePhone('KR', '+1 201 555 0123')).toBe('invalid') // another country's number under Korea
  })
})

describe('new-member surge rule', () => {
  const w = (a: number, aNew: number, b: number, bNew: number) => [
    { candidate_id: 'A', n: a, new_n: aNew },
    { candidate_id: 'B', n: b, new_n: bNew },
  ]
  it('fires on a one-sided burst of new members that swings the earlier result', () => {
    const f = judgeSurge(w(36, 34, 2, 1), [
      { candidate_id: 'A', n: 10, new_n: 0 },
      { candidate_id: 'B', n: 20, new_n: 0 },
    ] as never)
    expect(f?.candidateId).toBe('A')
    expect(f?.earlierShare).toBeCloseTo(1 / 3)
  })
  it('does not fire when new members agree with the earlier result (popular product)', () => {
    expect(judgeSurge(w(36, 34, 2, 1), [{ candidate_id: 'A', n: 25 }, { candidate_id: 'B', n: 5 }])).toBeNull()
  })
  it('needs volume, new members and one-sidedness together', () => {
    expect(judgeSurge(w(20, 20, 1, 1), [])).toBeNull() // too few votes
    expect(judgeSurge(w(36, 10, 2, 1), [{ candidate_id: 'B', n: 30 }])).toBeNull() // mostly existing members
    expect(judgeSurge(w(30, 30, 10, 10), [{ candidate_id: 'B', n: 30 }])).toBeNull() // not one-sided
  })
  it('without a baseline only a very large burst counts', () => {
    expect(judgeSurge(w(60, 60, 0, 0), [])).toBeNull()
    expect(judgeSurge(w(ANOMALY.surgeWithoutBaseline, ANOMALY.surgeWithoutBaseline, 0, 0), [])?.earlierShare).toBeNull()
  })
})

describe('KST days for the metrics ledger', () => {
  it('maps instants to the Korean calendar day', () => {
    expect(kstDay(Date.UTC(2026, 10, 15, 14, 59))).toBe('2026-11-15')
    expect(kstDay(Date.UTC(2026, 10, 15, 15, 0))).toBe('2026-11-16')
    expect(dayStart('2026-11-16')).toBe(Date.UTC(2026, 10, 15, 15, 0))
  })
  it('validates day strings', () => {
    expect(isDay('2026-11-16')).toBe(true)
    expect(isDay('2026-02-30')).toBe(false)
    expect(isDay('2026-11-16; DROP')).toBe(false)
  })
})
