import { DEVICE_HASH_KEEP_DAYS, POLL_DURATION_MS, REJOIN_BLOCK_DAYS, type Source, VOTES_PER_NETWORK_PER_POLL } from '../config'
import type { Member } from '../env'
import type { Cell } from './aggregate'
import { randomId } from './crypto'
import { normKey, slugOf } from './text'
import type { PollInput } from './validate'
import { WITHDRAW_SQL } from './withdraw'

export type PollRow = {
  id: string
  member_id: string | null
  category: string
  question: string | null
  slug: string
  is_seed: number
  status: string
  review_note: string | null
  created_at: number
  closes_at: number
  closed_at: number | null
  lang: string
}

export type CandRow = {
  id: string
  poll_id: string
  position: number
  maker: string
  product: string
  norm_key: string
  card_id: string | null
  interest_note: string | null
}

export type PollSummary = PollRow & { candidates: CandRow[]; votes: number }

const all = async <T>(stmt: D1PreparedStatement) => (await stmt.all<T>()).results ?? []

// ---- polls ----

export const getPoll = (db: D1Database, id: string) => db.prepare('SELECT * FROM polls WHERE id = ?1').bind(id).first<PollRow>()

export const getCandidates = (db: D1Database, pollId: string) =>
  all<CandRow>(db.prepare('SELECT * FROM candidates WHERE poll_id = ?1 ORDER BY position').bind(pollId))

async function withDetails(db: D1Database, polls: PollRow[]): Promise<PollSummary[]> {
  if (!polls.length) return []
  const ids = polls.map((p) => p.id)
  const marks = ids.map((_, i) => `?${i + 1}`).join(',')
  const cands = await all<CandRow>(db.prepare(`SELECT * FROM candidates WHERE poll_id IN (${marks}) ORDER BY poll_id, position`).bind(...ids))
  const counts = await all<{ poll_id: string; n: number }>(
    db.prepare(`SELECT poll_id, COUNT(*) AS n FROM votes WHERE poll_id IN (${marks}) GROUP BY poll_id`).bind(...ids),
  )
  const byPoll = new Map<string, CandRow[]>()
  for (const c of cands) byPoll.set(c.poll_id, [...(byPoll.get(c.poll_id) ?? []), c])
  const n = new Map(counts.map((r) => [r.poll_id, r.n]))
  return polls.map((p) => ({ ...p, candidates: byPoll.get(p.id) ?? [], votes: n.get(p.id) ?? 0 }))
}

export async function listOpen(db: D1Database, now: number, limit: number, category?: string) {
  const sql = `SELECT * FROM polls WHERE status = 'open' AND closes_at > ?1 ${category ? 'AND category = ?3' : ''} ORDER BY closes_at ASC LIMIT ?2`
  const stmt = category ? db.prepare(sql).bind(now, limit, category) : db.prepare(sql).bind(now, limit)
  return withDetails(db, await all<PollRow>(stmt))
}

export async function listClosed(db: D1Database, now: number, limit: number, category?: string) {
  const sql = `SELECT * FROM polls WHERE status != 'hidden' AND closes_at <= ?1 ${category ? 'AND category = ?3' : ''} ORDER BY closes_at DESC LIMIT ?2`
  const stmt = category ? db.prepare(sql).bind(now, limit, category) : db.prepare(sql).bind(now, limit)
  return withDetails(db, await all<PollRow>(stmt))
}

export async function searchPolls(db: D1Database, q: string, limit: number) {
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
  const rows = await all<PollRow>(
    db
      .prepare(
        `SELECT DISTINCT p.* FROM polls p JOIN candidates c ON c.poll_id = p.id
         WHERE p.status != 'hidden' AND (c.product LIKE ?1 ESCAPE '\\' OR c.maker LIKE ?1 ESCAPE '\\')
         ORDER BY p.created_at DESC LIMIT ?2`,
      )
      .bind(like, limit),
  )
  return withDetails(db, rows)
}

export async function countPollsSince(db: D1Database, memberId: string, since: number) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM polls WHERE member_id = ?1 AND created_at >= ?2').bind(memberId, since).first<{ n: number }>()
  return r?.n ?? 0
}

