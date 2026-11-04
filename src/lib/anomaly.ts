// Anomaly review (business plan §7.5). The same-device pattern is refused at the door (lib/device.ts), so the
// cron watches one pattern: a burst of one-sided votes, mostly from members who joined in the last 24 hours, that swings
// the poll away from its earlier result (or, without an earlier result, a very large burst). Maker-campaign votes are
// disclosed on the result instead and are left out here. A hit records one row in `anomalies` (once per poll) and puts
// the "under review" notice on the poll; votes are never removed or recounted — the operator decides (README).
import { ANOMALY, ANOMALY_NOTE, DEVICE_HASH_KEEP_DAYS } from '../config'
import { randomId } from './crypto'

const DAY = 24 * 60 * 60 * 1000

// "New" at vote time = joined less than ANOMALY.newMemberHours before the vote (kept on the vote: survives withdrawal).
export const isNewMember = (memberCreatedAt: number, now: number) => now - memberCreatedAt < ANOMALY.newMemberHours * 60 * 60 * 1000

export type WindowRow = { candidate_id: string; n: number; new_n: number }
export type BaseRow = { candidate_id: string; n: number }

export type SurgeFinding = { candidateId: string; windowVotes: number; newShare: number; topShare: number; earlierVotes: number; earlierShare: number | null }

// Pure rule so it can be tested without a database.
export function judgeSurge(window: WindowRow[], earlier: BaseRow[], cfg = ANOMALY): SurgeFinding | null {
  const n = window.reduce((s, r) => s + r.n, 0)
  if (n < cfg.surgeVotes) return null
  const newN = window.reduce((s, r) => s + r.new_n, 0)
  const top = [...window].sort((a, b) => b.n - a.n)[0]
  if (!top) return null
  const newShare = newN / n
  const topShare = top.n / n
  if (newShare < cfg.surgeNewShare || topShare < cfg.surgeTopShare) return null
  const baseN = earlier.reduce((s, r) => s + r.n, 0)
  const finding = { candidateId: top.candidate_id, windowVotes: n, newShare, topShare, earlierVotes: baseN, earlierShare: null as number | null }
  if (baseN >= cfg.baselineVotes) {
    const earlierShare = (earlier.find((r) => r.candidate_id === top.candidate_id)?.n ?? 0) / baseN
    return topShare - earlierShare >= cfg.swingPoints ? { ...finding, earlierShare } : null
  }
  return n >= cfg.surgeWithoutBaseline ? finding : null
}

const round = (x: number) => Math.round(x * 100) / 100

async function flag(db: D1Database, pollId: string, detail: object, now: number) {
  const r = await db
    .prepare("INSERT OR IGNORE INTO anomalies (id, poll_id, kind, detail, created_at) VALUES (?1, ?2, 'new_member_surge', ?3, ?4)")
    .bind(randomId(10), pollId, JSON.stringify(detail), now)
    .run()
  if ((r.meta.changes ?? 0) !== 1) return false
  await db.prepare("UPDATE polls SET review_note = ?2 WHERE id = ?1 AND review_note IS NULL AND status != 'hidden'").bind(pollId, ANOMALY_NOTE).run()
  return true
}

export async function scanAnomalies(db: D1Database, now: number, cfg = ANOMALY) {
  let flagged = 0
  const since = now - cfg.windowMinutes * 60 * 1000
  const win = await db
    .prepare(
      `SELECT v.poll_id, v.candidate_id, COUNT(*) AS n, SUM(v.new_member) AS new_n
       FROM votes v JOIN polls p ON p.id = v.poll_id
       WHERE v.created_at >= ?1 AND p.status != 'hidden' AND v.source != 'maker'
       GROUP BY v.poll_id, v.candidate_id`,
    )
    .bind(since)
    .all<WindowRow & { poll_id: string }>()
  const byPoll = new Map<string, WindowRow[]>()
  for (const r of win.results ?? []) byPoll.set(r.poll_id, [...(byPoll.get(r.poll_id) ?? []), r])
  for (const [pollId, rows] of byPoll) {
    if (rows.reduce((s, r) => s + r.n, 0) < cfg.surgeVotes) continue
    const earlier = await db
      .prepare("SELECT candidate_id, COUNT(*) AS n FROM votes WHERE poll_id = ?1 AND created_at < ?2 AND source != 'maker' GROUP BY candidate_id")
      .bind(pollId, since)
      .all<BaseRow>()
    const f = judgeSurge(rows, earlier.results ?? [], cfg)
    if (!f) continue
    const detail = { ...f, newShare: round(f.newShare), topShare: round(f.topShare), earlierShare: f.earlierShare === null ? null : round(f.earlierShare), windowMinutes: cfg.windowMinutes }
    if (await flag(db, pollId, detail, now)) flagged++
  }
  return flagged
}

// Device values are kept only as long as a review could need them (all four are written together with fp_hash).
export const purgeDeviceHashes = (db: D1Database, now: number) =>
  db
    .prepare('UPDATE votes SET fp_hash = NULL, dt_hash = NULL, dt_hash2 = NULL, net_hash = NULL WHERE fp_hash IS NOT NULL AND created_at < ?1')
    .bind(now - DEVICE_HASH_KEEP_DAYS * DAY)
    .run()
