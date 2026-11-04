// Card pipeline orchestration: who generates which card, when, and how much may be spent.
// Triggers: a new poll (waitUntil right after it is created), anyone opening a poll whose cards are still pending,
// and the cron (fallback). A short claim lock keeps the three from generating the same product twice.
import {
  CARD_ATTEMPT_RESERVE_USD,
  CARD_CONCURRENCY,
  CARD_DAILY_BUDGET_USD,
  CARD_DAILY_LIMIT,
  CARD_DEEP_LOCK_MS,
  CARD_DEEP_MAX_ATTEMPTS,
  CARD_DEEP_PER_RUN,
  CARD_LOCK_MS,
  CARD_MAX_ATTEMPTS,
  CARD_RENDER_MAX_PAGES,
  CARD_RETRY_DELAY_MS,
  categoryOf,
} from '../config'
import type { Bindings } from '../env'
import { type CardDraft, type CardSource, type CardSpec, type GenOutcome, generateCard, generateCardDeep, needsDeep, pickBetter, usableHint } from './cardgen'
import type { CardRow } from './db'
import { renderPages } from './render'

const DAY = 24 * 60 * 60 * 1000

export const cardsEnabled = (env: Bindings) => !!env.ANTHROPIC_API_KEY

// A pending card that will still be tried — by the first pass, or by the deep pass queued after it.
// The poll page refreshes itself while any of these are on it.
export const isGenerating = (card: CardRow | undefined) =>
  !!card && card.status === 'pending' && (card.attempts < CARD_MAX_ATTEMPTS || (card.deep_state === 1 && card.deep_attempts < CARD_DEEP_MAX_ATTEMPTS))

export async function pendingIds(db: D1Database, limit: number, now: number) {
  const r = await db
    .prepare(
      `SELECT id FROM cards WHERE status = 'pending' AND attempts < ?1 AND (locked_until IS NULL OR locked_until < ?2)
       ORDER BY created_at LIMIT ?3`,
    )
    .bind(CARD_MAX_ATTEMPTS, now, limit)
    .all<{ id: string }>()
  return (r.results ?? []).map((x) => x.id)
}

export async function pendingIdsForPoll(db: D1Database, pollId: string, now: number) {
  const r = await db
    .prepare(
      `SELECT DISTINCT c.id FROM candidates k JOIN cards c ON c.id = k.card_id
       WHERE k.poll_id = ?1 AND c.status = 'pending' AND c.attempts < ?2 AND (c.locked_until IS NULL OR c.locked_until < ?3)`,
    )
    .bind(pollId, CARD_MAX_ATTEMPTS, now)
    .all<{ id: string }>()
  return (r.results ?? []).map((x) => x.id)
}

async function claim(db: D1Database, id: string, now: number) {
  const r = await db
    .prepare(
      `UPDATE cards SET locked_until = ?2, attempts = attempts + 1
       WHERE id = ?1 AND status = 'pending' AND attempts < ?3 AND (locked_until IS NULL OR locked_until < ?4)`,
    )
    .bind(id, now + CARD_LOCK_MS, CARD_MAX_ATTEMPTS, now)
    .run()
  return (r.meta.changes ?? 0) === 1
}

// Attempts and spend in the last 24 hours, from the per-attempt log (failed and key/balance attempts included).
export async function spentLast24h(db: D1Database, now: number) {
  const r = await db
    .prepare('SELECT COUNT(*) AS n, COALESCE(SUM(cost_usd), 0) AS usd FROM ai_spend WHERE created_at >= ?1')
    .bind(now - DAY)
    .first<{ n: number; usd: number }>()
  return { n: r?.n ?? 0, usd: r?.usd ?? 0 }
}

// Spend log: a reserve is booked before the paid call and replaced by the real cost after it.
async function reserveSpend(db: D1Database, cardId: string, now: number, stage = 1) {
  const r = await db
    .prepare('INSERT INTO ai_spend (card_id, ok, cost_usd, created_at, stage) VALUES (?1, 0, ?2, ?3, ?4) RETURNING id')
    .bind(cardId, CARD_ATTEMPT_RESERVE_USD, now, stage)
    .first<{ id: number }>()
  return r?.id ?? null
}