// One transaction: poll + candidates. Each candidate is linked to the shared AI card of the same product
// (normalized key); a missing card is created as 'pending' for the card pipeline (step 5) to fill.
export async function createPoll(db: D1Database, memberId: string | null, input: PollInput, now: number, lang: string, isSeed = false) {
  const id = randomId(8)
  const slug = slugOf(input.candidates.map((c) => c.product))
  await db.batch([
    db
      .prepare('INSERT INTO polls (id, member_id, category, question, slug, is_seed, status, created_at, closes_at, lang) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)')
      .bind(id, memberId, input.category, input.question, slug, isSeed ? 1 : 0, 'open', now, now + POLL_DURATION_MS, lang),
    ...input.candidates.flatMap((c, i) => {
      const key = normKey(c.maker, c.product)
      return [
        db
          .prepare("INSERT OR IGNORE INTO cards (id, norm_key, maker, product, status, created_at) VALUES (?1, ?2, ?3, ?4, 'pending', ?5)")
          .bind(randomId(10), key, c.maker, c.product, now),
        db
          .prepare(
            'INSERT INTO candidates (id, poll_id, position, maker, product, norm_key, card_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, (SELECT id FROM cards WHERE norm_key = ?6))',
          )
          .bind(randomId(10), id, i + 1, c.maker, c.product, key),
      ]
    }),
  ])
  return { id, slug }
}

export type CardRow = {
  id: string
  norm_key: string
  maker: string
  product: string
  status: string
  summary_json: string | null
  sources_json: string | null
  official_source: number
  official_url: string | null
  product_title: string | null
  model: string | null
  checked_at: number | null
  attempts: number
  last_error: string | null
  deep_state: number // 0 none, 1 queued, 2 done, 3 gave up
  deep_attempts: number
}

export async function getCards(db: D1Database, ids: string[]) {
  if (!ids.length) return new Map<string, CardRow>()
  const marks = ids.map((_, i) => `?${i + 1}`).join(',')
  const rows = await all<CardRow>(db.prepare(`SELECT * FROM cards WHERE id IN (${marks})`).bind(...ids))
  return new Map(rows.map((r) => [r.id, r]))
}

export async function pollsByIds(db: D1Database, ids: string[]) {
  if (!ids.length) return []
  const marks = ids.map((_, i) => `?${i + 1}`).join(',')
  return withDetails(db, await all<PollRow>(db.prepare(`SELECT * FROM polls WHERE id IN (${marks})`).bind(...ids)))
}

// ---- votes ----

// device = R1 device token, fingerprint = R2, network_cap = R3 (lib/device.ts).
export type VoteOutcome = 'ok' | 'closed' | 'duplicate' | 'invalid' | 'device' | 'fingerprint' | 'network_cap'
export type Refusal = 'device' | 'fingerprint' | 'network_cap' | 'network'

export type VoteInput = {
  pollId: string
  memberId: string
  candidateId: string
  ageBand: string
  gender: string
  newMember: boolean
  source: Source
  makerClaimId: string | null
  dtHash: string
  dtHash2: string | null
  fpHash: string
  netHash: string
  now: number
}

