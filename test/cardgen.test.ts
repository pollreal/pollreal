import { describe, expect, it } from 'vitest'
import { costOf, hostOf, isNonOfficial, sanitizeDraft, str, usableHint, userPrompt } from '../src/lib/cardgen'

const seen = new Set([
  'https://www.logitech.com/ko-kr/products/keyboards/mx-keys-s.920-011589.html',
  'https://www.coupang.com/vp/products/123',
  'https://reviews.example.org/mx-keys-s',
])

const base = {
  found: true,
  product_title: 'MX Keys S',
  official_url: 'https://www.logitech.com/ko-kr/products/keyboards/mx-keys-s.920-011589.html',
  specs: [
    { label: '연결', value: 'Bluetooth, Logi Bolt 수신기' },
    { label: '배터리', value: '최대 10일(백라이트 켬)' },
  ],
  notes: ['2023년 출시'],
  sources: [{ title: '로지텍 MX Keys S', url: 'https://www.logitech.com/ko-kr/products/keyboards/mx-keys-s.920-011589.html', official: true }],
}

describe('AI card sanitizing (official facts only)', () => {
  it('keeps a clean official card', () => {
    const r = sanitizeDraft(base, seen)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.officialUrl).toBe(base.official_url)
    expect(r.draft.specs).toHaveLength(2)
    expect(r.draft.sources[0]?.official).toBe(true)
  })

  it('drops placeholder values and their Korean twins, keeping the translation aligned', () => {
    const r = sanitizeDraft(
      {
        ...base,
        specs: [
          { label: 'Free plan', value: 'Not stated in readable official text' },
          { label: 'Pro plan', value: '$10/month' },
          { label: 'API', value: 'Unknown' },
          { label: 'Platforms', value: 'Web, iOS' },
          { label: 'Region', value: 'Not available in the EU' },
        ],
        specs_ko: [
          { label: '무료 요금제', value: '공식 페이지에 명시되지 않음' },
          { label: '프로 요금제', value: '월 10달러' },
          { label: 'API', value: '알 수 없음' },
          { label: '플랫폼', value: '웹, iOS' },
          { label: '지역', value: 'EU 미제공' },
        ],
        notes_ko: ['2023년 출시'],
      },
      seen,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.specs.map((s) => s.label)).toEqual(['Pro plan', 'Platforms', 'Region'])
    expect(r.draft.ko.specs.map((s) => s.label)).toEqual(['프로 요금제', '플랫폼', '지역'])
  })

  it('never marks a marketplace as official, even if the model says so', () => {
    const r = sanitizeDraft(
      { ...base, official_url: 'https://www.coupang.com/vp/products/123', sources: [{ title: '쿠팡', url: 'https://www.coupang.com/vp/products/123', official: true }] },
      seen,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.officialUrl).toBeNull()
    expect(r.draft.sources.every((s) => !s.official)).toBe(true)
  })

  it('drops links the model never actually saw', () => {
    const r = sanitizeDraft(
      {
        ...base,
        official_url: 'https://www.made-up-maker.com/p/1',
        sources: [...base.sources, { title: '지어낸 주소', url: 'https://www.made-up-maker.com/p/1', official: true }],
      },
      seen,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.officialUrl).toBeNull()
    expect(r.draft.sources.map((s) => s.url)).toEqual([base.official_url])
  })

  it('rejects non-http links', () => {
    const r = sanitizeDraft({ ...base, official_url: 'javascript:alert(1)', sources: [{ title: 'x', url: 'javascript:alert(1)', official: true }] }, seen)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.officialUrl).toBeNull()
    expect(r.draft.sources).toHaveLength(0)
  })

  it('adds the official page to the sources when the model left it out', () => {
    const r = sanitizeDraft({ ...base, sources: [] }, seen)
    expect(r.ok && r.draft.sources[0]).toMatchObject({ url: base.official_url, official: true })
  })

  it('fails when the product was not identified or there is too little to show', () => {
    expect(sanitizeDraft({ ...base, found: false, notes: ['같은 이름의 상품이 여러 개'] }, seen)).toEqual({ ok: false, error: 'not_found: 같은 이름의 상품이 여러 개' })
    expect(sanitizeDraft({ ...base, specs: [{ label: '연결', value: 'Bluetooth' }] }, seen)).toEqual({ ok: false, error: 'too_few_specs' })
    expect(sanitizeDraft(null, seen).ok).toBe(false)
  })

  it('trims lengths and counts', () => {
    const long = 'ㄱ'.repeat(300)
    const specs = Array.from({ length: 14 }, (_, i) => ({ label: `항목${i} ${long}`, value: long }))
    const r = sanitizeDraft({ ...base, specs, notes: [long, long, long, long] }, seen)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.draft.specs).toHaveLength(10)
    expect(r.draft.specs[0]?.label.length).toBeLessThanOrEqual(32)
    expect(r.draft.specs[0]?.value.length).toBeLessThanOrEqual(100)
    expect(r.draft.notes).toHaveLength(3)
  })
})

