// Daily metrics (step 8, business plan §6.2). The cron writes one snapshot per completed KST day into metrics_daily;
// scripts/metrics-export.mjs turns the snapshots into ops/metrics_daily.csv. Snapshots are never recomputed in
// production, so a later withdrawal (which unlinks votes and posts) does not rewrite an earlier day.
import { IDV_UNIT_KRW, METRICS_BACKFILL_DAYS, METRICS_DAY_GRACE_MS } from '../config'
import { KST_OFFSET_MS } from './time'

const DAY = 24 * 60 * 60 * 1000

// KST calendar day helpers. A day "2026-11-16" runs from 2026-11-15T15:00Z to 2026-11-16T15:00Z.
export const kstDay = (t: number) => new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10)
export const dayStart = (day: string) => Date.parse(`${day}T00:00:00Z`) - KST_OFFSET_MS
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && kstDay(dayStart(s)) === s

export type DayMetrics = {
  day: string
  signups_total: number
  signups_new: number
  withdrawals_new: number
  votes_new: number
  polls_new: number
  seed_polls_new: number
  weekly_prev: number
  weekly_returned: number
  posts_new: number
  comments_new: number
  reports_new: number
  anomalies_new: number
  idv_checks: number
  idv_cost_krw: number
  llm_cost_usd: number
  shares_new: number
  embed_loads_new: number
  invited_signups_new: number
  maker_votes_new: number
  refusals_new: number
}

// Activity for the weekly return rate = voting, creating a poll, writing a post or a comment (§6.2).
const ACTIVITY = `SELECT member_id, created_at FROM votes WHERE member_id IS NOT NULL AND created_at >= ?1 AND created_at < ?3
  UNION ALL SELECT member_id, created_at FROM polls WHERE member_id IS NOT NULL AND created_at >= ?1 AND created_at < ?3
  UNION ALL SELECT member_id, created_at FROM posts WHERE member_id IS NOT NULL AND created_at >= ?1 AND created_at < ?3
  UNION ALL SELECT member_id, created_at FROM comments WHERE member_id IS NOT NULL AND created_at >= ?1 AND created_at < ?3`

