import { describe, expect, it } from 'vitest'
import { type Cell, tally } from '../src/lib/aggregate'
import { badgeMessage, badgeSvg, cardSvg, hoursLeft, segments, splitVisible, standing, textWidth } from '../src/lib/gauge'
import { tr } from '../src/i18n'

const votes = (counts: Record<string, number>): Cell[] => Object.entries(counts).map(([candidate_id, c]) => ({ candidate_id, age_band: '30', gender: 'M', c }))
const ids = ['a', 'b']
const names = ['Cursor', 'Windsurf']

describe('segments', () => {
  it('keeps candidate order and gives the leader the copper tone', () => {
    const s = segments(ids, names, tally(ids, votes({ a: 42, b: 58 })), 'a')
    expect(s.map((x) => [x.id, x.pct, x.tone, x.lead, x.mine])).toEqual([
      ['a', 42, 'rest', false, true],
      ['b', 58, 'lead', true, false],
    ])
    expect(s[1]?.from).toBe(42)
  })

  it('splits evenly without votes and has no leader on a tie', () => {
    expect(segments(ids, names, tally(ids, [])).map((x) => [x.pct, x.lead])).toEqual([
      [50, false],
      [50, false],
    ])
    expect(segments(ids, names, tally(ids, votes({ a: 5, b: 5 }))).some((x) => x.lead)).toBe(false)
  })

  it('shades the trailing candidates of a 4-way poll in order', () => {
    const four = ['a', 'b', 'c', 'd']
    const s = segments(four, ['A', 'B', 'C', 'D'], tally(four, votes({ a: 10, b: 40, c: 30, d: 20 })))
    expect(s.map((x) => x.tone)).toEqual(['rest', 'lead', 'rest2', 'rest3'])
  })
})

describe('standing', () => {
  it('says behind, ahead or level against the strongest rival', () => {
    expect(standing(ids, names, tally(ids, votes({ a: 506, b: 698 })), 'a')).toEqual({ kind: 'behind', margin: 192, versus: 'Windsurf', mine: 'Cursor' })
    expect(standing(ids, names, tally(ids, votes({ a: 674, b: 530 })), 'a')).toMatchObject({ kind: 'lead', margin: 144 })
    expect(standing(ids, names, tally(ids, votes({ a: 3, b: 3 })), 'b')).toMatchObject({ kind: 'tied', margin: 0, versus: 'Cursor' })
  })

  it('compares with the best rival in a 3-way poll and needs a vote', () => {
    const three = ['a', 'b', 'c']
    expect(standing(three, ['A', 'B', 'C'], tally(three, votes({ a: 10, b: 30, c: 20 })), 'c')).toMatchObject({ kind: 'behind', margin: 10, versus: 'B' })
    expect(standing(ids, names, tally(ids, []), 'a')).toBeNull()
    expect(standing(ids, names, tally(ids, votes({ a: 1 })), null)).toBeNull()
  })
})

describe('split visibility', () => {
  it('shows the split after closing or to voters; to everyone only when INTERIM_PUBLIC', () => {
    expect(splitVisible(false, false, false)).toBe(true)
    expect(splitVisible(true, true, false)).toBe(true)
    expect(splitVisible(true, false, false)).toBe(false)
    expect(splitVisible(true, false, true)).toBe(true)
  })
})

describe('README badge', () => {
  const closed = tally(ids, votes({ a: 974, b: 1344 }))
  it('shows the winner of a closed poll, or one candidate with ?for', () => {
    expect(badgeMessage({ ids, names, tally: closed, open: false, n: closed.n, hoursLeft: null })).toMatchObject({ message: 'Windsurf wins 58% · final', color: '#A95228' })
    expect(badgeMessage({ ids, names, tally: closed, open: false, n: closed.n, hoursLeft: null, forIndex: 0 })).toMatchObject({ message: 'Cursor 42% · final', color: '#7A7C82' })
  })

  it('says "voting" while the split is hidden or the poll is small', () => {
    expect(badgeMessage({ ids, names, tally: null, open: true, n: 1204, hoursLeft: 3 }).message).toBe('voting · 3h left')
    const small = tally(ids, votes({ a: 4, b: 3 }))
    expect(badgeMessage({ ids, names, tally: small, open: true, n: 7, hoursLeft: 0, publicInterim: true }).message).toBe('voting · <1h left')
    const big = tally(ids, votes({ a: 506, b: 698 }))
    expect(badgeMessage({ ids, names, tally: big, open: true, n: big.n, hoursLeft: 3, publicInterim: true }).message).toBe('Windsurf leads 58% · 1,204 votes')
  })

  it('escapes names in the SVG and sizes the cells', () => {
    const svg = badgeSvg({ label: 'Pollreal', message: 'A<b> & "c" 50% · final', color: '#525357' })
    expect(svg).toContain('A&lt;b&gt; &amp; &quot;c&quot;')
    expect(svg).not.toContain('<b>')
    expect(textWidth('WWW')).toBeGreaterThan(textWidth('iii'))
  })

  it('draws a locked card while the split is hidden and the gauge after closing', () => {
    const locked = cardSvg({ title: 'Cursor vs Windsurf', segs: segments(ids, names, null), open: true, n: 12, hoursLeft: 5, split: false })
    expect(locked).toContain('#E7D8C9')
    expect(locked).toContain('split shown to voters')
    const done = cardSvg({ title: 'Cursor vs Windsurf', segs: segments(ids, names, closed), open: false, n: closed.n, hoursLeft: null, split: true })
    expect(done).toContain('FINAL')
    expect(done).toContain('Windsurf wins 58%')
  })

  it('counts whole hours left', () => {
    expect(hoursLeft(10 * 3600000 + 5, 0)).toBe(10)
    expect(hoursLeft(0, 1)).toBeNull()
  })
})

describe('gauge texts', () => {
  it('exist in every language', () => {
    for (const l of ['en', 'ko', 'es', 'fr', 'hi', 'de', 'ja', 'zh', 'ru'] as const) {
      const t = tr(l)
      expect(t.sideBehind('A', '3', 'B', '1h left')).toContain('A')
      expect(t.shareLead('A', 'A vs B', '1h left')).toContain('A vs B')
      expect(t.gaugeLocked.length).toBeGreaterThan(5)
    }
  })
})
