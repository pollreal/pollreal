// Development-only sample data for the local prototype: mock members, operator seed polls (AI services first),
// votes with channels, board posts. LOCAL D1 ONLY (hard-coded --local). Never run against production — real results
// must come from real members only. Run: npm run db:migrate:local && npm run seed
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const NOW = Date.now()
const H = 60 * 60 * 1000
const D = 24 * H
const KST_YEAR = new Date(NOW + 9 * H).getUTCFullYear()

// deterministic PRNG so the sample looks the same every run
let seed = 20261029
const rand = () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const pick = (weights) => {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rand() * total
  for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) < 0) return i
  return weights.length - 1
}
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)
const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789'
const rid = (n) => Array.from({ length: n }, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join('')
const normKey = (maker, product) => {
  const f = (x) => x.normalize('NFKC').toLowerCase().replace(/[\s\-_.·,()/[\]]+/g, '')
  return `${f(maker)}|${f(product)}`
}
const slugOf = (products) =>
  products
    .map((p) => p.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('-vs-')
    .slice(0, 80)
    .replace(/-+$/, '')
const band = (birthYear) => {
  const a = KST_YEAR - birthYear
  return a < 20 ? '10' : a >= 60 ? '60' : String(Math.floor(a / 10) * 10)
}

const sql = [
  'DELETE FROM vote_refusals',
  'DELETE FROM share_counts',
  'DELETE FROM maker_claims',
  'DELETE FROM passkeys',
  'DELETE FROM challenges',
  'DELETE FROM phone_flows',
  'DELETE FROM otp_log',
  'DELETE FROM anomalies',
  'DELETE FROM idv_checks',
  'DELETE FROM ai_spend',
  'DELETE FROM metrics_daily',
  'DELETE FROM reports',
  'DELETE FROM comments',
  'DELETE FROM posts',
  'DELETE FROM votes',
  'DELETE FROM candidates',
  'DELETE FROM cards',
  'DELETE FROM polls',
  'DELETE FROM sessions',
  'UPDATE members SET invited_by = NULL',
  'DELETE FROM members',
]

// ---- 120 mock members: global spread, age and gender like a general web audience ----
const AGE_MIX = [
  [0.1, 2007, 2011],
  [0.32, 1997, 2006],
  [0.28, 1987, 1996],
  [0.16, 1977, 1986],
  [0.09, 1967, 1976],
  [0.05, 1950, 1966],
]
const COUNTRIES = [
  ['US', 0.32],
  ['KR', 0.22],
  ['GB', 0.08],
  ['IN', 0.1],
  ['DE', 0.06],
  ['JP', 0.05],
  ['CA', 0.05],
  ['BR', 0.05],
  ['FR', 0.04],
  ['AU', 0.03],
]
const members = []
for (let i = 1; i <= 120; i++) {
  const [, from, to] = AGE_MIX[pick(AGE_MIX.map((a) => a[0]))]
  const country = COUNTRIES[pick(COUNTRIES.map((c) => c[1]))][0]
  // a quarter joined in the last day (shows up as "new members" in the composition line)
  const created = rand() < 0.25 ? NOW - Math.floor(rand() * 20 * H) : NOW - (5 + Math.floor(rand() * 20)) * D
  const m = { id: `seed${String(i).padStart(3, '0')}`, birth: from + Math.floor(rand() * (to - from + 1)), gender: rand() < 0.52 ? 'M' : 'F', country, created }
  m.nick = `anon-${rid(5)}`
  m.invitedBy = i > 20 && rand() < 0.2 ? members[Math.floor(rand() * 20)].id : null
  members.push(m)
  sql.push(
    `INSERT INTO members (id, provider, phone_hash, phone_country, birth_year, gender, nickname, status, lang, invited_by, invite_code, created_at) VALUES (${q(m.id)}, 'phone', ${q(`seed-phone-${i}`)}, ${q(country)}, ${m.birth}, ${q(m.gender)}, ${q(m.nick)}, 'active', ${q(country === 'KR' ? 'ko' : 'en')}, ${q(m.invitedBy)}, ${q(`seedinv${i}`)}, ${m.created})`,
  )
}

// ---- AI card sample: facts read on Logitech's official page (2026-10-28); everything not on the page is left out ----
const READY_CARDS = {
  [normKey('Logitech', 'MX Keys S')]: {
    title: 'MX Keys S',
    url: 'https://www.logitech.com/ko-kr/products/keyboards/mx-keys-s.920-011589.html',
    summary: {
      specs: [
        { label: 'Connection', value: 'Wireless' },
        { label: 'Multi-device', value: 'Switch instantly between up to 3 devices' },
        { label: 'Backlight', value: 'Turns on automatically as hands approach (proximity sensor)' },
        { label: 'Keys', value: 'Concave keys shaped for fingertips; reduced key wobble, quieter typing' },
        { label: 'Compatible OS', value: 'Windows · macOS · ChromeOS · Linux · iPadOS' },
      ],
      notes: ['Battery life and weight are not stated on the official page, so they are left out.'],
      ko: {
        specs: [
          { label: '연결', value: '무선' },
          { label: '멀티 기기', value: '최대 3대 기기 사이 즉시 전환' },
          { label: '백라이트', value: '손이 다가가면 근접 센서로 자동 켜짐' },
          { label: '키', value: '손끝 모양에 맞춘 오목한 키 · 키 흔들림을 줄여 소음 감소' },
          { label: '호환 OS', value: 'Windows · macOS · ChromeOS · Linux · iPadOS' },
        ],
        notes: ['배터리 사용 시간·무게는 공식 페이지에서 확인되지 않아 비워 둡니다.'],
      },
    },
    sources: [{ title: 'Logitech MX Keys S (official)', url: 'https://www.logitech.com/ko-kr/products/keyboards/mx-keys-s.920-011589.html', official: true }],
  },
}

// ---- operator seed polls (AI services first; two product polls kept) ----
const POLLS = [
  { cat: 'ai-assistants', lang: 'en', q: 'Best everyday assistant for work?', c: [['OpenAI', 'ChatGPT'], ['Anthropic', 'Claude'], ['Google', 'Gemini']], w: [0.38, 0.34, 0.28], closesIn: 9 * H, voters: 64 },
  { cat: 'ai-coding', lang: 'en', q: 'Which AI coding tool for a large codebase?', c: [['Anysphere', 'Cursor'], ['GitHub', 'Copilot'], ['Cognition', 'Windsurf']], w: [0.45, 0.33, 0.22], closesIn: -1 * D, voters: 58 },
  { cat: 'ai-image', lang: 'en', q: 'Image generator for product shots', c: [['Midjourney', 'Midjourney'], ['Black Forest Labs', 'FLUX'], ['Ideogram', 'Ideogram']], w: [0.44, 0.31, 0.25], closesIn: -3 * D, voters: 41 },
  { cat: 'ai-video', lang: 'en', q: 'Short video ads from a script', c: [['Runway', 'Gen-4'], ['Kuaishou', 'Kling'], ['Google', 'Veo']], w: [0.3, 0.32, 0.38], closesIn: 16 * H, voters: 19 },
  { cat: 'ai-search', lang: 'en', q: 'Research with sources you can check', c: [['Perplexity', 'Perplexity'], ['OpenAI', 'ChatGPT Search']], w: [0.57, 0.43], closesIn: -2 * D, voters: 36 },
  { cat: 'ai-audio', lang: 'en', q: 'Making a full song from a prompt', c: [['Suno', 'Suno'], ['Udio', 'Udio']], w: [0.6, 0.4], closesIn: -5 * D, voters: 29 },
  { cat: 'ai-writing', lang: 'en', q: 'AI inside the docs you already use', c: [['Notion', 'Notion AI'], ['Microsoft', 'Copilot for Microsoft 365']], w: [0.55, 0.45], closesIn: 3 * H, voters: 9 },
  { cat: 'ai-opensource', lang: 'en', q: 'Open-weight model to run locally', c: [['Meta', 'Llama'], ['DeepSeek', 'DeepSeek'], ['Mistral AI', 'Mistral']], w: [0.3, 0.42, 0.28], closesIn: -4 * D, voters: 27 },
  { cat: 'peripheral', lang: 'ko', q: '사무실에서 조용하게 쓸 키보드', c: [['Logitech', 'MX Keys S'], ['Keychron', 'K8 Pro']], w: [0.58, 0.42], closesIn: -2 * D, voters: 46, tilt: { M: [0, 0.12], F: [0.15, 0] } },
  { cat: 'audio', lang: 'ko', q: '출퇴근 지하철용 노이즈 캔슬링', c: [['Apple', 'AirPods Pro 2'], ['Sony', 'WF-1000XM5']], w: [0.55, 0.45], closesIn: 22 * H, voters: 6 },
]

const SOURCES = [
  ['direct', 0.66],
  ['share', 0.18],
  ['embed', 0.08],
  ['invite', 0.08],
]

const cardIds = new Map()
for (const p of POLLS) {
  const id = rid(8)
  const closes = NOW + p.closesIn
  const created = closes - D
  const open = closes > NOW
  p.id = id
  sql.push(
    `INSERT INTO polls (id, member_id, category, question, slug, is_seed, status, created_at, closes_at, closed_at, lang) VALUES (${q(id)}, NULL, ${q(p.cat)}, ${q(p.q)}, ${q(slugOf(p.c.map((x) => x[1])))}, 1, ${q(open ? 'open' : 'closed')}, ${created}, ${closes}, ${open ? 'NULL' : closes}, ${q(p.lang)})`,
  )
  p.candIds = p.c.map(([maker, product], i) => {
    const key = normKey(maker, product)
    if (!cardIds.has(key)) {
      const cid = rid(10)
      cardIds.set(key, cid)
      const ready = READY_CARDS[key]
      sql.push(
        ready
          ? `INSERT INTO cards (id, norm_key, maker, product, status, summary_json, sources_json, official_source, official_url, product_title, model, checked_at, created_at) VALUES (${q(cid)}, ${q(key)}, ${q(maker)}, ${q(product)}, 'ready', ${q(JSON.stringify(ready.summary))}, ${q(JSON.stringify(ready.sources))}, 1, ${q(ready.url)}, ${q(ready.title)}, 'sample', ${NOW}, ${NOW})`
          : `INSERT INTO cards (id, norm_key, maker, product, status, created_at) VALUES (${q(cid)}, ${q(key)}, ${q(maker)}, ${q(product)}, 'pending', ${NOW})`,
      )
    }
    const candId = rid(10)
    sql.push(
      `INSERT INTO candidates (id, poll_id, position, maker, product, norm_key, card_id) VALUES (${q(candId)}, ${q(id)}, ${i + 1}, ${q(maker)}, ${q(product)}, ${q(key)}, ${q(cardIds.get(key))})`,
    )
    return candId
  })
  // voters: sample without replacement; choice = poll weights with an optional gender tilt
  const pool = members.filter((m) => m.created < Math.min(closes, NOW))
  const until = Math.min(closes, NOW)
  for (let v = 0; v < p.voters && pool.length; v++) {
    const m = pool.splice(Math.floor(rand() * pool.length), 1)[0]
    const tilt = p.tilt?.[m.gender] ?? p.c.map(() => 0)
    const choice = pick(p.w.map((w, i) => w + (tilt[i] ?? 0)))
    const at = Math.max(created, m.created) + Math.floor(rand() * (until - Math.max(created, m.created)))
    const source = SOURCES[pick(SOURCES.map((s) => s[1]))][0]
    const isNew = at - m.created < D ? 1 : 0
    sql.push(
      `INSERT INTO votes (poll_id, member_id, candidate_id, age_band, gender, new_member, source, created_at) VALUES (${q(id)}, ${q(m.id)}, ${q(p.candIds[choice])}, ${q(band(m.birth))}, ${q(m.gender)}, ${isNew}, ${q(source)}, ${at})`,
    )
  }
}

// a few attempts stopped at the door on the busiest poll (the result shows them)
const busy = POLLS[0]
;[
  ['device', 3],
  ['network_cap', 1],
  ['network', 2],
].forEach(([reason, n]) => {
  for (let i = 0; i < n; i++) sql.push(`INSERT INTO vote_refusals (poll_id, reason, who_hash, created_at) VALUES (${q(busy.id)}, ${q(reason)}, ${q(`seed-who-${reason}-${i}`)}, ${NOW - 2 * H})`)
})

// ---- board ----
const POSTS = [
  ['Switched from Copilot to Cursor after the vote', 'The poll result matched my experience: Cursor handles multi-file edits better in a big monorepo.\nCopilot is still great inside the IDE you already have.', ['Same here', 'Windsurf deserves a fairer look though']],
  ['Why phone + passkey instead of an ID check?', 'Because nobody wants to upload a passport to vote on a chatbot. One number, one account, and every vote is signed on your own device.', ['Makes sense', 'Passkey prompt took 2 seconds on my phone']],
  ['Suggest: compare AI meeting note takers', 'Otter vs Fireflies vs Granola would be a useful poll.', []],
  ['키보드 투표 결과 보고 MX Keys S 샀어요', '30대는 로지텍 쪽이 확실히 많더라고요.\n사무실에서 일주일 써 보니 타건 소리는 거의 신경 안 쓰입니다.', ['저도 같은 고민이었는데 참고할게요']],
  ['Is the age split self-reported?', 'Yes — you pick your birth year and gender once when you join. The headline count is verified people only.', ['Good to know']],
  ['영상 생성 AI 투표 참여 부탁드려요', '아직 16시간 남았습니다. 실제로 써 보신 분들 기준으로 골라 주세요.', ['Kling 써 봤는데 괜찮았어요']],
]
POSTS.forEach(([title, body, comments], i) => {
  const id = rid(8)
  const author = members[(i * 7) % members.length]
  const at = NOW - (POSTS.length - i) * 5 * H
  sql.push(
    `INSERT INTO posts (id, member_id, nickname, title, body, comment_count, created_at) VALUES (${q(id)}, ${q(author.id)}, ${q(author.nick)}, ${q(title)}, ${q(body)}, ${comments.length}, ${at})`,
  )
  comments.forEach((text, j) => {
    const who = members[(i * 11 + j * 3 + 5) % members.length]
    sql.push(
      `INSERT INTO comments (id, post_id, member_id, nickname, body, created_at) VALUES (${q(rid(10))}, ${q(id)}, ${q(who.id)}, ${q(who.nick)}, ${q(text)}, ${at + (j + 1) * 20 * 60 * 1000})`,
    )
  })
})

const dir = mkdtempSync(join(tmpdir(), 'pollreal-seed-'))
const file = join(dir, 'seed.sql')
writeFileSync(file, `${sql.join(';\n')};\n`, 'utf8')
execSync(`npx wrangler d1 execute versus-db --local --file "${file}"`, { stdio: 'inherit' })
console.log(`seeded: ${members.length} members, ${POLLS.length} polls, ${POSTS.length} posts (local only)`)
