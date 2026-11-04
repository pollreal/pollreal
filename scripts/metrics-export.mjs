// Metrics ledger export (step 8, business plan §6.2): metrics_daily snapshots (written by the cron) + manual inputs
// -> ops/metrics_daily.csv. The header is the one in scripts/p1_digest.py (METRICS_HEADER) and never changes.
//
//   node scripts/metrics-export.mjs --ignite-start 2026-11-16 --remote            (production, after `wrangler login`)
//   node scripts/metrics-export.mjs --ignite-start 2026-10-29 --local --out <file> (local test — never the real ledger)
//
// Options: --manual <csv>  (default ../ops/metrics_manual.csv with --remote; none with --local) — receipts and consoles, one row per date:
//            date,search_clicks_google,search_clicks_naver,promo_spend_krw,llm_cost_usd,idv_cost_krw,notes
//          A filled manual value wins; an empty LLM / identity cost falls back to the database estimate (marked in notes).
//          --dry-run  print what would change, write nothing.
// Rows already in the ledger are kept; a row is only rewritten when a source value changed, and every change is printed.
// Stage: ignite = days 1-30 from --ignite-start, selfrun = days 31-90, judge after that (business plan §6.1).
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(APP, '..')
const DAY = 24 * 60 * 60 * 1000

function args(argv) {
  const o = { local: false, remote: false, dryRun: false, out: join(ROOT, 'ops', 'metrics_daily.csv'), manual: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--local') o.local = true
    else if (a === '--remote') o.remote = true
    else if (a === '--dry-run') o.dryRun = true
    else if (a === '--ignite-start') o.ignite = argv[++i]
    else if (a === '--out') o.out = resolve(argv[++i])
    else if (a === '--manual') o.manual = resolve(argv[++i])
    else throw new Error(`unknown option ${a}`)
  }
  if (o.local === o.remote) throw new Error('choose exactly one of --local / --remote')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.ignite ?? '')) throw new Error('--ignite-start YYYY-MM-DD is required (launch day = first ignition day)')
  // Local (test) runs never touch ops/ — neither the ledger nor the operator's manual file (compared case-insensitively:
  // Windows paths, g:\ = G:\). A local run reads manual rows only from an explicit --manual test file.
  const inOps = (p) => {
    const rel = relative(join(ROOT, 'ops').toLowerCase(), resolve(p).toLowerCase())
    return !rel.startsWith('..') && !/^[a-z]:/i.test(rel)
  }
  if (o.local && inOps(o.out)) throw new Error('--local data must not go into ops/ (the real ledger); pass --out <test file elsewhere>')
  if (o.local && o.manual && inOps(o.manual)) throw new Error('--local runs must not read the real manual file in ops/')
  if (!o.local && o.manual === undefined) o.manual = join(ROOT, 'ops', 'metrics_manual.csv')
  return o
}

// The single source of the header: METRICS_HEADER in scripts/p1_digest.py (Python implicit string concatenation).
export function ledgerHeader(pySource) {
  const m = pySource.match(/METRICS_HEADER\s*=\s*\(([\s\S]*?)\)/)
  if (!m) throw new Error('METRICS_HEADER not found in scripts/p1_digest.py')
  const parts = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1])
  if (!parts.length) throw new Error('METRICS_HEADER is empty')
  return parts.join('')
}

// Minimal RFC 4180 CSV (quotes, commas and line breaks inside quoted fields).
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some((x) => x !== '')) rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  if (row.some((x) => x !== '')) rows.push(row)
  return rows
}

const cell = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const dayNo = (day) => Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse('1970-01-01T00:00:00Z')) / DAY)

export function stageOf(day, ignite) {
  const d = dayNo(day) - dayNo(ignite)
  if (d < 0) return null
  if (d < 30) return 'ignite'
  if (d < 90) return 'selfrun'
  return 'judge'
}

// Manual cells: blank = not entered; "150,000" is read as 150000; anything else that is not a number stops the export
// (a NaN in the ledger would silently switch off the promotion-cap and kill checks in p1_digest.py).
export function num(s, where = '') {
  if (s === undefined || s === null || String(s).trim() === '') return null
  const v = Number(String(s).replace(/[,\s]/g, ''))
  if (!Number.isFinite(v)) throw new Error(`not a number ${JSON.stringify(s)}${where ? ` in ${where}` : ''}`)
  return v
}

