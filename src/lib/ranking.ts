// Rankings (2026-11-02): every verified vote is a head-to-head result between the chosen product and each other
// candidate of that poll (a 3- or 4-way vote is split evenly over its pairs). Scores come from the Bradley–Terry model
// (as the LMSYS Chatbot Arena does), shown on an Elo-like scale around 1000. Votes lose half their weight every 90 days.
// A product is ranked once it has RANK_MIN_VOTES votes against RANK_MIN_RIVALS different rivals; products whose 95%
// ranges overlap share a rank. Only closed polls count (an open poll's split stays with its voters), polls under review
// and hidden polls are left out, and maker-campaign votes do not move scores (they still count in the poll's own result).
import { RANK_HALF_LIFE_DAYS, RANK_MIN_RIVALS, RANK_MIN_VOTES } from '../config'
import { candidateName, normKey } from './text'

// One row per (poll, candidate, day, maker-campaign?) with the number of votes.
export type VoteRow = { poll: string; key: string; day: number; maker: boolean; n: number }
// The candidates of each poll (product keys, in poll order).
export type PollRow = { poll: string; keys: string[] }

export type Ranked = {
  key: string
  score: number
  lo: number
  hi: number
  rank: number | null // null = under the threshold
  shared: boolean
  votes: number // votes cast in the polls it took part in (raw, every source)
  rivals: number // distinct products it met in polls that had votes
  wins: number
  losses: number
  ties: number
}

const DAY = 86400000
const SCALE = 400 / Math.LN10 // natural-log strength -> Elo points
const PRIOR = 1 // one virtual win and loss against a 1000-point anchor: keeps unbeaten products finite

export function rankCategory(polls: PollRow[], votes: VoteRow[], now: number, o: { minVotes?: number; minRivals?: number; halfLifeDays?: number } = {}): Ranked[] {
  const minVotes = o.minVotes ?? RANK_MIN_VOTES
  const minRivals = o.minRivals ?? RANK_MIN_RIVALS
  const halfLife = (o.halfLifeDays ?? RANK_HALF_LIFE_DAYS) * DAY
  const pollKeys = new Map(polls.map((p) => [p.poll, p.keys]))
  const keys = [...new Set(polls.flatMap((p) => p.keys))]
  const idx = new Map(keys.map((k, i) => [k, i]))
  const N = keys.length
  const wins = Array.from({ length: N }, () => new Float64Array(N)) // wins[i][j] = weighted wins of i over j

  // raw per-poll counts for votes, rivals and the win/loss record
  const perPoll = new Map<string, Map<string, number>>()
  for (const v of votes) {
    const ks = pollKeys.get(v.poll)
    if (!ks || !idx.has(v.key)) continue
    const m = perPoll.get(v.poll) ?? new Map<string, number>()
    m.set(v.key, (m.get(v.key) ?? 0) + v.n)
    perPoll.set(v.poll, m)
    if (v.maker || ks.length < 2) continue
    const w = (v.n * 0.5 ** Math.max(0, (now - v.day * DAY) / halfLife)) / (ks.length - 1)
    const i = idx.get(v.key) as number
    for (const other of ks) if (other !== v.key) wins[i]![idx.get(other) as number]! += w
  }

  // Bradley–Terry by minorisation–maximisation (Hunter 2004), with the virtual anchor fixed at strength 1.
  const p = new Float64Array(N).fill(1)
  const W = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    let s = PRIOR
    for (let j = 0; j < N; j++) s += wins[i]![j]!
    W[i] = s
  }
  for (let it = 0; it < 500; it++) {
    let delta = 0
    for (let i = 0; i < N; i++) {
      let d = (2 * PRIOR) / (p[i]! + 1)
      for (let j = 0; j < N; j++) {
        const games = wins[i]![j]! + wins[j]![i]!
        if (games) d += games / (p[i]! + p[j]!)
      }
      const next = W[i]! / d
      delta = Math.max(delta, Math.abs(Math.log(next / p[i]!)))
      p[i] = next
    }
    if (delta < 1e-9) break
  }

  const out: Ranked[] = keys.map((key, i) => {
    let info = (2 * PRIOR * p[i]!) / (p[i]! + 1) ** 2
    for (let j = 0; j < N; j++) {
      const games = wins[i]![j]! + wins[j]![i]!
      if (games) info += (games * p[i]! * p[j]!) / (p[i]! + p[j]!) ** 2
    }
    const score = 1000 + SCALE * Math.log(p[i]!)
    const half = 1.96 * SCALE * Math.sqrt(1 / info)
    let n = 0
    let w = 0
    let l = 0
    let t = 0
    const rivals = new Set<string>()
    for (const [poll, counts] of perPoll) {
      if (!pollKeys.get(poll)?.includes(key)) continue
      let total = 0
      for (const c of counts.values()) total += c
      if (!total) continue
      n += total
      for (const other of pollKeys.get(poll) ?? []) if (other !== key) rivals.add(other)
      const mine = counts.get(key) ?? 0
      const top = Math.max(...counts.values())
      const leaders = [...counts.values()].filter((c) => c === top).length
      if (mine === top && leaders === 1) w++
      else if (mine === top) t++
      else l++
    }
    return { key, score, lo: score - half, hi: score + half, rank: null, shared: false, votes: n, rivals: rivals.size, wins: w, losses: l, ties: t }
  })

  // Rank = 1 + the number of eligible products whose whole range sits above this one (Arena-style); equal ranks are shared.
  const eligible = out.filter((r) => r.votes >= minVotes && r.rivals >= minRivals)
  for (const r of eligible) r.rank = 1 + eligible.filter((x) => x !== r && x.lo > r.hi).length
  for (const r of eligible) r.shared = eligible.some((x) => x !== r && x.rank === r.rank)
  return out.sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9) || b.score - a.score)
}

