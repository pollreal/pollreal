// Launch seed polls (design v0.2 §9 step 12, follow-up): inserts the operator's 30 seed polls from
// scripts/seed-launch.json into D1 — polls (is_seed = 1, lang 'en', status open, closes in 24 h, member_id NULL like
// seed-dev.mjs), candidates with norm_key, and the shared AI card row per product ('pending' unless one already
// exists), exactly as src/lib/db.ts createPoll does, so the existing card pipeline (cron / page view) fills the cards.
// It NEVER inserts votes or members (real results come from real members only — house rule).
//
// Usage:  node scripts/seed-launch.mjs --batch 1|2|3|all [--local | --remote --yes] [--dry-run] [--file <json>] [--cards-only]
//   --local     (default) the local D1 under .wrangler/
//   --remote    production D1 — refused without --yes (dry runs are allowed, they only read)
//   --dry-run   validate, show what would be skipped, print the SQL; write nothing
//   --cards-only create only the shared AI card rows (pending, with the official page) — no polls. The cron writes the
//               cards ahead of launch; the polls inserted later reuse them (operator 2026-10-30)
// Idempotent: a poll whose question and candidate set (normalized keys) already exist in the target DB is skipped,
// so running the same batch twice inserts nothing. The operator-facing list is the design notes
import { execSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = resolve(HERE, '..')

// ---- arguments ----
const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const opt = (name) => {
  const i = argv.indexOf(name)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
}
const fail = (msg) => {
  console.error(`seed-launch: ${msg}`)
  process.exit(1)
}
const KNOWN = new Set(['--local', '--remote', '--yes', '--dry-run', '--batch', '--file', '--cards-only'])
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) {
    if (!KNOWN.has(a)) fail(`unknown option ${a}`)
    if (a === '--batch' || a === '--file') i++
  } else fail(`unexpected argument ${a}`)
}
const remote = flag('--remote')
if (remote && flag('--local')) fail('choose --local or --remote, not both')
const dryRun = flag('--dry-run')
if (remote && !dryRun && !flag('--yes')) fail('--remote writes to PRODUCTION: add --yes to confirm (or --dry-run to only print the SQL)')
const batchArg = opt('--batch')
if (!batchArg || !['1', '2', '3', 'all'].includes(batchArg)) fail('--batch 1|2|3|all is required')
const jsonPath = resolve(APP, opt('--file') ?? 'scripts/seed-launch.json')