const MANUAL_HEADER = 'date,search_clicks_google,search_clicks_naver,promo_spend_krw,llm_cost_usd,idv_cost_krw,notes'
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
// The latest KST day that has finished (+10 minutes for the cron snapshot), as of `now`.
export const lastDoneDay = (now) => new Date(now + 9 * 60 * 60 * 1000 - 10 * 60 * 1000 - DAY).toISOString().slice(0, 10)

// Every manual row must reach the ledger (promotion spend feeds the 1,000,000 KRW cap). Returns the dates still waiting
// for their snapshot (today or later); throws on anything that would otherwise be dropped or misread.
export function checkManual(table, ignite, snapDays, lastDone) {
  if (table.header !== null && table.header !== MANUAL_HEADER) throw new Error(`metrics_manual.csv header must be exactly: ${MANUAL_HEADER}`)
  const seen = new Set()
  const waiting = []
  for (const r of table.rows) {
    if (!isDay(r.date)) throw new Error(`metrics_manual.csv: date must be a real YYYY-MM-DD, got ${JSON.stringify(r.date)}`)
    if (seen.has(r.date)) throw new Error(`metrics_manual.csv ${r.date} appears twice — put the day's total on one line (receipts in notes)`)
    seen.add(r.date)
    if (r.date < ignite) throw new Error(`metrics_manual.csv ${r.date} is before --ignite-start ${ignite}: put pre-launch spend on ${ignite} with a note`)
    if (r.date > lastDone) waiting.push(r.date)
    else if (!snapDays.has(r.date)) throw new Error(`metrics_manual.csv ${r.date} has no database snapshot (cron missed it) — back-fill first (README)`)
  }
  return waiting
}

// One ledger row from a snapshot + its manual row.
export function buildRow(snap, manual, ignite) {
  const notes = []
  const at = (col) => `metrics_manual.csv ${snap.day} ${col}`
  const llmManual = num(manual?.llm_cost_usd, at('llm_cost_usd'))
  const idvManual = num(manual?.idv_cost_krw, at('idv_cost_krw'))
  if (llmManual === null && snap.llm_cost_usd > 0) notes.push('LLM=DB추정')
  if (idvManual === null && snap.idv_checks > 0) notes.push(`인증문자=${snap.idv_checks}건×단가 추정`)
  notes.push(
    `씨앗 ${snap.seed_polls_new} · 글 ${snap.posts_new} · 댓글 ${snap.comments_new} · 신고 ${snap.reports_new} · 이상탐지 ${snap.anomalies_new} · 탈퇴 ${snap.withdrawals_new} · 재방문 ${snap.weekly_returned}/${snap.weekly_prev}`,
  )
  if (manual?.notes) notes.push(manual.notes)
  return {
    date: snap.day,
    stage: stageOf(snap.day, ignite),
    signups_total: snap.signups_total,
    signups_new: snap.signups_new,
    votes_new: snap.votes_new,
    polls_new: snap.polls_new,
    weekly_return_rate: snap.weekly_prev ? (snap.weekly_returned / snap.weekly_prev).toFixed(4) : '',
    search_clicks_google: num(manual?.search_clicks_google, at('search_clicks_google')) ?? '',
    search_clicks_naver: num(manual?.search_clicks_naver, at('search_clicks_naver')) ?? '',
    promo_spend_krw: num(manual?.promo_spend_krw, at('promo_spend_krw')) ?? 0,
    llm_cost_usd: llmManual ?? snap.llm_cost_usd,
    idv_cost_krw: idvManual ?? snap.idv_cost_krw,
    shares_new: snap.shares_new ?? 0,
    embed_loads_new: snap.embed_loads_new ?? 0,
    invited_signups_new: snap.invited_signups_new ?? 0,
    maker_votes_new: snap.maker_votes_new ?? 0,
    refusals_new: snap.refusals_new ?? 0,
    notes: notes.join(' / '),
  }
}

