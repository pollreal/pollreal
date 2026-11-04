// Launch checklist runner (business plan v0.3 §7.8, step 11) against the live site through the pre-launch preview.
// Automates what can be checked from here; prints MANUAL for items that need a real phone, the operator or launch day.
//   node scripts/launch-check.mjs              → https://pollreal.com (preview key read from secrets/preview_key.txt)
//   node scripts/launch-check.mjs --base URL   → another origin (e.g. a staging copy)
// Never prints secrets. Exit code 1 if any automated item FAILs.
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const argBase = process.argv.indexOf('--base')
const BASE = (argBase > 0 ? process.argv[argBase + 1] : 'https://pollreal.com').replace(/\/$/, '')
const LANGS = ['en', 'ko', 'es', 'fr', 'hi', 'de', 'ja', 'zh', 'ru']
const DOCS = ['terms', 'privacy', 'policy', 'ai']
const results = []
const add = (no, item, status, note) => results.push({ no, item, status, note })

let cookie = ''
async function get(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: 'manual', headers: { cookie, 'user-agent': 'pollreal-launch-check' }, ...opts })
  const text = res.headers.get('content-type')?.includes('image') ? '' : await res.text()
  return { status: res.status, text, headers: res.headers }
}

// After launch (2026-11-04): `--launched` checks the open site instead of the holding page, and reads the Worker's
// secret NAMES (never values) with `wrangler secret list` in place of the preview-only /preview-check probe.
const LAUNCHED = process.argv.includes('--launched')
let launchedProbe = null
if (LAUNCHED) {
  const pub = await get('/')
  const robots = await get('/robots.txt')
  const ok = pub.status === 200 && !/noindex/i.test(pub.headers.get('x-robots-tag') ?? '') && /Sitemap: https:\/\/pollreal\.com\/sitemap\.xml/.test(robots.text) && !/Disallow: \/\s*$/m.test(robots.text)
  add(0, 'Site open (home 200, indexable, robots with sitemap)', ok ? 'PASS' : 'FAIL', `home ${pub.status}, x-robots-tag ${pub.headers.get('x-robots-tag') ?? 'none'}`)
  const names = new Set(JSON.parse(execSync('npx wrangler secret list --format json', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()).map((s) => s.name))
  const toml = readFileSync(join(ROOT, 'wrangler.toml'), 'utf8')
  const login = await get('/login')
  launchedProbe = {
    sms: { sender: /SMS_PROVIDER = "firebase"/.test(toml) ? 'firebase' : 'none', recaptcha: names.has('FIREBASE_API_KEY') && login.status === 200 ? 'ok' : 'missing' },
    twilio_secrets: [...names].filter((n) => n.startsWith('TWILIO')).length ? 'STILL SET' : 'removed',
    site_url: toml.match(/^SITE_URL = "([^"]+)"/m)?.[1],
    anthropic_key: names.has('ANTHROPIC_API_KEY') ? 'set' : 'missing',
    browser: /^\[browser\]/m.test(toml) ? 'bound' : 'missing',
    turnstile: names.has('TURNSTILE_SECRET_KEY') ? 'ok' : 'missing',
    hmac_pepper: names.has('HMAC_PEPPER') ? 'set' : 'missing',
    resend: 'not needed (maker claims off)',
    preview_key: names.has('PREVIEW_KEY') ? 'STILL SET' : 'deleted',
  }
  add(0, 'Preview key removed at launch', names.has('PREVIEW_KEY') ? 'FAIL' : 'PASS', `PREVIEW_KEY ${launchedProbe.preview_key}`)
}

// 0. gate: public sees the holding page; the preview key opens the real site
if (!LAUNCHED) {
  const pub = await get('/')
  const robots = await get('/robots.txt')
  const ok = pub.status === 503 && /Opening soon/.test(pub.text) && /Disallow: \/\s*$/.test(robots.text) && /noindex/i.test(pub.headers.get('x-robots-tag') ?? '')
  add(0, 'Pre-launch gate (public = holding page, robots disallow, noindex)', ok ? 'PASS' : 'FAIL', `home ${pub.status}, robots "${robots.text.trim().replace(/\n/g, ' ')}"`)
  // preview key lives outside the repo: %LOCALAPPDATA%\Pollreal\preview_key.txt (or env PREVIEW_KEY)
  const keyFile = join(process.env.LOCALAPPDATA ?? '', 'Pollreal', 'preview_key.txt')
  const key = (process.env.PREVIEW_KEY ?? (existsSync(keyFile) ? readFileSync(keyFile, 'utf8') : '')).trim()
  if (!key) { add(0, 'Preview key', 'FAIL', `missing: set PREVIEW_KEY or create ${keyFile}`); report() }
  const pv = await get(`/preview/${key}`)
  cookie = (pv.headers.get('set-cookie') ?? '').split(';')[0]
  if (pv.status !== 302 || !cookie) {
    add(0, 'Preview cookie', 'FAIL', `status ${pv.status}`)
    report()
  }
}

