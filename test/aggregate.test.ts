import { describe, expect, it } from 'vitest'
import { type Cell, tally } from '../src/lib/aggregate'

const cell = (candidate_id: string, age_band: string, gender: string, c: number): Cell => ({ candidate_id, age_band, gender, c })

describe('tally', () => {
  it('computes overall shares, n and the leader', () => {
    const t = tally(['a', 'b'], [cell('a', '30', 'M', 6), cell('b', '30', 'M', 3), cell('a', '20', 'F', 1)])
    expect(t.n).toBe(10)
    expect(t.overall).toEqual([
      { candidateId: 'a', count: 7, pct: 70 },
      { candidateId: 'b', count: 3, pct: 30 },
    ])
    expect(t.leaders).toEqual(['a'])
  })

  it('reports a tie as several leaders and no leader without votes', () => {
    expect(tally(['a', 'b'], [cell('a', '30', 'M', 5), cell('b', '30', 'F', 5)]).leaders).toEqual(['a', 'b'])
    const empty = tally(['a', 'b'], [])
    expect(empty.n).toBe(0)
    expect(empty.leaders).toEqual([])
    expect(empty.overall.every((s) => s.pct === 0)).toBe(true)
  })

  it('hides a small group and the group that would reveal it by subtraction', () => {
    // 남성 10, 여성 2: 여성 hidden; overall − 남성 would reveal 여성, so 남성 is hidden too.
    const t = tally(['a', 'b'], [cell('a', '30', 'M', 10), cell('b', '30', 'F', 2)])
    expect(t.byGender.map((g) => [g.key, g.suppressed])).toEqual([
      ['M', true],
      ['F', true],
    ])
    expect(t.byGender.every((g) => g.shares.length === 0)).toBe(true)
  })

  it('keeps hiding the smallest visible group until hidden votes reach the minimum', () => {
    const t = tally(['a', 'b'], [cell('a', '20', 'M', 6), cell('a', '30', 'M', 7), cell('b', '40', 'F', 3)])
    const byKey = Object.fromEntries(t.byAge.map((g) => [g.key, g.suppressed]))
    expect(byKey['40']).toBe(true) // 3 votes
    expect(byKey['20']).toBe(true) // secondary: hidden 3 -> 9
    expect(byKey['30']).toBe(false)
    expect(t.byAge.find((g) => g.key === '30')?.shares).toEqual([
      { candidateId: 'a', count: 7, pct: 100 },
      { candidateId: 'b', count: 0, pct: 0 },
    ])
  })

  it('does not hide visible groups because of empty groups', () => {
    const t = tally(['a', 'b'], [cell('a', '30', 'M', 4), cell('b', '30', 'M', 2)])
    expect(t.byGender.find((g) => g.key === 'M')?.suppressed).toBe(false)
    expect(t.byGender.find((g) => g.key === 'F')?.suppressed).toBe(true)
  })

  it('ignores votes for candidates outside the poll', () => {
    expect(tally(['a'], [cell('zz', '30', 'M', 9), cell('a', '30', 'M', 1)]).n).toBe(1)
  })
})