// Read-only queries (SELECT) with single-quoted literals only, so the command line needs no escaping on any shell.
function d1(o, sql) {
  if (sql.includes('"') || !/^\s*SELECT\b/i.test(sql)) throw new Error('metrics-export only runs SELECTs without double quotes')
  const out = execSync(`npx wrangler d1 execute versus-db ${o.remote ? '--remote' : '--local'} --json --command "${sql}"`, { cwd: APP, stdio: 'pipe' }).toString()
  return JSON.parse(out.slice(out.indexOf('['))).at(-1)?.results ?? []
}

function readTable(path, header) {
  if (!existsSync(path)) return { header: null, rows: [] }
  const raw = readFileSync(path, 'utf8')
  const [head, ...body] = parseCsv(raw.replace(/^﻿/, ''))
  const cols = head ?? []
  const rows = body.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? ''])))
  if (header && cols.join(',') !== header) return { header: cols.join(','), rows, mismatch: true }
  return { header: cols.join(','), rows }
}

function main() {
  const o = args(process.argv.slice(2))
  const header = ledgerHeader(readFileSync(join(ROOT, 'scripts', 'p1_digest.py'), 'utf8'))
  const cols = header.split(',')

  const ledger = readTable(o.out, header)
  if (ledger.mismatch) throw new Error(`ledger header differs from METRICS_HEADER — refusing to write (${o.out})`)
  const manualTable = o.manual ? readTable(o.manual) : { header: null, rows: [] }
  const manual = new Map(manualTable.rows.map((r) => [r.date, r]))
  const snaps = d1(o, `SELECT * FROM metrics_daily WHERE day >= '${o.ignite}' ORDER BY day`)
  const snapDays = new Set(snaps.map((s) => s.day))
  const lastDone = lastDoneDay(Date.now())
  const waiting = checkManual(manualTable, o.ignite, snapDays, lastDone)

  const byDate = new Map(ledger.rows.map((r) => [r.date, r]))
  const changes = []
  for (const s of snaps) {
    const next = Object.fromEntries(cols.map((c) => [c, String(buildRow(s, manual.get(s.day), o.ignite)[c] ?? '')]))
    const prev = byDate.get(s.day)
    if (!prev) changes.push(`+ ${s.day}`)
    else {
      const diff = cols.filter((c) => (prev[c] ?? '') !== next[c]).map((c) => `${c}: ${prev[c] ?? ''} -> ${next[c]}`)
      if (!diff.length) continue
      changes.push(`~ ${s.day} ${diff.join('; ')}`)
    }
    byDate.set(s.day, next)
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
  const text = `${[header, ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n')}\n`

  console.log(`metrics ledger: ${snaps.length} snapshot day(s) from ${o.ignite}, ${changes.length} change(s) -> ${o.out}`)
  for (const c of changes) console.log(`  ${c}`)
  // Every finished KST day since launch should have a snapshot (the cron writes it 10 minutes after midnight).
  const missing = []
  for (let d = dayNo(o.ignite); d <= dayNo(lastDone); d++) {
    const day = new Date(d * DAY).toISOString().slice(0, 10)
    if (!snapDays.has(day)) missing.push(day)
  }
  if (missing.length) console.log(`  WARNING no snapshot for ${missing.join(', ')} — the cron back-fills 35 days; check the Worker's cron (README)`)
  if (waiting.length) console.log(`  waiting for tonight's snapshot: manual row(s) ${waiting.join(', ')}`)

  const open = d1(o, "SELECT a.poll_id, a.kind, a.detail, a.created_at, p.slug FROM anomalies a JOIN polls p ON p.id = a.poll_id WHERE a.status = 'open' ORDER BY a.created_at")
  if (open.length) {
    console.log(`  REVIEW ${open.length} open anomaly flag(s) — the operator decides (README "운영 명령"):`)
    for (const a of open) console.log(`    ${new Date(a.created_at).toISOString()} ${a.kind} /v/${a.poll_id}/${a.slug} ${a.detail}`)
  }
  if (!o.dryRun && changes.length) {
    mkdirSync(dirname(o.out), { recursive: true })
    writeFileSync(o.out, text, 'utf8')
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (e) {
    console.error(`metrics-export: ${e.message}`)
    process.exit(1)
  }
}
