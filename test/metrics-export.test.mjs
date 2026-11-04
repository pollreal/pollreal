import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRow, checkManual, lastDoneDay, ledgerHeader, num, parseCsv, stageOf } from '../scripts/metrics-export.mjs'

const ROOT = join(import.meta.dirname, '..', '..')

const snap = {
  day: '2026-11-16',
  signups_total: 120,
  signups_new: 120,
  withdrawals_new: 1,
  votes_new: 450,
  polls_new: 12,
  seed_polls_new: 3,
  weekly_prev: 0,
  weekly_returned: 0,
  posts_new: 5,
  comments_new: 9,
  reports_new: 1,
  anomalies_new: 0,
  idv_checks: 130,
  idv_cost_krw: 6500,
  llm_cost_usd: 0.42,
  shares_new: 7,
  embed_loads_new: 30,
  invited_signups_new: 4,
  maker_votes_new: 2,
  refusals_new: 5,
}

describe('metrics ledger export', () => {
  it('reads the fixed header from scripts/p1_digest.py', () => {
    const h = ledgerHeader(readFileSync(join(ROOT, 'scripts', 'p1_digest.py'), 'utf8'))
    expect(h).toBe(
      'date,stage,signups_total,signups_new,votes_new,polls_new,weekly_return_rate,search_clicks_google,search_clicks_naver,promo_spend_krw,llm_cost_usd,idv_cost_krw,shares_new,embed_loads_new,invited_signups_new,maker_votes_new,refusals_new,notes',
    )
  })
  it('assigns stages from the launch day (30 + 60 days)', () => {
    expect(stageOf('2026-11-15', '2026-11-16')).toBeNull()
    expect(stageOf('2026-11-16', '2026-11-16')).toBe('ignite')
    expect(stageOf('2026-12-15', '2026-11-16')).toBe('ignite')
    expect(stageOf('2026-12-16', '2026-11-16')).toBe('selfrun')
    expect(stageOf('2027-02-13', '2026-11-16')).toBe('selfrun')
    expect(stageOf('2027-02-14', '2026-11-16')).toBe('judge')
  })
  it('uses database estimates unless a receipt/console figure is entered, and says so', () => {
    const est = buildRow(snap, undefined, '2026-11-16')
    expect(est.llm_cost_usd).toBe(0.42)
    expect(est.idv_cost_krw).toBe(6500)
    expect(est.promo_spend_krw).toBe(0)
    expect(est.weekly_return_rate).toBe('')
    expect(est.notes).toContain('LLM=DB추정')
    expect([est.shares_new, est.embed_loads_new, est.invited_signups_new, est.maker_votes_new, est.refusals_new]).toEqual([7, 30, 4, 2, 5])
    const real = buildRow({ ...snap, weekly_prev: 40, weekly_returned: 9 }, { llm_cost_usd: '0.5', idv_cost_krw: '7150', promo_spend_krw: '30000', search_clicks_google: '12', notes: '커뮤니티 글 2건' }, '2026-11-16')
    expect(real.llm_cost_usd).toBe(0.5)
    expect(real.idv_cost_krw).toBe(7150)
    expect(real.promo_spend_krw).toBe(30000)
    expect(real.search_clicks_google).toBe(12)
    expect(real.search_clicks_naver).toBe('')
    expect(real.weekly_return_rate).toBe('0.2250')
    expect(real.notes).not.toContain('추정')
    expect(real.notes).toContain('커뮤니티 글 2건')
  })
  it('reads "150,000" as a number and refuses anything that is not one (no NaN in the ledger)', () => {
    expect(num('150,000')).toBe(150000)
    expect(num(' ')).toBeNull()
    expect(() => num('150000원', 'x')).toThrow(/not a number/)
    expect(() => buildRow(snap, { promo_spend_krw: 'abc' }, '2026-11-16')).toThrow(/promo_spend_krw/)
  })
  it('makes every manual row land in the ledger or stops the export', () => {
    const H = 'date,search_clicks_google,search_clicks_naver,promo_spend_krw,llm_cost_usd,idv_cost_krw,notes'
    const t = (...dates) => ({ header: H, rows: dates.map((date) => ({ date })) })
    const snaps = new Set(['2026-11-16', '2026-11-17'])
    expect(checkManual(t('2026-11-16', '2026-11-19'), '2026-11-16', snaps, '2026-11-18')).toEqual(['2026-11-19']) // today waits
    expect(() => checkManual(t('2026-11-18'), '2026-11-16', snaps, '2026-11-18')).toThrow(/no database snapshot/) // finished day, no snapshot
    expect(() => checkManual(t('2026-11-16', '2026-11-16'), '2026-11-16', snaps, '2026-11-18')).toThrow(/twice/)
    expect(() => checkManual(t('2026-11-31'), '2026-11-16', snaps, '2026-11-18')).toThrow(/real YYYY-MM-DD/)
    expect(() => checkManual(t('2026/11/16'), '2026-11-16', snaps, '2026-11-18')).toThrow(/real YYYY-MM-DD/)
    expect(() => checkManual(t('2026-11-15'), '2026-11-16', snaps, '2026-11-18')).toThrow(/before --ignite-start/)
    expect(() => checkManual({ header: 'date,promo_spend', rows: [] }, '2026-11-16', snaps, '2026-11-18')).toThrow(/header/)
    expect(lastDoneDay(Date.UTC(2026, 10, 18, 15, 5))).toBe('2026-11-17') // 00:05 KST on the 19th: the 18th is not snapshotted yet
    expect(lastDoneDay(Date.UTC(2026, 10, 18, 15, 11))).toBe('2026-11-18')
  })
  it('parses quoted CSV fields', () => {
    expect(parseCsv('a,b\n1,"x, ""y""\nz"\n')).toEqual([
      ['a', 'b'],
      ['1', 'x, "y"\nz'],
    ])
  })
})
