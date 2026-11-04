import { describe, expect, it } from 'vitest'
import { ageBand, ageFromBirthDate } from '../src/lib/age'
import { hmacHex, randomId, signPayload, verifyPayload } from '../src/lib/crypto'
import { memberActive, restrictionMsg, safeNext } from '../src/lib/auth'
import { clean, normKey, slugOf } from '../src/lib/text'
import { emailMatches, officialDomain } from '../src/lib/viral'
import { remainingParts, whenText } from '../src/lib/time'

// 2026-10-28 12:00 KST
const NOW = Date.UTC(2026, 9, 28, 3, 0, 0)

describe('age', () => {
  it('computes exact age on the KST calendar (14th birthday boundary)', () => {
    expect(ageFromBirthDate('20121028', NOW)).toBe(14)
    expect(ageFromBirthDate('20121029', NOW)).toBe(13)
    expect(ageFromBirthDate('19900501', NOW)).toBe(36)
  })
  it('rejects impossible dates', () => {
    expect(ageFromBirthDate('20230230', NOW)).toBeNull()
    expect(ageFromBirthDate('1990-05-01', NOW)).toBeNull()
  })
  it('bands by birth year', () => {
    expect(ageBand(2012, 2026)).toBe('10')
    expect(ageBand(2006, 2026)).toBe('20')
    expect(ageBand(1990, 2026)).toBe('30')
    expect(ageBand(1967, 2026)).toBe('50')
    expect(ageBand(1966, 2026)).toBe('60')
  })
})

describe('text', () => {
  it('builds a readable slug and caps its length', () => {
    expect(slugOf(['MX Keys S', '키크론 K8 Pro'])).toBe('mx-keys-s-vs-키크론-k8-pro')
    expect(slugOf(['a'.repeat(70), 'b'.repeat(70)]).length).toBeLessThanOrEqual(80)
    expect(slugOf(['!!!', '???'])).toBe('poll')
  })
  it('normalizes spellings of the same product to one key', () => {
    expect(normKey('Logitech', 'MX-Keys S')).toBe(normKey(' logitech ', 'mx keys s'))
    expect(normKey('로지텍', 'MX Keys')).not.toBe(normKey('로지텍', 'MX Mechanical'))
    // brand alias table
    expect(normKey('로지텍', 'MX Keys')).toBe(normKey('Logitech', 'MX Keys'))
    expect(normKey('삼성전자', '갤럭시 S25')).toBe(normKey('Samsung', 'Galaxy S25'))
    expect(normKey('OpenAI', '챗GPT')).toBe(normKey('OpenAI', 'ChatGPT'))
    expect(normKey('Samsung', '프로그램')).not.toBe(normKey('Samsung', '프로 gram'))
  })
  it('cleans whitespace and full-width characters', () => {
    expect(clean('  ＭＸ   Keys  ')).toBe('MX Keys')
  })
})

describe('time', () => {
  it('formats the remaining time', () => {
    expect(remainingParts(NOW + (23 * 60 + 59) * 60000, NOW)).toEqual({ h: 23, m: 59 })
    expect(remainingParts(NOW + 2 * 3600000, NOW)).toEqual({ h: 2, m: 0 })
    expect(remainingParts(NOW + 90000, NOW)).toEqual({ h: 0, m: 2 })
    expect(remainingParts(NOW, NOW)).toBeNull()
    // Korean pages show Korea time, English pages UTC (server-rendered)
    expect(whenText('ko', NOW)).toBe('2026.10.28 12:00')
    expect(whenText('en', NOW)).toBe('2026-10-28 03:00 UTC')
  })
})

describe('crypto', () => {
  it('hashes deterministically per key', async () => {
    expect(await hmacHex('k1', 'di:x')).toBe(await hmacHex('k1', 'di:x'))
    expect(await hmacHex('k1', 'di:x')).not.toBe(await hmacHex('k2', 'di:x'))
  })
  it('rejects a tampered signed payload', async () => {
    const token = await signPayload('secret', { provider: 'dev', next: '/new' })
    expect(await verifyPayload('secret', token)).toEqual({ provider: 'dev', next: '/new' })
    expect(await verifyPayload('secret', `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`)).toBeNull()
    expect(await verifyPayload('other', token)).toBeNull()
  })
  it('makes ids from the unambiguous alphabet', () => {
    expect(randomId(8)).toMatch(/^[a-hjkmnp-z2-9]{8}$/)
  })
})