export async function computeDay(db: D1Database, day: string): Promise<DayMetrics> {
  const s = dayStart(day)
  const e = s + DAY
  const count = (sql: string) => db.prepare(sql).bind(s, e)
  const rows = await db.batch<Record<string, number>>([
    db.prepare('SELECT COUNT(*) AS v FROM members WHERE created_at < ?1').bind(e),
    count('SELECT COUNT(*) AS v FROM members WHERE created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM members WHERE withdrawn_at >= ?1 AND withdrawn_at < ?2'),
    count('SELECT COUNT(*) AS v FROM votes WHERE created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM polls WHERE is_seed = 0 AND created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM polls WHERE is_seed = 1 AND created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM posts WHERE created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM comments WHERE created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM reports WHERE created_at >= ?1 AND created_at < ?2'),
    count('SELECT COUNT(*) AS v FROM anomalies WHERE created_at >= ?1 AND created_at < ?2'),
    // Verification cost = SMS codes actually sent (design v0.2 §8); refused requests cost nothing.
    count("SELECT COUNT(*) AS v FROM otp_log WHERE outcome = 'sent' AND created_at >= ?1 AND created_at < ?2"),
    count('SELECT COALESCE(SUM(cost_usd), 0) AS v FROM ai_spend WHERE created_at >= ?1 AND created_at < ?2'),
    // last week = days -13..-7, this week = days -6..0 (rolling, ending with this day)
    db
      .prepare(
        `WITH act AS (${ACTIVITY}),
           prev AS (SELECT DISTINCT member_id FROM act WHERE created_at < ?2),
           cur AS (SELECT DISTINCT member_id FROM act WHERE created_at >= ?2)
         SELECT (SELECT COUNT(*) FROM prev) AS prev_n, (SELECT COUNT(*) FROM prev WHERE member_id IN (SELECT member_id FROM cur)) AS back_n`,
      )
      .bind(e - 14 * DAY, e - 7 * DAY, e),
    // viral: share clicks, embed loads, sign-ups through an invite, maker-campaign votes, attempts blocked at the door
    db.prepare("SELECT COALESCE(SUM(n), 0) AS v FROM share_counts WHERE day = ?1 AND kind = 'share_click'").bind(day),
    db.prepare("SELECT COALESCE(SUM(n), 0) AS v FROM share_counts WHERE day = ?1 AND kind = 'embed_load'").bind(day),
    count('SELECT COUNT(*) AS v FROM members WHERE invited_by IS NOT NULL AND created_at >= ?1 AND created_at < ?2'),
    count("SELECT COUNT(*) AS v FROM votes WHERE source = 'maker' AND created_at >= ?1 AND created_at < ?2"),
    count('SELECT COUNT(*) AS v FROM vote_refusals WHERE created_at >= ?1 AND created_at < ?2'),
  ])
  const v = (i: number) => Number(rows[i]?.results?.[0]?.v ?? 0)
  const week = rows[12]?.results?.[0] ?? {}
  const idv = v(10)
  return {
    day,
    signups_total: v(0),
    signups_new: v(1),
    withdrawals_new: v(2),
    votes_new: v(3),
    polls_new: v(4),
    seed_polls_new: v(5),
    posts_new: v(6),
    comments_new: v(7),
    reports_new: v(8),
    anomalies_new: v(9),
    idv_checks: idv,
    idv_cost_krw: idv * IDV_UNIT_KRW,
    llm_cost_usd: Math.round(v(11) * 10000) / 10000,
    weekly_prev: Number(week.prev_n ?? 0),
    weekly_returned: Number(week.back_n ?? 0),
    shares_new: v(13),
    embed_loads_new: v(14),
    invited_signups_new: v(15),
    maker_votes_new: v(16),
    refusals_new: v(17),
  }
}

const COLS = [
  'day',
  'signups_total',
  'signups_new',
  'withdrawals_new',
  'votes_new',
  'polls_new',
  'seed_polls_new',
  'weekly_prev',
  'weekly_returned',
  'posts_new',
  'comments_new',
  'reports_new',
  'anomalies_new',
  'idv_checks',
  'idv_cost_krw',
  'llm_cost_usd',
  'shares_new',
  'embed_loads_new',
  'invited_signups_new',
  'maker_votes_new',
  'refusals_new',
] as const

export async function saveDay(db: D1Database, m: DayMetrics, now: number, replace = false) {
  const marks = [...COLS, 'computed_at'].map((_, i) => `?${i + 1}`).join(', ')
  await db
    .prepare(`INSERT ${replace ? 'OR REPLACE' : 'OR IGNORE'} INTO metrics_daily (${COLS.join(', ')}, computed_at) VALUES (${marks})`)
    .bind(...COLS.map((k) => m[k]), now)
    .run()
}

// Cron: snapshot every completed KST day of the last METRICS_BACKFILL_DAYS that has no row yet (missed crons included).
export async function snapshotDays(db: D1Database, now: number) {
  const last = kstDay(now - METRICS_DAY_GRACE_MS - DAY) // the latest day that ended at least the grace period ago
  const days = Array.from({ length: METRICS_BACKFILL_DAYS }, (_, i) => kstDay(dayStart(last) - i * DAY))
  const have = await db
    .prepare('SELECT day FROM metrics_daily WHERE day >= ?1')
    .bind(days.at(-1))
    .all<{ day: string }>()
  const done = new Set((have.results ?? []).map((r) => r.day))
  const todo = days.filter((d) => !done.has(d))
  for (const d of todo.reverse()) await saveDay(db, await computeDay(db, d), now)
  return todo.length
}
