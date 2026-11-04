import { REPORT_HIDE_THRESHOLD, type ReportReason, TEMP_HIDE_DAYS } from '../config'
import { randomId } from './crypto'

export type PostRow = {
  id: string
  member_id: string | null
  nickname: string
  title: string
  body: string
  status: string
  hidden_until: number | null
  comment_count: number
  created_at: number
}

export type CommentRow = {
  id: string
  post_id: string
  member_id: string | null
  nickname: string
  body: string
  status: string
  hidden_until: number | null
  created_at: number
}

const all = async <T>(stmt: D1PreparedStatement) => (await stmt.all<T>()).results ?? []

// ---- posts & comments ----

// Author-deleted posts drop out of the list; temporary measures and removals stay listed as such (제44조의2② 공시).
export async function listPosts(db: D1Database, page: number, size: number) {
  const rows = await all<PostRow>(
    db.prepare("SELECT * FROM posts WHERE status != 'deleted' ORDER BY created_at DESC LIMIT ?1 OFFSET ?2").bind(size, (page - 1) * size),
  )
  const total = await db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status != 'deleted'").first<{ n: number }>()
  return { rows, total: total?.n ?? 0 }
}

export const latestPosts = (db: D1Database, n: number) =>
  all<PostRow>(db.prepare("SELECT * FROM posts WHERE status = 'visible' ORDER BY created_at DESC LIMIT ?1").bind(n))

export const getPost = (db: D1Database, id: string) => db.prepare('SELECT * FROM posts WHERE id = ?1').bind(id).first<PostRow>()

export const getComments = (db: D1Database, postId: string) =>
  all<CommentRow>(db.prepare("SELECT * FROM comments WHERE post_id = ?1 AND status != 'deleted' ORDER BY created_at").bind(postId))

export const myPosts = (db: D1Database, memberId: string) =>
  all<PostRow>(db.prepare("SELECT * FROM posts WHERE member_id = ?1 AND status != 'deleted' ORDER BY created_at DESC LIMIT 100").bind(memberId))