async function save(db: D1Database, id: string, out: GenOutcome, now: number, spendId: number | null) {
  if (spendId !== null) await db.prepare('UPDATE ai_spend SET ok = ?2, cost_usd = ?3 WHERE id = ?1').bind(spendId, out.ok ? 1 : 0, out.costUsd).run()
  else await db.prepare('INSERT INTO ai_spend (card_id, ok, cost_usd, created_at) VALUES (?1, ?2, ?3, ?4)').bind(id, out.ok ? 1 : 0, out.costUsd, now).run()
  if (out.ok) {
    const d = out.draft
    await db
      .prepare(
        `UPDATE cards SET status = 'ready', summary_json = ?2, sources_json = ?3, official_source = ?4, official_url = ?5,
           product_title = ?6, model = ?7, cost_usd = COALESCE(cost_usd, 0) + ?8, checked_at = ?9, locked_until = NULL, last_error = NULL,
           missing_json = ?10, deep_state = CASE WHEN ?11 = 1 AND deep_state = 0 THEN 1 ELSE deep_state END
         WHERE id = ?1`,
      )
      .bind(...readyBinds(id, out.draft, out.model, out.costUsd, now), needsDeep(out.draft) ? 1 : 0)
      .run()
    return
  }
  if (out.retry === 'config') {
    // Key or balance problem: hand the attempt back and leave the card waiting.
    await db
      .prepare('UPDATE cards SET attempts = MAX(attempts - 1, 0), locked_until = NULL, last_error = ?2, cost_usd = COALESCE(cost_usd, 0) + ?3 WHERE id = ?1')
      .bind(id, out.error.slice(0, 200), out.costUsd)
      .run()
    return
  }
  // First pass gave up (product not found, too few facts, attempts used up): the card stays pending and goes to the deep
  // pass instead of failing — except a refusal, which is final.
  const final = out.error === 'refusal'
  await db
    .prepare(
      `UPDATE cards SET
         status = CASE WHEN ?9 = 1 THEN 'failed' ELSE 'pending' END,
         deep_state = CASE WHEN ?9 = 0 AND (?2 = 1 OR attempts >= ?3) AND deep_state = 0 THEN 1 ELSE deep_state END,
         attempts = CASE WHEN ?2 = 1 THEN MAX(attempts, ?3) ELSE attempts END,
         locked_until = ?4, last_error = ?5, cost_usd = COALESCE(cost_usd, 0) + ?6, checked_at = ?7, model = ?8
       WHERE id = ?1`,
    )
    .bind(id, out.retry === 'never' ? 1 : 0, CARD_MAX_ATTEMPTS, now + CARD_RETRY_DELAY_MS, out.error.slice(0, 200), out.costUsd, now, out.model, final ? 1 : 0)
    .run()
}

// Column values for a ready card (summary, sources, official flag, url, title, model, cost, time, missing facts).
function readyBinds(id: string, d: CardDraft, model: string, costUsd: number, now: number) {
  return [
    id,
    JSON.stringify({ specs: d.specs, notes: d.notes, ko: d.ko }),
    JSON.stringify(d.sources),
    d.officialUrl || d.sources.some((s) => s.official) ? 1 : 0,
    d.officialUrl,
    d.productTitle || null,
    model,
    costUsd,
    now,
    JSON.stringify(d.missing),
  ] as const
}

export type RunReport = { tried: number; ready: number; failed: number; costUsd: number; stopped?: string }

