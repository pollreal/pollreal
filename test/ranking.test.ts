import { describe, expect, it } from 'vitest'
import { type PollRow, type VoteRow, rankCategory } from '../src/lib/ranking'

const NOW = Date.UTC(2026, 10, 2)
const today = Math.floor(NOW / 86400000)
const loose = { minVotes: 1, minRivals: 1 }
const v = (poll: string, key: string, n: number, o: Partial<VoteRow> = {}): VoteRow => ({ poll, key, n, day: today, maker: false, ...o })
const byKey = (r: ReturnType<typeof rankCategory>) => new Map(r.map((x) => [x.key, x]))

describe('rankCategory', () => {
  it('gives equal scores to an even matchup and ranks a dominant product first', () => {
    const even = byKey(rankCategory([{ poll: 'p1', keys: ['a', 'b'] }], [v('p1', 'a', 50), v('p1', 'b', 50)], NOW, loose))
    expect(Math.abs((even.get('a')?.score ?? 0) - (even.get('b')?.score ?? 0))).toBeLessThan(0.001)
    const r = rankCategory([{ poll: 'p1', keys: ['a', 'b'] }], [v('p1', 'a', 90), v('p1', 'b', 10)], NOW, loose)
    expect(r[0]?.key).toBe('a')
    expect(r[0]?.rank).toBe(1)
    expect(r[1]?.rank).toBe(2)
  })

  it('rewards beating a strong rival more than farming a weak one', () => {
    // b beats the strong a narrowly; c crushes the weak d. Win counts would tie b and c — strength of schedule does not.
    const polls: PollRow[] = [
      { poll: 'p1', keys: ['a', 'x'] },
      { poll: 'p2', keys: ['b', 'a'] },
      { poll: 'p3', keys: ['d', 'y'] },
      { poll: 'p4', keys: ['c', 'd'] },
    ]
    const votes = [v('p1', 'a', 80), v('p1', 'x', 20), v('p2', 'b', 55), v('p2', 'a', 45), v('p3', 'd', 20), v('p3', 'y', 80), v('p4', 'c', 55), v('p4', 'd', 45)]
    const m = byKey(rankCategory(polls, votes, NOW, loose))
    expect(m.get('b')?.wins).toBe(1)
    expect(m.get('c')?.wins).toBe(1)
    expect(m.get('b')?.score ?? 0).toBeGreaterThan(m.get('c')?.score ?? 0)
  })

  it('uses margins and sample size, not poll counts', () => {
    const polls = [{ poll: 'p1', keys: ['a', 'b'] }]
    const narrow = byKey(rankCategory(polls, [v('p1', 'a', 51), v('p1', 'b', 49)], NOW, loose))
    const wide = byKey(rankCategory(polls, [v('p1', 'a', 90), v('p1', 'b', 10)], NOW, loose))
    expect(wide.get('a')?.score ?? 0).toBeGreaterThan(narrow.get('a')?.score ?? 0)
    const small = byKey(rankCategory(polls, [v('p1', 'a', 6), v('p1', 'b', 4)], NOW, loose))
    const big = byKey(rankCategory(polls, [v('p1', 'a', 600), v('p1', 'b', 400)], NOW, loose))
    const width = (x?: { lo: number; hi: number }) => (x ? x.hi - x.lo : 0)
    expect(width(big.get('a'))).toBeLessThan(width(small.get('a')))
  })

  it('shares a rank when the ranges overlap', () => {
    const r = byKey(rankCategory([{ poll: 'p1', keys: ['a', 'b'] }], [v('p1', 'a', 6), v('p1', 'b', 5)], NOW, loose))
    expect(r.get('a')?.rank).toBe(1)
    expect(r.get('b')?.rank).toBe(1)
    expect(r.get('a')?.shared).toBe(true)
  })

  it('splits a 3-way vote over its pairs and counts the record per poll', () => {
    const r = byKey(rankCategory([{ poll: 'p1', keys: ['a', 'b', 'c'] }], [v('p1', 'a', 30), v('p1', 'b', 20), v('p1', 'c', 10)], NOW, loose))
    expect(r.get('a')?.wins).toBe(1)
    expect(r.get('b')?.losses).toBe(1)
    expect(r.get('a')?.rivals).toBe(2)
    expect(r.get('a')?.votes).toBe(60)
    expect(r.get('a')?.score ?? 0).toBeGreaterThan(r.get('b')?.score ?? 0)
    expect(r.get('b')?.score ?? 0).toBeGreaterThan(r.get('c')?.score ?? 0)
  })

  it('lets old votes fade (half weight after 90 days)', () => {
    const polls = [{ poll: 'p1', keys: ['a', 'b'] }]
    const fresh = byKey(rankCategory(polls, [v('p1', 'a', 80), v('p1', 'b', 20)], NOW, loose))
    // a's wins are 180 days old (quarter weight), b's are today
    const faded = byKey(rankCategory(polls, [v('p1', 'a', 80, { day: today - 180 }), v('p1', 'b', 20)], NOW, loose))
    expect(faded.get('a')?.score ?? 0).toBeLessThan(fresh.get('a')?.score ?? 0)
    // 80 votes at a quarter weight = 20 effective, against b's fresh 20: even
    expect(Math.abs((faded.get('a')?.score ?? 0) - (faded.get('b')?.score ?? 0))).toBeLessThan(0.001)
  })

  it('ignores maker-campaign votes in the score but keeps them in the record', () => {
    const polls = [{ poll: 'p1', keys: ['a', 'b'] }]
    const r = byKey(rankCategory(polls, [v('p1', 'a', 10), v('p1', 'b', 10), v('p1', 'a', 500, { maker: true })], NOW, loose))
    expect(Math.abs((r.get('a')?.score ?? 0) - (r.get('b')?.score ?? 0))).toBeLessThan(0.001)
    expect(r.get('a')?.wins).toBe(1)
    expect(r.get('a')?.votes).toBe(520)
  })

  it('ranks only products over the vote and rival thresholds', () => {
    const polls: PollRow[] = [
      { poll: 'p1', keys: ['a', 'b'] },
      { poll: 'p2', keys: ['a', 'c'] },
      { poll: 'p3', keys: ['a', 'd'] },
    ]
    const votes = [v('p1', 'a', 100), v('p1', 'b', 60), v('p2', 'a', 70), v('p2', 'c', 50), v('p3', 'a', 30), v('p3', 'd', 20)]
    const r = byKey(rankCategory(polls, votes, NOW, { minVotes: 300, minRivals: 3 }))
    expect(r.get('a')?.votes).toBe(330)
    expect(r.get('a')?.rivals).toBe(3)
    expect(r.get('a')?.rank).toBe(1)
    expect(r.get('b')?.rank).toBeNull()
    expect(rankCategory([], [], NOW)).toEqual([])
  })
})