// ---- daily job: read closed polls from D1, rank every category, replace the stored tables ----------------------------

export type RankRow = Ranked & { category: string; name: string; card_id: string | null; computed_at: number }
export type RankMeta = { category: string; items: number; ranked: number; votes: number; computed_at: number }

const ELIGIBLE = "p.status != 'hidden' AND p.review_note IS NULL AND p.closes_at <= ?1"

export async function computeRankings(db: D1Database, now: number) {
  const [cands, rows] = await Promise.all([
    db
      .prepare(`SELECT c.poll_id, c.id, c.maker, c.product, c.card_id, p.category, p.closes_at FROM candidates c JOIN polls p ON p.id = c.poll_id WHERE ${ELIGIBLE} ORDER BY p.closes_at, c.position`)
      .bind(now)
      .all<{ poll_id: string; id: string; maker: string; product: string; card_id: string | null; category: string; closes_at: number }>(),
    db
      .prepare(
        `SELECT v.poll_id, v.candidate_id, CAST(v.created_at / 86400000 AS INTEGER) AS day, (v.source = 'maker') AS maker, COUNT(*) AS n
           FROM votes v JOIN polls p ON p.id = v.poll_id WHERE ${ELIGIBLE} GROUP BY 1, 2, 3, 4`,
      )
      .bind(now)
      .all<{ poll_id: string; candidate_id: string; day: number; maker: number; n: number }>(),
  ])
  const keyOf = new Map<string, string>() // candidate id -> product key
  const byCat = new Map<string, { polls: Map<string, string[]>; votes: VoteRow[] }>()
  const label = new Map<string, { name: string; card: string | null }>() // latest name per key
  for (const c of cands.results) {
    const key = normKey(c.maker, c.product)
    keyOf.set(c.id, key)
    label.set(key, { name: candidateName(c), card: c.card_id })
    const cat = byCat.get(c.category) ?? { polls: new Map(), votes: [] }
    const ks = cat.polls.get(c.poll_id) ?? []
    ks.push(key)
    cat.polls.set(c.poll_id, ks)
    byCat.set(c.category, cat)
  }
  const catOfPoll = new Map(cands.results.map((c) => [c.poll_id, c.category]))
  for (const r of rows.results) {
    const key = keyOf.get(r.candidate_id)
    const cat = byCat.get(catOfPoll.get(r.poll_id) ?? '')
    if (key && cat) cat.votes.push({ poll: r.poll_id, key, day: r.day, maker: !!r.maker, n: r.n })
  }
  const out: RankRow[] = []
  const meta: RankMeta[] = []
  for (const [category, d] of byCat) {
    const ranked = rankCategory([...d.polls].map(([poll, keys]) => ({ poll, keys })), d.votes, now)
    for (const r of ranked) out.push({ ...r, category, name: label.get(r.key)?.name ?? r.key, card_id: label.get(r.key)?.card ?? null, computed_at: now })
    meta.push({ category, items: ranked.length, ranked: ranked.filter((r) => r.rank !== null).length, votes: d.votes.reduce((s, v) => s + v.n, 0), computed_at: now })
  }
  const stmts = [
    db.prepare('DELETE FROM rankings'),
    db.prepare('DELETE FROM ranking_meta'),
    ...out.map((r) =>
      db
        .prepare(
          'INSERT INTO rankings (category, item_key, name, card_id, score, lo, hi, rank, shared, votes, rivals, wins, losses, ties, computed_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)',
        )
        .bind(r.category, r.key, r.name, r.card_id, r.score, r.lo, r.hi, r.rank, r.shared ? 1 : 0, r.votes, r.rivals, r.wins, r.losses, r.ties, now),
    ),
    ...meta.map((m) => db.prepare('INSERT INTO ranking_meta (category, items, ranked, votes, computed_at) VALUES (?1, ?2, ?3, ?4, ?5)').bind(m.category, m.items, m.ranked, m.votes, now)),
  ]
  // A single batch is one transaction: readers never see a half-written ranking.
  await db.batch(stmts)
  return { categories: meta.length, items: out.length, ranked: out.filter((r) => r.rank !== null).length }
}

// Called by the 5-minute cron: recompute when the stored ranking is a day old (or missing).
export async function refreshRankingsIfStale(db: D1Database, now: number) {
  const last = await db.prepare('SELECT MAX(computed_at) AS t FROM ranking_meta').first<{ t: number | null }>()
  const t = last?.t ?? 0
  if (t && now - t < 24 * 60 * 60 * 1000) return null
  // nothing ranked yet (no closed polls): look again once an hour, not every 5 minutes
  if (!t && now % (60 * 60 * 1000) >= 5 * 60 * 1000) return null
  return computeRankings(db, now)
}

export const rankingsOf = (db: D1Database, category: string) =>
  db.prepare('SELECT * FROM rankings WHERE category = ?1 ORDER BY rank IS NULL, rank, score DESC').bind(category).all<RankRow & { shared: number }>()
export const rankingMeta = (db: D1Database) => db.prepare('SELECT * FROM ranking_meta').all<RankMeta>()
export const topRankings = (db: D1Database, perCategory: number) =>
  db
    .prepare('SELECT * FROM (SELECT r.*, ROW_NUMBER() OVER (PARTITION BY category ORDER BY rank) AS rn FROM rankings r WHERE rank IS NOT NULL) WHERE rn <= ?1 ORDER BY category, rank, score DESC')
    .bind(perCategory)
    .all<RankRow & { shared: number }>()