export async function generateCards(env: Bindings, ids: string[], now = Date.now()): Promise<RunReport> {
  const report: RunReport = { tried: 0, ready: 0, failed: 0, costUsd: 0 }
  const key = env.ANTHROPIC_API_KEY
  if (!key) return { ...report, stopped: 'no_key' }
  if (!ids.length) return report
  const spent = await spentLast24h(env.DB, now)
  if (spent.n >= CARD_DAILY_LIMIT || spent.usd >= CARD_DAILY_BUDGET_USD) {
    console.warn(`cards: 24h guard reached (${spent.n} cards, $${spent.usd.toFixed(2)})`)
    return { ...report, stopped: 'daily_guard' }
  }
  const queue = ids.slice(0, CARD_DAILY_LIMIT - spent.n)
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      if (report.stopped || spent.usd + report.costUsd >= CARD_DAILY_BUDGET_USD) return
      if (!(await claim(env.DB, id, Date.now()))) continue
      const card = await env.DB.prepare(
        `SELECT c.maker, c.product, c.hint_url,
           (SELECT p.category FROM candidates k JOIN polls p ON p.id = k.poll_id WHERE k.card_id = c.id ORDER BY p.created_at LIMIT 1) AS category
         FROM cards c WHERE c.id = ?1`,
      )
        .bind(id)
        .first<{ maker: string; product: string; hint_url: string | null; category: string | null }>()
      if (!card) continue
      report.tried++
      const spendId = await reserveSpend(env.DB, id, Date.now())
      const out = await generateCard(key, {
        maker: card.maker,
        product: card.product,
        category: card.category ? categoryOf(card.category)?.en : undefined,
        hintUrl: card.hint_url,
      })
      report.costUsd += out.costUsd
      await save(env.DB, id, out, Date.now(), spendId)
      if (out.ok) report.ready++
      else {
        report.failed++
        console.warn(`cards: ${card.maker} ${card.product} -> ${out.error}`)
        if (out.retry === 'config') report.stopped = out.error
      }
    }
  }
  await Promise.all(Array.from({ length: CARD_CONCURRENCY }, worker))
  return report
}

// ---- Deep pass — cron only: it can take minutes (browser + several model turns) ----

export async function deepIds(db: D1Database, limit: number, now: number) {
  const r = await db
    .prepare(
      `SELECT id FROM cards WHERE deep_state = 1 AND deep_attempts < ?1 AND (locked_until IS NULL OR locked_until < ?2)
       ORDER BY created_at LIMIT ?3`,
    )
    .bind(CARD_DEEP_MAX_ATTEMPTS, now, limit)
    .all<{ id: string }>()
  return (r.results ?? []).map((x) => x.id)
}

async function claimDeep(db: D1Database, id: string, now: number) {
  const r = await db
    .prepare(
      `UPDATE cards SET locked_until = ?2, deep_attempts = deep_attempts + 1
       WHERE id = ?1 AND deep_state = 1 AND deep_attempts < ?3 AND (locked_until IS NULL OR locked_until < ?4)`,
    )
    .bind(id, now + CARD_DEEP_LOCK_MS, CARD_DEEP_MAX_ATTEMPTS, now)
    .run()
  return (r.meta.changes ?? 0) === 1
}

type DeepRow = {
  maker: string
  product: string
  hint_url: string | null
  status: string
  official_url: string | null
  product_title: string | null
  summary_json: string | null
  sources_json: string | null
  missing_json: string | null
  last_error: string | null
  deep_attempts: number
  category: string | null
}

const parse = <T>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

// The stored first-pass card as a draft (only when it is ready).
export function storedDraft(row: Pick<DeepRow, 'status' | 'official_url' | 'product_title' | 'summary_json' | 'sources_json' | 'missing_json'>): CardDraft | null {
  if (row.status !== 'ready' || !row.summary_json) return null
  const s = parse<{ specs?: CardSpec[]; notes?: string[]; ko?: { specs: CardSpec[]; notes: string[] } }>(row.summary_json, {})
  return {
    productTitle: row.product_title ?? '',
    officialUrl: row.official_url,
    specs: s.specs ?? [],
    notes: s.notes ?? [],
    ko: s.ko ?? { specs: [], notes: [] },
    sources: parse<CardSource[]>(row.sources_json, []),
    missing: parse<string[]>(row.missing_json, []),
  }
}

// Official pages worth opening in the browser: the operator hint, the official url found, other official sources.
export function pagesToRender(row: Pick<DeepRow, 'hint_url' | 'official_url' | 'sources_json'>) {
  const urls = [row.hint_url, row.official_url, ...parse<CardSource[]>(row.sources_json, []).filter((s) => s.official).map((s) => s.url)]
  const out: string[] = []
  for (const u of urls) {
    const ok = usableHint(u)
    if (ok && !out.includes(ok)) out.push(ok)
  }
  return out.slice(0, CARD_RENDER_MAX_PAGES)
}