export async function deviceConflict(db: D1Database, v: Pick<VoteInput, 'pollId' | 'dtHash' | 'dtHash2' | 'fpHash' | 'netHash'>) {
  const r = await db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM votes WHERE poll_id = ?1 AND (dt_hash IN (?2, ?3) OR dt_hash2 IN (?2, ?3))) AS dev,
         (SELECT COUNT(*) FROM votes WHERE poll_id = ?1 AND fp_hash = ?4) AS fp,
         (SELECT COUNT(*) FROM votes WHERE poll_id = ?1 AND net_hash = ?5) AS net`,
    )
    .bind(v.pollId, v.dtHash, v.dtHash2 ?? v.dtHash, v.fpHash, v.netHash)
    .first<{ dev: number; fp: number; net: number }>()
  if (!r) return null
  if (r.dev > 0) return 'device' as const
  if (r.fp > 0) return 'fingerprint' as const
  if (r.net >= VOTES_PER_NETWORK_PER_POLL) return 'network_cap' as const
  return null
}

export async function castVote(db: D1Database, v: VoteInput): Promise<VoteOutcome> {
  const conflict = await deviceConflict(db, v)
  if (conflict) return conflict
  try {
    // One statement (atomic in D1): the vote is written only if the candidate belongs to the open poll AND no vote of
    // this poll carries either device token AND the network is under its cap — so simultaneous requests cannot slip
    // past the checks above. Unique indexes back the token and fingerprint rules as well.
    const r = await db
      .prepare(
        `INSERT INTO votes (poll_id, member_id, candidate_id, age_band, gender, new_member, source, maker_claim_id, dt_hash, dt_hash2, fp_hash, net_hash, created_at)
         SELECT ?1, ?2, c.id, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13 FROM candidates c JOIN polls p ON p.id = c.poll_id
         WHERE c.id = ?3 AND c.poll_id = ?1 AND p.status = 'open' AND p.closes_at > ?13
           AND NOT EXISTS (SELECT 1 FROM votes x WHERE x.poll_id = ?1 AND (x.dt_hash IN (?9, ?14) OR x.dt_hash2 IN (?9, ?14)))
           AND (SELECT COUNT(*) FROM votes y WHERE y.poll_id = ?1 AND y.net_hash = ?12) < ?15`,
      )
      .bind(
        v.pollId, v.memberId, v.candidateId, v.ageBand, v.gender, v.newMember ? 1 : 0, v.source, v.makerClaimId,
        v.dtHash, v.dtHash2, v.fpHash, v.netHash, v.now, v.dtHash2 ?? v.dtHash, VOTES_PER_NETWORK_PER_POLL,
      )
      .run()
    if (r.meta.changes === 1) return 'ok'
    const p = await getPoll(db, v.pollId)
    if (!p || p.status !== 'open' || p.closes_at <= v.now) return 'closed'
    return (await deviceConflict(db, v)) ?? 'invalid'
  } catch (e) {
    const msg = String(e)
    if (/UNIQUE/i.test(msg) && /dt_hash/.test(msg)) return 'device'
    if (/UNIQUE/i.test(msg) && /fp_hash/.test(msg)) return 'fingerprint'
    if (/UNIQUE/i.test(msg)) return 'duplicate'
    throw e
  }
}

export const logRefusal = (db: D1Database, pollId: string, reason: Refusal, whoHash: string, now: number) =>
  db.prepare('INSERT OR IGNORE INTO vote_refusals (poll_id, reason, who_hash, created_at) VALUES (?1, ?2, ?3, ?4)').bind(pollId, reason, whoHash, now).run()

// "How these votes were cast" (design v0.2 §5): new-member share, maker-campaign votes by maker, refusals by reason.
export type Composition = {
  n: number
  newMembers: number
  maker: number
  makers: { maker: string; n: number }[]
  refusals: Record<Refusal, number>
}

export async function composition(db: D1Database, pollId: string): Promise<Composition> {
  const [base, makers, refusals] = await db.batch<Record<string, unknown>>([
    db
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(new_member), 0) AS nm, COALESCE(SUM(CASE WHEN source = 'maker' THEN 1 ELSE 0 END), 0) AS mk FROM votes WHERE poll_id = ?1")
      .bind(pollId),
    db
      .prepare(
        `SELECT k.maker AS maker, COUNT(*) AS n FROM votes v JOIN maker_claims m ON m.id = v.maker_claim_id JOIN cards k ON k.id = m.card_id
         WHERE v.poll_id = ?1 AND v.source = 'maker' GROUP BY k.maker ORDER BY n DESC`,
      )
      .bind(pollId),
    db.prepare('SELECT reason, COUNT(*) AS n FROM vote_refusals WHERE poll_id = ?1 GROUP BY reason').bind(pollId),
  ])
  const b = (base?.results?.[0] ?? {}) as { n?: number; nm?: number; mk?: number }
  const r = Object.fromEntries(((refusals?.results ?? []) as { reason: string; n: number }[]).map((x) => [x.reason, x.n]))
  return {
    n: b.n ?? 0,
    newMembers: b.nm ?? 0,
    maker: b.mk ?? 0,
    makers: (makers?.results ?? []) as { maker: string; n: number }[],
    refusals: { device: r.device ?? 0, fingerprint: r.fingerprint ?? 0, network_cap: r.network_cap ?? 0, network: r.network ?? 0 },
  }
}

export const voteCells = (db: D1Database, pollId: string) =>
  all<Cell>(db.prepare('SELECT candidate_id, age_band, gender, COUNT(*) AS c FROM votes WHERE poll_id = ?1 GROUP BY 1, 2, 3').bind(pollId))

export async function myChoice(db: D1Database, pollId: string, memberId: string) {
  const r = await db.prepare('SELECT candidate_id FROM votes WHERE poll_id = ?1 AND member_id = ?2').bind(pollId, memberId).first<{ candidate_id: string }>()
  return r?.candidate_id ?? null
}

// ---- members & sessions ----

const MEMBER_COLS = 'm.id, m.provider, m.birth_year, m.gender, m.nickname, m.status, m.suspended_until, m.created_at, m.phone_country, m.lang, m.invite_code'

// Whatever the status: the caller decides with memberActive (a suspension may have ended before the cron noticed).
export const memberBySession = (db: D1Database, sidHash: string, now: number) =>
  db
    .prepare(`SELECT ${MEMBER_COLS} FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.id = ?1 AND s.expires_at > ?2`)
    .bind(sidHash, now)
    .first<Member>()

export const createSession = (db: D1Database, sidHash: string, memberId: string, now: number, expires: number) =>
  db.prepare('INSERT INTO sessions (id, member_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)').bind(sidHash, memberId, now, expires).run()

export const deleteSession = (db: D1Database, sidHash: string) => db.prepare('DELETE FROM sessions WHERE id = ?1').bind(sidHash).run()

// The phone hash stays 30 days after withdrawal (no re-joining to vote twice), then maintenance clears it.
export const memberByPhone = (db: D1Database, phoneHash: string) =>
  db.prepare(`SELECT ${MEMBER_COLS} FROM members m WHERE m.phone_hash = ?1`).bind(phoneHash).first<Member>()

export const memberById = (db: D1Database, id: string) => db.prepare(`SELECT ${MEMBER_COLS} FROM members m WHERE m.id = ?1`).bind(id).first<Member>()

export const memberByInviteCode = (db: D1Database, code: string) => db.prepare(`SELECT ${MEMBER_COLS} FROM members m WHERE m.invite_code = ?1`).bind(code).first<Member>()

export async function invitedCount(db: D1Database, memberId: string) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM members WHERE invited_by = ?1').bind(memberId).first<{ n: number }>()
  return r?.n ?? 0
}

export const logIdentityCheck = (db: D1Database, outcome: 'joined' | 'duplicate' | 'rejoin_blocked' | 'underage' | 'bad_result', now: number) =>
  db.prepare('INSERT INTO idv_checks (outcome, created_at) VALUES (?1, ?2)').bind(outcome, now).run()

// Withdrawal (and termination — same path): the statements live in src/lib/withdraw.ts, shared with scripts/terminate.mjs.
export async function withdrawMember(db: D1Database, memberId: string, now: number) {
  await db.batch(WITHDRAW_SQL.map((s) => (s.includes('?2') ? db.prepare(s).bind(memberId, now) : db.prepare(s).bind(memberId))))
}

// ---- operator notices (warnings, suspensions, information — written by hand, see README "Member sanctions") ----

export type NoticeRow = { id: string; member_id: string; kind: 'warning' | 'suspension' | 'info'; body: string; created_at: number; read_at: number | null }

export const noticesOf = (db: D1Database, memberId: string) =>
  all<NoticeRow>(db.prepare('SELECT * FROM notices WHERE member_id = ?1 ORDER BY created_at DESC LIMIT 50').bind(memberId))

export const markNoticesRead = (db: D1Database, memberId: string, now: number) =>
  db.prepare('UPDATE notices SET read_at = ?2 WHERE member_id = ?1 AND read_at IS NULL').bind(memberId, now).run()

export async function unreadNotices(db: D1Database, memberId: string) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM notices WHERE member_id = ?1 AND read_at IS NULL').bind(memberId).first<{ n: number }>()
  return r?.n ?? 0
}

export const myPolls = async (db: D1Database, memberId: string) =>
  withDetails(db, await all<PollRow>(db.prepare('SELECT * FROM polls WHERE member_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(memberId)))

// The member's own choices (visible only to that member on /me).
export async function myVotes(db: D1Database, memberId: string) {
  const rows = await all<{ poll_id: string; candidate_id: string }>(
    db.prepare('SELECT poll_id, candidate_id FROM votes WHERE member_id = ?1 ORDER BY created_at DESC LIMIT 100').bind(memberId),
  )
  const polls = new Map((await pollsByIds(db, rows.map((r) => r.poll_id))).map((p) => [p.id, p]))
  return rows.flatMap((r) => {
    const poll = polls.get(r.poll_id)
    const choice = poll?.candidates.find((c) => c.id === r.candidate_id)
    return poll && choice ? [{ poll, choice }] : []
  })
}

// ---- scheduled maintenance ----

export async function maintenance(db: D1Database, now: number) {
  const day = 24 * 60 * 60 * 1000
  const rejoin = now - REJOIN_BLOCK_DAYS * day
  const keep = now - DEVICE_HASH_KEEP_DAYS * day
  const [closed] = await db.batch([
    db.prepare("UPDATE polls SET status = 'closed', closed_at = closes_at WHERE status = 'open' AND closes_at <= ?1").bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?1').bind(now),
    db.prepare("UPDATE members SET phone_hash = NULL WHERE status = 'withdrawn' AND phone_hash IS NOT NULL AND withdrawn_at <= ?1").bind(rejoin),
    // A timed suspension ends on its own (memberActive already lets the member in from that moment; this keeps the row honest).
    db.prepare("UPDATE members SET status = 'active', suspended_until = NULL WHERE status = 'suspended' AND suspended_until IS NOT NULL AND suspended_until <= ?1").bind(now),
    db.prepare('DELETE FROM phone_flows WHERE expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM challenges WHERE expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM otp_log WHERE created_at < ?1').bind(keep),
  ])
  return closed?.meta.changes ?? 0
}

export const sitemapPolls = (db: D1Database, limit: number) =>
  all<{ id: string; slug: string; created_at: number; closes_at: number }>(
    db.prepare("SELECT id, slug, created_at, closes_at FROM polls WHERE status != 'hidden' ORDER BY closes_at DESC LIMIT ?1").bind(limit),
  )

export async function voteCount(db: D1Database, pollId: string) {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM votes WHERE poll_id = ?1').bind(pollId).first<{ n: number }>()
  return r?.n ?? 0
}