// ---- product rules, read from src/config.ts so this script cannot drift from the app ----
const configSrc = readFileSync(join(APP, 'src/config.ts'), 'utf8')
const constant = (name) => {
  const m = configSrc.match(new RegExp(`export const ${name} = ([0-9][0-9 *+]*)`))
  if (!m) fail(`cannot read ${name} from src/config.ts`)
  return Function(`"use strict"; return (${m[1]})`)()
}
const MIN_CANDIDATES = constant('MIN_CANDIDATES')
const MAX_CANDIDATES = constant('MAX_CANDIDATES')
const MAX_MAKER = constant('MAX_MAKER')
const MAX_PRODUCT = constant('MAX_PRODUCT')
const MAX_QUESTION = constant('MAX_QUESTION')
const POLL_DURATION_MS = constant('POLL_DURATION_MS')
const CATEGORIES = [...configSrc.matchAll(/\{ slug: '([a-z0-9-]+)', group: '(ai|software|premium|product)'/g)].map((m) => ({ slug: m[1], group: m[2] }))
if (CATEGORIES.length < 10) fail('cannot read CATEGORIES from src/config.ts')
const isCategory = (s) => CATEGORIES.some((c) => c.slug === s)
const NON_OFFICIAL = [...(configSrc.match(/export const NON_OFFICIAL_DOMAINS = \[([\s\S]*?)\]/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1])
if (NON_OFFICIAL.length < 10) fail('cannot read NON_OFFICIAL_DOMAINS from src/config.ts')
// Optional official page per product: the card generator reads it instead of searching. Same rule as
// usableHint in src/lib/cardgen.ts — https only, not a store/review host.
const hintError = (url) => {
  let u
  try {
    u = new URL(url)
  } catch {
    return 'url is not a valid address'
  }
  if (u.protocol !== 'https:') return 'url must start with https://'
  if (url.length > 500) return 'url is longer than 500 characters'
  if (/[;'\s]/.test(url)) return 'url contains a semicolon, quote or space'
  const host = u.hostname.toLowerCase().replace(/^www\./, '')
  if (NON_OFFICIAL.some((d) => host === d || host.endsWith(`.${d}`)) || /(^|\.)(amazon|ebay)\.[a-z.]+$/.test(host)) return `url host ${host} is a store or review site`
  return null
}

// D1 binding from wrangler.toml
const toml = readFileSync(join(APP, 'wrangler.toml'), 'utf8')
const DB_NAME = toml.match(/database_name = "([^"]+)"/)?.[1] ?? fail('database_name missing in wrangler.toml')
const DB_ID = toml.match(/database_id = "([^"]+)"/)?.[1] ?? ''
if (remote && /^0+(-0+)+$/.test(DB_ID)) fail('wrangler.toml still has the placeholder database_id — replace it with the production D1 id first (step 10)')

// ---- same text helpers as src/lib/text.ts (keep in step) ----
const clean = (s) => (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const hasLink = (s) => /https?:\/\/|www\.|\.(com|net|kr|co|io)\b\//i.test(s)
const normKey = (maker, product) => {
  const f = (x) => x.normalize('NFKC').toLowerCase().replace(/[\s\-_.·,()/[\]]+/g, '')
  return `${f(maker)}|${f(product)}`
}
const slugOf = (products) => {
  const part = (p) =>
    p
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
  let s = products.map(part).filter(Boolean).join('-vs-')
  if (s.length > 80) s = Array.from(s).slice(0, 80).join('').replace(/-+$/, '')
  return s || 'poll'
}
// Short public ids, same alphabet as src/lib/crypto.ts randomId
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const randomId = (len) => Array.from(randomBytes(len), (b) => ALPHABET[b % ALPHABET.length]).join('')
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
// Signature used for the idempotency check: question + the candidate keys as a set
const signature = (question, keys) => `${(question ?? '').toLowerCase()}#${[...keys].sort().join(',')}`

// ---- load + validate every entry (fail fast, before touching any database) ----
let entries
try {
  entries = JSON.parse(readFileSync(jsonPath, 'utf8'))
} catch (e) {
  fail(`cannot read ${jsonPath}: ${e.message}`)
}
if (!Array.isArray(entries) || entries.length === 0) fail('seed file must be a non-empty array')
const errors = []
const seenInFile = new Map()
const polls = entries.map((e, idx) => {
  const where = `entry ${idx + 1}`
  const err = (m) => errors.push(`${where}: ${m}`)
  if (![1, 2, 3].includes(e.batch)) err(`batch must be 1, 2 or 3 (got ${JSON.stringify(e.batch)})`)
  const category = clean(typeof e.category === 'string' ? e.category : '')
  if (!isCategory(category)) err(`unknown category slug "${category}" (allowed: ${CATEGORIES.map((c) => c.slug).join(', ')})`)
  const question = clean(typeof e.question === 'string' ? e.question : '')
  if (!question) err('question is empty')
  if (question.length > MAX_QUESTION) err(`question is ${question.length} characters (max ${MAX_QUESTION})`)
  if (hasLink(question)) err('question contains a link')
  if (!Array.isArray(e.candidates)) err('candidates must be an array')
  const candidates = (Array.isArray(e.candidates) ? e.candidates : []).map((c, i) => {
    const n = i + 1
    const maker = clean(typeof c?.maker === 'string' ? c.maker : '')
    const product = clean(typeof c?.product === 'string' ? c.product : '')
    if (!maker || !product) err(`candidate ${n}: maker and product are both required`)
    if (maker.length > MAX_MAKER) err(`candidate ${n}: maker is ${maker.length} characters (max ${MAX_MAKER})`)
    if (product.length > MAX_PRODUCT) err(`candidate ${n}: product is ${product.length} characters (max ${MAX_PRODUCT})`)
    if (hasLink(maker) || hasLink(product)) err(`candidate ${n}: contains a link`)
    if (/;/.test(maker) || /;/.test(product) || /;/.test(question)) err(`candidate ${n}: semicolons are not allowed (SQL file splitting)`)
    const url = typeof c?.url === 'string' && c.url.trim() ? c.url.trim() : null
    if (c?.url !== undefined && typeof c.url !== 'string') err(`candidate ${n}: url must be a string`)
    const urlErr = url ? hintError(url) : null
    if (urlErr) err(`candidate ${n}: ${urlErr}`)
    return { maker, product, url, key: normKey(maker, product) }
  })
  if (candidates.length < MIN_CANDIDATES || candidates.length > MAX_CANDIDATES) err(`${candidates.length} candidates (allowed ${MIN_CANDIDATES}–${MAX_CANDIDATES})`)
  const keys = candidates.map((c) => c.key)
  if (new Set(keys).size !== keys.length) err('two candidates are the same product (normalized)')
  const sig = signature(question, keys)
  if (seenInFile.has(sig)) err(`duplicate of entry ${seenInFile.get(sig)} (same question and candidates)`)
  else seenInFile.set(sig, idx + 1)
  return { n: idx + 1, batch: e.batch, category, question, candidates, keys, sig }
})
if (errors.length) {
  console.error(`seed-launch: ${errors.length} problem(s) in ${jsonPath}:`)
  for (const e of errors) console.error(`  - ${e}`)
  process.exit(1)
}

// Coverage summary (selection rules in the operator document; informational, not blocking)
const aiSlugs = CATEGORIES.filter((c) => c.group === 'ai').map((c) => c.slug)
const perCat = new Map()
for (const p of polls) perCat.set(p.category, (perCat.get(p.category) ?? 0) + 1)
const aiCount = polls.filter((p) => aiSlugs.includes(p.category)).length
const thin = aiSlugs.filter((s) => (perCat.get(s) ?? 0) < 2)
console.log(`seed-launch: ${polls.length} polls in file — ${aiCount} AI, ${polls.length - aiCount} product; distinct products ${new Set(polls.flatMap((p) => p.keys)).size}`)
if (thin.length) console.log(`  note: AI categories with fewer than 2 polls: ${thin.join(', ')}`)

const selected = polls.filter((p) => batchArg === 'all' || p.batch === Number(batchArg))
if (!selected.length) fail(`no polls in batch ${batchArg}`)

// ---- what already exists in the target database (read-only) ----
const target = remote ? '--remote' : '--local'
const wrangler = (args) => execSync(`npx wrangler d1 execute ${DB_NAME} ${target} ${args}`, { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const existing = new Set()
try {
  const out = wrangler(`--json --command "SELECT p.question AS question, c.poll_id AS poll_id, c.norm_key AS norm_key FROM candidates c JOIN polls p ON p.id = c.poll_id"`)
  const parsed = JSON.parse(out.slice(out.indexOf('[')))
  const rows = parsed.flatMap((r) => r.results ?? [])
  const byPoll = new Map()
  for (const r of rows) {
    const e = byPoll.get(r.poll_id) ?? { question: clean(r.question ?? ''), keys: [] }
    e.keys.push(r.norm_key)
    byPoll.set(r.poll_id, e)
  }
  for (const e of byPoll.values()) existing.add(signature(e.question, e.keys))
  console.log(`  target ${remote ? 'REMOTE (production)' : 'local'}: ${byPoll.size} poll(s) present`)
} catch (e) {
  fail(`cannot read the ${remote ? 'remote' : 'local'} database (is wrangler logged in / migrated?): ${String(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' | ')}`)
}

// ---- cards only: shared card rows for every product in the selected batches, no polls ----
if (flag('--cards-only')) {
  const t = Date.now()
  const cardSql = []
  const keys = new Set()
  for (const p of selected)
    for (const c of p.candidates) {
      if (keys.has(c.key)) continue
      keys.add(c.key)
      cardSql.push(`INSERT OR IGNORE INTO cards (id, norm_key, maker, product, status, created_at) VALUES (${q(randomId(10))}, ${q(c.key)}, ${q(c.maker)}, ${q(c.product)}, 'pending', ${t})`)
      if (c.url) cardSql.push(`UPDATE cards SET hint_url = ${q(c.url)} WHERE norm_key = ${q(c.key)} AND hint_url IS NULL`)
    }
  console.log(`  cards only: ${keys.size} product(s) in batch ${batchArg} (existing card rows are left as they are)`)
  if (dryRun) {
    console.log(`\n-- dry run: ${cardSql.length} statement(s), nothing written`)
    console.log(`${cardSql.join(';\n')};`)
    process.exit(0)
  }
  const d = mkdtempSync(join(tmpdir(), 'pollreal-cards-'))
  const f = join(d, 'seed-cards.sql')
  writeFileSync(f, `${cardSql.join(';\n')};\n`, 'utf8')
  try {
    wrangler(`--file "${f}"`)
  } catch (e) {
    fail(`card insert failed: ${String(e.stderr ?? e.message).trim().split('\n').slice(-5).join(' | ')}`)
  }
  console.log(`card rows ready in ${remote ? 'REMOTE (production)' : 'local'} ${DB_NAME} — the cron (every 5 min) writes them`)
  process.exit(0)
}

// ---- build SQL ----
const now = Date.now()
const sql = []
const inserted = []
const skipped = []
for (const p of selected) {
  if (existing.has(p.sig)) {
    skipped.push(p)
    continue
  }
  const id = randomId(8)
  const slug = slugOf(p.candidates.map((c) => c.product))
  sql.push(
    `INSERT INTO polls (id, member_id, category, question, slug, is_seed, status, created_at, closes_at, lang) VALUES (${q(id)}, NULL, ${q(p.category)}, ${q(p.question)}, ${q(slug)}, 1, 'open', ${now}, ${now + POLL_DURATION_MS}, 'en')`,
  )
  p.candidates.forEach((c, i) => {
    // shared card per product: created as 'pending' only when no row has this norm_key (same as createPoll)
    sql.push(`INSERT OR IGNORE INTO cards (id, norm_key, maker, product, status, created_at) VALUES (${q(randomId(10))}, ${q(c.key)}, ${q(c.maker)}, ${q(c.product)}, 'pending', ${now})`)
    // official page for search-free generation — fills an empty hint only, never overwrites one
    if (c.url) sql.push(`UPDATE cards SET hint_url = ${q(c.url)} WHERE norm_key = ${q(c.key)} AND hint_url IS NULL`)
    sql.push(
      `INSERT INTO candidates (id, poll_id, position, maker, product, norm_key, card_id) VALUES (${q(randomId(10))}, ${q(id)}, ${i + 1}, ${q(c.maker)}, ${q(c.product)}, ${q(c.key)}, (SELECT id FROM cards WHERE norm_key = ${q(c.key)}))`,
    )
  })
  inserted.push({ ...p, id, slug })
  existing.add(p.sig) // the same batch run twice in one file would otherwise insert twice
}

console.log(`  batch ${batchArg}: ${selected.length} selected → ${inserted.length} to insert, ${skipped.length} already present`)
for (const p of skipped) console.log(`    skip #${p.n} [${p.category}] ${p.question}`)

if (dryRun) {
  console.log(`\n-- dry run: ${sql.length} statement(s), nothing written (${remote ? 'remote' : 'local'})`)
  if (sql.length) console.log(`${sql.join(';\n')};`)
  process.exit(0)
}
if (!sql.length) {
  console.log('nothing to insert')
  process.exit(0)
}

const dir = mkdtempSync(join(tmpdir(), 'pollreal-launch-'))
const file = join(dir, 'seed-launch.sql')
writeFileSync(file, `${sql.join(';\n')};\n`, 'utf8')
try {
  wrangler(`--file "${file}"`)
} catch (e) {
  fail(`insert failed, nothing partial should remain (D1 runs the file as one batch): ${String(e.stderr ?? e.message).trim().split('\n').slice(-5).join(' | ')}`)
}
console.log(`inserted ${inserted.length} seed poll(s) into ${remote ? 'REMOTE (production)' : 'local'} ${DB_NAME}; they close at ${new Date(now + POLL_DURATION_MS).toISOString()}`)
for (const p of inserted) console.log(`  #${p.n} [${p.category}] /v/${p.id}/${p.slug}`)