const probe = launchedProbe ?? JSON.parse((await get('/preview-check')).text || '{}')

// 1. legal documents
{
  const bad = []
  for (const d of DOCS) {
    for (const l of ['en', 'ko']) {
      const r = await get(l === 'en' ? `/${d}` : `/${l}/${d}`)
      if (r.status !== 200 || !r.text.includes('hello@pollreal.com')) bad.push(`${l}/${d}:${r.status}`)
    }
  }
  const de = await get('/de/terms')
  if (de.status !== 200) bad.push(`de/terms:${de.status}`)
  add(1, 'Legal documents EN/KO with operator contact', bad.length ? 'FAIL' : 'PASS', bad.length ? bad.join(' ') : '8 pages 200, contact hello@pollreal.com, other languages open the English text')
  const draft = (await get('/terms')).text.includes('draft')
  add(1, '"draft" wording replaced by the effective date', draft ? 'LAUNCH-DAY' : 'PASS', draft ? 'still "Version 1.0 — draft" (replace on launch day)' : 'effective date set')
}

// 2. phone verification
const smsOk = probe.sms?.sender === 'firebase' && probe.sms.recaptcha === 'ok'
add(2, 'SMS sender reachable (Google Firebase phone auth — sole sender; Twilio removed)', smsOk && probe.twilio_secrets !== 'STILL SET' ? 'PASS' : 'FAIL', JSON.stringify({ sms: probe.sms, twilio_secrets: probe.twilio_secrets ?? 'n/a' }))
add(2, 'Real SMS through the active sender received and the code accepted · no "SAMPLE TEST" in the text · KR + one other country', 'MANUAL', 'Firebase: operator signs in by phone on the preview link; Twilio stays a fallback until its business profile is approved')

// 3, 4, 17 real devices
add(2, 'Real sign-up attempt on production passes the bot check and reaches "Enter the code"', 'MANUAL', 'the dummy-token secret probe cannot catch a secret from the wrong widget (2026-11-02: every sign-up failed while this list said PASS); also Turnstile dashboard must not warn "Siteverify is not being called"; Firebase SMS region policy must allow each launch country')
add(3, 'Passkeys on iOS Safari · Android Chrome · Windows Hello (join → sign in → signed vote)', 'MANUAL', 'operator devices via the preview link')
add(4, 'One vote per device (two accounts on one device, cookie cleared, 11th on one network)', 'MANUAL', 'logic covered by the local smoke test (133 checks); one real-device repeat')
add(17, 'Phone: sign-up to first vote within 2 minutes', 'MANUAL', 'time it during item 3')

// 5. network check wording (9 languages) — the block itself needs a VPN
{
  const missing = []
  for (const l of LANGS) {
    const r = await get(l === 'en' ? '/login' : `/${l}/login`)
    if (r.status !== 200) missing.push(`${l}:${r.status}`)
  }
  add(5, 'Sign-in page in 9 languages (network-refusal texts are unit-tested)', missing.length ? 'FAIL' : 'PASS', missing.join(' ') || '9 × 200')
  add(5, 'VPN on → sign-up and vote refused', 'MANUAL', 'one try with a VPN on the operator phone')
}

// 6. report flow
add(6, 'Report button: illegal filming → immediate block, rights → 30-day measure', 'MANUAL', 'logic covered by the local smoke test; one production report on a seed poll after launch')

// 7. metrics
add(7, 'Metrics ledger first row + P1 alarms', 'LAUNCH-DAY', 'cron snapshots finished KST days; export with scripts/metrics-export.mjs --remote on launch day')