export async function countSince(db: D1Database, table: 'posts' | 'comments', memberId: string, since: number) {
  const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE member_id = ?1 AND created_at >= ?2`).bind(memberId, since).first<{ n: number }>()
  return r?.n ?? 0
}

export async function createPost(db: D1Database, p: { memberId: string; nickname: string; title: string; body: string; now: number }) {
  const id = randomId(8)
  await db
    .prepare('INSERT INTO posts (id, member_id, nickname, title, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
    .bind(id, p.memberId, p.nickname, p.title, p.body, p.now)
    .run()
  return id
}

const recount = (db: D1Database, postId: string) =>
  db
    .prepare("UPDATE posts SET comment_count = (SELECT COUNT(*) FROM comments WHERE post_id = ?1 AND status = 'visible') WHERE id = ?1")
    .bind(postId)

export async function createComment(db: D1Database, c: { postId: string; memberId: string; nickname: string; body: string; now: number }) {
  await db.batch([
    db
      .prepare('INSERT INTO comments (id, post_id, member_id, nickname, body, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(randomId(10), c.postId, c.memberId, c.nickname, c.body, c.now),
    recount(db, c.postId),
  ])
}

export async function deleteOwnPost(db: D1Database, id: string, memberId: string) {
  const r = await db.prepare("UPDATE posts SET status = 'deleted' WHERE id = ?1 AND member_id = ?2 AND status = 'visible'").bind(id, memberId).run()
  return r.meta.changes === 1
}

export async function deleteOwnComment(db: D1Database, id: string, memberId: string) {
  const c = await db.prepare('SELECT post_id FROM comments WHERE id = ?1 AND member_id = ?2').bind(id, memberId).first<{ post_id: string }>()
  if (!c) return null
  await db.batch([db.prepare("UPDATE comments SET status = 'deleted' WHERE id = ?1 AND status = 'visible'").bind(id), recount(db, c.post_id)])
  return c.post_id
}

// ---- reports ----

export type TargetType = 'poll' | 'post' | 'comment'

export type ReportOutcome = { result: 'duplicate' } | { result: 'ok'; action: 'blocked' | 'temp_measure' | 'review' | 'hidden_by_reports' | 'received' }

const day = 24 * 60 * 60 * 1000

async function hide(db: D1Database, type: TargetType, id: string, until: number | null) {
  if (type === 'poll') {
    await db.prepare("UPDATE polls SET status = 'hidden' WHERE id = ?1").bind(id).run()
    return
  }
  const table = type === 'post' ? 'posts' : 'comments'
  await db.prepare(`UPDATE ${table} SET status = 'temp_hidden', hidden_until = ?2 WHERE id = ?1 AND status = 'visible'`).bind(id, until).run()
  if (type === 'comment') {
    const c = await db.prepare('SELECT post_id FROM comments WHERE id = ?1').bind(id).first<{ post_id: string }>()
    if (c) await recount(db, c.post_id).run()
  }
}

const markActioned = (db: D1Database, type: TargetType, id: string, action: string, now: number) =>
  db
    .prepare("UPDATE reports SET status = 'actioned', action = ?3, handled_at = ?4 WHERE target_type = ?1 AND target_id = ?2 AND status = 'open'")
    .bind(type, id, action, now)
    .run()

// Rules (운영정책 초안 기준):
// - illegal filming: hide at once until the operator reviews (전기통신사업법 제22조의5①).
// - rights infringement claimed by the person concerned: temporary measure for 30 days (정보통신망법 제44조의2④).
//   Polls are text-only product comparisons, so a rights claim on a poll goes to review instead of hiding it at once.
// - anything else: hidden for review once three different members report the same target.
export async function fileReport(
  db: D1Database,
  r: { type: TargetType; id: string; reason: ReportReason; detail: string | null; memberId: string; now: number },
): Promise<ReportOutcome> {
  try {
    await db
      .prepare('INSERT INTO reports (id, target_type, target_id, reason, detail, reporter_member_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)')
      .bind(randomId(10), r.type, r.id, r.reason, r.detail, r.memberId, r.now)
      .run()
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return { result: 'duplicate' }
    throw e
  }
  if (r.reason === 'illegal_filming') {
    await hide(db, r.type, r.id, null)
    await markActioned(db, r.type, r.id, 'blocked', r.now)
    return { result: 'ok', action: 'blocked' }
  }
  if (r.reason === 'rights' && r.type !== 'poll') {
    await hide(db, r.type, r.id, r.now + TEMP_HIDE_DAYS * day)
    await markActioned(db, r.type, r.id, 'temp_measure', r.now)
    return { result: 'ok', action: 'temp_measure' }
  }
  const n = await db
    .prepare("SELECT COUNT(DISTINCT reporter_member_id) AS n FROM reports WHERE target_type = ?1 AND target_id = ?2 AND status = 'open'")
    .bind(r.type, r.id)
    .first<{ n: number }>()
  if ((n?.n ?? 0) < REPORT_HIDE_THRESHOLD) return { result: 'ok', action: 'received' }
  if (r.type === 'poll') {
    // Keep an anomaly banner that is already there (both mean; the README clear command checks both sources).
    await db.prepare("UPDATE polls SET review_note = 'reports' WHERE id = ?1 AND review_note IS NULL").bind(r.id).run()
    return { result: 'ok', action: 'review' }
  }
  await hide(db, r.type, r.id, r.now + TEMP_HIDE_DAYS * day)
  await markActioned(db, r.type, r.id, 'hidden_by_reports', r.now)
  return { result: 'ok', action: 'hidden_by_reports' }
}

export async function targetExists(db: D1Database, type: TargetType, id: string) {
  const table = type === 'poll' ? 'polls' : type === 'post' ? 'posts' : 'comments'
  const r = await db.prepare(`SELECT id FROM ${table} WHERE id = ?1`).bind(id).first<{ id: string }>()
  return !!r
}