describe('review fixes (2026-10-29)', () => {
  it('post-login redirects stay on this site', () => {
    expect(safeNext('/me')).toBe('/me')
    expect(safeNext('/ko/v/abc/x?m=1')).toBe('/ko/v/abc/x?m=1')
    for (const bad of ['//evil.com', '/\\evil.com', '/\t/evil.com', '/\n/x', 'https://evil.com', '', 42]) expect(safeNext(bad)).toBe('/')
  })
  it('cuts long slugs by whole characters', () => {
    const s = slugOf(['a', `${'b'.repeat(74)}\u{20000}\u{20000}\u{20000}`])
    expect(() => encodeURIComponent(s)).not.toThrow()
  })
  it('never lets a free-mail domain stand for a maker', () => {
    expect(officialDomain('https://www.anthropic.com/claude')).toBe('anthropic.com')
    expect(officialDomain('https://blog.naver.com/x')).toBeNull()
    expect(officialDomain('https://proton.me/mail')).toBeNull()
    expect(emailMatches('team@anthropic.com', 'anthropic.com')).toBe(true)
    expect(emailMatches('a@eu.anthropic.com', 'anthropic.com')).toBe(true)
    expect(emailMatches('a@anthropic.com.evil.io', 'anthropic.com')).toBe(false)
    expect(emailMatches('a@notanthropic.com', 'anthropic.com')).toBe(false)
  })
})

describe('timed suspensions (2026-10-29)', () => {
  const day = 24 * 60 * 60 * 1000
  it('lets active members in, keeps suspended ones out until the end date has passed', () => {
    expect(memberActive({ status: 'active', suspended_until: null }, NOW)).toBe(true)
    expect(memberActive({ status: 'suspended', suspended_until: null }, NOW)).toBe(false)
    expect(memberActive({ status: 'suspended', suspended_until: NOW - 1 }, NOW)).toBe(true)
    expect(memberActive({ status: 'suspended', suspended_until: NOW }, NOW)).toBe(true)
    expect(memberActive({ status: 'suspended', suspended_until: NOW + 7 * day }, NOW)).toBe(false)
    expect(memberActive({ status: 'withdrawn', suspended_until: null }, NOW)).toBe(false)
    expect(memberActive({ status: 'withdrawn', suspended_until: NOW - day }, NOW)).toBe(false)
  })
  it('tells the member until when at sign-in, in the page language', () => {
    expect(restrictionMsg({ status: 'suspended', suspended_until: null }, 'en')).toEqual({ k: 'e.suspended' })
    expect(restrictionMsg({ status: 'suspended', suspended_until: NOW + 7 * day }, 'en')).toEqual({ k: 'e.suspendedUntil', p: ['2026-11-04 03:00 UTC'] })
    expect(restrictionMsg({ status: 'suspended', suspended_until: NOW + 7 * day }, 'ko')).toEqual({ k: 'e.suspendedUntil', p: ['2026.11.04 12:00'] })
  })
})

describe('nine interface languages (2026-10-29)', () => {
  it('every language has every text, none empty, and every message function works', async () => {
    const { LANGS, tr, msgText, href, langOfPath, stripLang } = await import('../src/i18n')
    const en = tr('en') as unknown as Record<string, unknown>
    for (const lang of LANGS) {
      const d = tr(lang) as unknown as Record<string, unknown>
      expect(Object.keys(d).sort()).toEqual(Object.keys(en).sort())
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string') expect(v.trim(), `${lang}.${k}`).not.toBe('')
        else if (typeof v === 'function') expect(String(v(3, 4, 5, 6)).trim(), `${lang}.${k}()`).not.toBe('')
        else expect(Object.keys(v as object).sort(), `${lang}.${k}`).toEqual(Object.keys(en[k] as object).sort())
      }
      expect(msgText(lang, { k: 'v.count', p: [2, 4] })).toMatch(/2/)
    }
    expect(href('ja', '/')).toBe('/ja')
    expect(href('ja', '/v/x/y')).toBe('/ja/v/x/y')
    expect(href('en', '/v/x/y')).toBe('/v/x/y')
    expect(langOfPath('/zh/board')).toBe('zh')
    expect(langOfPath('/zhx')).toBe('en')
    expect(stripLang('/ru')).toBe('/')
    expect(stripLang('/ru/me')).toBe('/me')
  })
})