describe('AI card helpers', () => {
  it('hostOf / isNonOfficial', () => {
    expect(hostOf('https://www.Logitech.com/ko-kr')).toBe('logitech.com')
    expect(hostOf('ftp://x.com/a')).toBeNull()
    expect(isNonOfficial('blog.naver.com')).toBe(true)
    expect(isNonOfficial('m.coupang.com')).toBe(true)
    expect(isNonOfficial('amazon.co.jp')).toBe(true)
    expect(isNonOfficial('samsung.com')).toBe(false)
  })

  it('costOf: Haiku 5.5 tokens + USD 0.01 per search', () => {
    const c = costOf({ input_tokens: 20_000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } })
    expect(c).toBeCloseTo(20_000 * 0.1e-6 + 800 * 0.5e-6 + 0.02, 6)
    const long = costOf({ input_tokens: 120_000, output_tokens: 1_000 })
    expect(long).toBeCloseTo(120_000 * 0.5e-6 + 1_000 * 2.5e-6, 6)
  })

  it('userPrompt', () => {
    expect(userPrompt({ maker: 'OpenAI', product: 'ChatGPT', category: 'Chatbots & assistants' })).toBe(
      'Maker: OpenAI\nProduct or service: ChatGPT\nCategory: Chatbots & assistants\n\nMake the comparison card for it.',
    )
    expect(userPrompt({ maker: 'OpenAI', product: 'ChatGPT' })).toBe('Maker: OpenAI\nProduct or service: ChatGPT\n\nMake the comparison card for it.')
  })

  it('userPrompt: an official page from the seed list is handed over', () => {
    expect(userPrompt({ maker: 'Anysphere', product: 'Cursor', category: 'Coding', hintUrl: 'https://cursor.com/pricing' })).toBe(
      'Maker: Anysphere\nProduct or service: Cursor\nCategory: Coding\nOfficial page: https://cursor.com/pricing\n\nMake the comparison card for it.',
    )
    // a store or non-web address is dropped and the card falls back to searching
    expect(userPrompt({ maker: 'X', product: 'Y', hintUrl: 'https://www.amazon.com/dp/B0' })).not.toContain('Official page')
    expect(userPrompt({ maker: 'X', product: 'Y', hintUrl: 'javascript:alert(1)' })).not.toContain('Official page')
  })

  it('usableHint', () => {
    expect(usableHint('https://www.keychron.com/products/q1')).toBe('https://www.keychron.com/products/q1')
    expect(usableHint('https://smartstore.naver.com/x')).toBeNull()
    expect(usableHint('ftp://example.com/a')).toBeNull()
    expect(usableHint(`https://example.com/${'a'.repeat(500)}`)).toBeNull()
    expect(usableHint(null)).toBeNull()
    expect(usableHint('')).toBeNull()
  })
})

describe('card text limits', () => {
  it('keeps short text and cuts long text at a word boundary with an ellipsis', () => {
    expect(str('  Plus   plan ', 32)).toBe('Plus plan')
    expect(str('Models in Work and Codex (rate card)', 32)).toBe('Models in Work and Codex…')
    expect(str('Go is available worldwide; pricing is localized in some markets', 50)).toBe('Go is available worldwide; pricing is localized…')
    expect(str('가'.repeat(40), 32)).toBe(`${'가'.repeat(31)}…`)
    expect(str(42, 32)).toBe('')
  })
})