// 8. seeds
{
  let n = '?'
  try {
    n = execSync('npx wrangler d1 execute versus-db --remote --json --command "SELECT COUNT(*) AS n FROM polls WHERE is_seed = 1"', { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    n = JSON.parse(n)[0].results[0].n
  } catch {}
  add(8, 'Seed polls on production (30, in 3 daily batches)', n === 0 ? 'LAUNCH-DAY' : 'INFO', `seed polls now: ${n} — insert batch 1 right before opening`)
}

// 9. domain + SITE_URL
{
  const home = (await get('/')).text
  const canon = home.match(/rel="canonical" href="([^"]+)"/)?.[1]
  const ok = probe.site_url === 'https://pollreal.com' && canon === 'https://pollreal.com/'
  add(9, 'Domain + SITE_URL (passkey RP id)', ok ? 'PASS' : 'FAIL', `SITE_URL ${probe.site_url}, canonical ${canon}`)
}

// 10. fonts self-hosted
{
  const pages = ['/', '/terms', '/ko', '/ja']
  let google = 0
  for (const p of pages) google += ((await get(p)).text.match(/fonts\.(googleapis|gstatic)\.com/g) ?? []).length
  const css = (await get('/assets/app.css')).text
  const font = await get('/fonts/inter-latin-wght-normal.woff2')
  const ok = google === 0 && !/googleapis|gstatic/.test(css) && font.status === 200
  add(10, 'Fonts self-hosted (no Google Fonts requests)', ok ? 'PASS' : 'FAIL', `google refs ${google}, /fonts ${font.status}`)
}

// 11. nine languages
{
  const bad = []
  for (const l of LANGS) {
    const r = await get(l === 'en' ? '/' : `/${l}`)
    if (r.status !== 200 || !r.text.includes(`<html lang="${l}"`)) bad.push(`${l}:${r.status}`)
  }
  add(11, 'Nine languages open (empty strings = unit test)', bad.length ? 'FAIL' : 'PASS', bad.join(' ') || '9 × 200, lang attribute set')
}

// 12. AI cards
add(12, 'AI card key (workspace pollreal, USD 10/month limit set 2026-10-29) + browser for the deep pass', probe.anthropic_key === 'set' && probe.browser === 'bound' ? 'PASS' : 'FAIL', `key ${probe.anthropic_key}; browser ${probe.browser ?? 'missing'}; code guard 200 cards / USD 5 per day`)

// 13. search registration
add(13, 'Search Console + Naver Search Advisor + sitemaps', 'LAUNCH-DAY', 'register the domain now (DNS TXT); submit the sitemap after the gate opens')

// 14. backups
add(14, 'Backups: D1 Time Travel (30 days, built in) + daily export', 'INFO', 'procedure in app/README.md "Backups"; restore drill done locally')

// 15. secrets
{
  const okKeys = probe.turnstile === 'ok' && probe.hmac_pepper === 'set' && probe.anthropic_key === 'set' && smsOk
  let tracked = ''
  try {
    tracked = execSync('git ls-files', { cwd: join(ROOT, '..'), encoding: 'utf8' })
  } catch {}
  const leaks = tracked.split('\n').filter((f) => /(^|\/)\.env($|\.(?!example$))|\.dev\.vars|\.key$|\.pem$|(^|\/)secrets\/|pw\.txt$|\.dpapi$/.test(f))
  add(15, 'Secrets only as Worker secrets; none tracked in git', okKeys && !leaks.length ? 'PASS' : 'FAIL', `turnstile ${probe.turnstile}, pepper ${probe.hmac_pepper}, tracked leaks ${leaks.length}; resend: ${probe.resend}`)
}

// 16. SMS caps (Google bills per SMS sent; Twilio removed 2026-11-04)
add(16, 'Daily SMS caps + cap alert mail', 'INFO', 'production caps from the PRIVATE_LIMITS secret (public defaults in src/config.ts OTP_CAPS); cap reached -> mail to ALERT_TO')

report()

function report() {
  const order = { FAIL: 0, MANUAL: 1, 'LAUNCH-DAY': 2, INFO: 3, PASS: 4 }
  console.log(`# Launch check — ${BASE} — ${new Date().toISOString()}`)
  for (const r of [...results].sort((a, b) => a.no - b.no)) console.log(`${String(r.no).padStart(2)} [${r.status}] ${r.item} — ${r.note}`)
  const count = (s) => results.filter((r) => r.status === s).length
  console.log(`\nPASS ${count('PASS')} · FAIL ${count('FAIL')} · MANUAL ${count('MANUAL')} · LAUNCH-DAY ${count('LAUNCH-DAY')} · INFO ${count('INFO')}`)
  void order
  process.exit(count('FAIL') ? 1 : 0)
}