export async function generateDeepCards(env: Bindings, now = Date.now(), limit = CARD_DEEP_PER_RUN): Promise<RunReport> {
  const report: RunReport = { tried: 0, ready: 0, failed: 0, costUsd: 0 }
  const key = env.ANTHROPIC_API_KEY
  if (!key) return { ...report, stopped: 'no_key' }
  const ids = await deepIds(env.DB, limit, now)
  if (!ids.length) return report
  const spent = await spentLast24h(env.DB, now)
  if (spent.n >= CARD_DAILY_LIMIT || spent.usd >= CARD_DAILY_BUDGET_USD) return { ...report, stopped: 'daily_guard' }
  for (const id of ids) {
    if (spent.usd + report.costUsd >= CARD_DAILY_BUDGET_USD) break
    if (!(await claimDeep(env.DB, id, Date.now()))) continue
    const row = await env.DB.prepare(
      `SELECT c.maker, c.product, c.hint_url, c.status, c.official_url, c.product_title, c.summary_json, c.sources_json,
         c.missing_json, c.last_error, c.deep_attempts,
         (SELECT p.category FROM candidates k JOIN polls p ON p.id = k.poll_id WHERE k.card_id = c.id ORDER BY p.created_at LIMIT 1) AS category
       FROM cards c WHERE c.id = ?1`,
    )
      .bind(id)
      .first<DeepRow>()
    if (!row) continue
    report.tried++
    const prior = storedDraft(row)
    const urls = pagesToRender(row)
    const rendered = env.BROWSER && urls.length ? await renderPages(env.BROWSER, urls) : { pages: [], ms: 0, error: undefined }
    const spendId = await reserveSpend(env.DB, id, Date.now(), 2)
    const input = { maker: row.maker, product: row.product, category: row.category ? categoryOf(row.category)?.en : undefined, hintUrl: row.hint_url }
    const out = await generateCardDeep(key, input, { pages: rendered.pages, prior, priorError: prior ? null : row.last_error })
    report.costUsd += out.costUsd
    if (spendId !== null)
      await env.DB.prepare('UPDATE ai_spend SET ok = ?2, cost_usd = ?3, browser_ms = ?4 WHERE id = ?1').bind(spendId, out.ok ? 1 : 0, out.costUsd, rendered.ms).run()
    const t = Date.now()
    console.log(
      `cards deep: ${row.maker} ${row.product} -> ${out.ok ? `ok (${out.draft.specs.length} specs, missing ${out.draft.missing.length})` : out.error} (pages ${rendered.pages.length}/${urls.length}${rendered.error ? `, browser: ${rendered.error}` : ''})`,
    )
    if (out.ok) {
      const d = pickBetter(prior, out.draft)
      await env.DB.prepare(
        `UPDATE cards SET status = 'ready', summary_json = ?2, sources_json = ?3, official_source = ?4, official_url = ?5,
           product_title = ?6, model = ?7, cost_usd = COALESCE(cost_usd, 0) + ?8, checked_at = ?9, missing_json = ?10,
           deep_state = 2, locked_until = NULL, last_error = NULL
         WHERE id = ?1`,
      )
        .bind(...readyBinds(id, d, out.model, out.costUsd, t))
        .run()
      report.ready++
      continue
    }
    if (out.retry === 'config') {
      await env.DB.prepare('UPDATE cards SET deep_attempts = MAX(deep_attempts - 1, 0), locked_until = NULL, last_error = ?2 WHERE id = ?1')
        .bind(id, out.error.slice(0, 200))
        .run()
      report.stopped = out.error
      break
    }
    report.failed++
    // Out of deep attempts (or a final error): a ready first-pass card stays as it is; a card with nothing fails.
    const last = out.retry === 'never' || row.deep_attempts + 1 >= CARD_DEEP_MAX_ATTEMPTS
    await env.DB.prepare(
      `UPDATE cards SET locked_until = ?2, last_error = ?3, cost_usd = COALESCE(cost_usd, 0) + ?4,
         deep_state = CASE WHEN ?5 = 0 THEN 1 WHEN status = 'ready' THEN 2 ELSE 3 END,
         status = CASE WHEN ?5 = 1 AND status <> 'ready' THEN 'failed' ELSE status END
       WHERE id = ?1`,
    )
      .bind(id, last ? null : t + CARD_RETRY_DELAY_MS, out.error.slice(0, 200), out.costUsd, last ? 1 : 0)
      .run()
  }
  return report
}
