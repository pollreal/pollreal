// End-to-end smoke test against a local dev server (LOCAL database only — it is wiped first).
// Run: npm run db:migrate:local, `npm run dev` in another terminal, then `npm run smoke` (then `npm run seed`).
// Sign-up and voting run the real flows: SMS code (development sender shows the code), passkeys signed by a small
// software authenticator below (P-256, "none" attestation — what a synced platform passkey sends), and the real
// server-side WebAuthn verification. Development headers simulate networks: x-dev-ip, x-dev-asn.
import { execSync } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:8787' // must match the dev SITE_URL (passkey origin check)
// Development uses Cloudflare's always-pass Turnstile test keys; their widget hands out this dummy token.
const BOT = { 'cf-turnstile-response': 'XXXX.DUMMY.TOKEN.XXXX' }
const KST_TODAY = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
const THIS_YEAR = new Date().getUTCFullYear()
let failures = 0
let passes = 0
const ok = (cond, label) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`)
  if (cond) passes++
  else failures++
}

// ---------------------------------------------------------------------------------------------------------------------
// Minimal CBOR + software authenticator
// ---------------------------------------------------------------------------------------------------------------------
const b64u = (buf) => Buffer.from(buf).toString('base64url')
const sha256 = (data) => createHash('sha256').update(data).digest()

function cborHead(major, n) {
  if (n < 24) return Buffer.from([(major << 5) | n])
  if (n < 256) return Buffer.from([(major << 5) | 24, n])
  if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255])
  const b = Buffer.alloc(5)
  b[0] = (major << 5) | 26
  b.writeUInt32BE(n, 1)
  return b
}
function cbor(v) {
  if (typeof v === 'number') return v >= 0 ? cborHead(0, v) : cborHead(1, -1 - v)
  if (typeof v === 'string') {
    const s = Buffer.from(v, 'utf8')
    return Buffer.concat([cborHead(3, s.length), s])
  }
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return Buffer.concat([cborHead(2, v.length), Buffer.from(v)])
  const entries = v instanceof Map ? [...v.entries()] : Object.entries(v)
  return Buffer.concat([cborHead(5, entries.length), ...entries.flatMap(([k, x]) => [cbor(k), cbor(x)])])
}

class Authenticator {
  constructor() {
    this.creds = new Map() // rpId -> { id, key, userHandle, counter }
  }
  create(options) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const jwk = publicKey.export({ format: 'jwk' })
    const id = randomBytes(16)
    const cose = cbor(new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]))
    const rpId = options.rp.id
    const len = Buffer.alloc(2)
    len.writeUInt16BE(id.length)
    // flags: UP 0x01 | UV 0x04 | backup-eligible 0x08 | backed-up 0x10 | attested data 0x40
    const authData = Buffer.concat([sha256(rpId), Buffer.from([0x5d]), Buffer.alloc(4), Buffer.alloc(16), len, id, cose])
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: options.challenge, origin: BASE, crossOrigin: false }))
    this.creds.set(rpId, { id, key: privateKey, userHandle: options.user.id, counter: 0 })
    return {
      id: b64u(id),
      rawId: b64u(id),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientData), attestationObject: b64u(cbor({ fmt: 'none', attStmt: {}, authData })), transports: ['internal', 'hybrid'] },
    }
  }
  get(options, { tamper = false } = {}) {
    const c = this.creds.get(options.rpId)
    if (!c) throw new Error('no credential for this site')
    const authData = Buffer.concat([sha256(options.rpId), Buffer.from([0x1d]), Buffer.alloc(4)]) // UP|UV|BE|BS, counter 0 (synced)
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin: BASE, crossOrigin: false }))
    let signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), c.key)
    if (tamper) signature = Buffer.from(signature.map((x, i) => (i === signature.length - 1 ? x ^ 1 : x)))
    return {
      id: b64u(c.id),
      rawId: b64u(c.id),
      type: 'public-key',
      authenticatorAttachment: 'platform',
      clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: c.userHandle },
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Browser-like user: cookie jar, its own device (User-Agent, address, signals) and passkey authenticator
// ---------------------------------------------------------------------------------------------------------------------
let nextIp = 1
class User {
  constructor(name, o = {}) {
    this.name = name
    this.jar = new Map()
    this.ua = o.ua ?? `smoke-browser/${name}`
    this.ip = o.ip ?? `10.0.${Math.floor(nextIp / 250)}.${(nextIp++ % 250) + 1}`
    this.asn = o.asn ?? null
    this.signals = o.signals ?? `1170x2532|3|Asia/Seoul|ko,en|6|4|5|Apple GPU|${name}`
    this.auth = o.auth ?? new Authenticator()
    this.dt = null // device token the page hands to the script (mirrored into browser storage)
  }
  headers(extra = {}) {
    // x-dev-offline: mock SMS and no paid calls even when real keys are in .dev.vars
    const h = { cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), 'user-agent': this.ua, 'x-dev-ip': this.ip, 'x-dev-offline': '1', ...extra }
    if (this.asn) h['x-dev-asn'] = String(this.asn)
    return h
  }
  store(res) {
    for (const sc of res.headers.getSetCookie()) {
      const [pair, ...attrs] = sc.split(';')
      const i = pair.indexOf('=')
      const k = pair.slice(0, i).trim()
      const v = pair.slice(i + 1).trim()
      if (attrs.some((a) => /max-age=0/i.test(a)) || v === '') this.jar.delete(k)
      else this.jar.set(k, v)
    }
  }
  async send(method, path, { form, json, origin = true } = {}) {
    const headers = this.headers(origin ? { origin: BASE } : {})
    let body
    if (form) {
      body = new URLSearchParams(form).toString()
      headers['content-type'] = 'application/x-www-form-urlencoded'
    } else if (json) {
      body = JSON.stringify(json)
      headers['content-type'] = 'application/json'
    }
    // One retry when the dev server dropped an idle keep-alive connection (long local wrangler steps in between).
    const go = () => fetch(BASE + path, { method, headers, body, redirect: 'manual' })
    const res = await go().catch((e) => (/ECONNRESET|socket/i.test(String(e.cause ?? e)) ? go() : Promise.reject(e)))
    this.store(res)
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {}
    return { status: res.status, location: res.headers.get('location'), csp: res.headers.get('content-security-policy') ?? '', type: res.headers.get('content-type') ?? '', text, data }
  }
  get(path) {
    return this.send('GET', path)
  }
  post(path, form, o) {
    return this.send('POST', path, { form, ...o })
  }
  api(path, json, o) {
    return this.send('POST', path, { json, ...o })
  }
  // Phone number -> code -> profile -> passkey. Returns the last response.
  async signup(phone, { country = 'KR', birthYear = 1991, gender = 'M', expectPasskey = true } = {}) {
    let r = await this.post('/auth/phone', { country, phone, next: '/', ...BOT })
    if (r.status !== 303 || !r.location?.startsWith('/auth/code')) return r
    const code = new URL(r.location, BASE).searchParams.get('dev')
    r = await this.post('/auth/code', { code })
    if (r.location !== '/join/profile') return r
    r = await this.post('/join/profile', { birth_year: String(birthYear), gender, agree: 'yes' })
    if (r.location !== '/join/passkey' || !expectPasskey) return r
    return this.registerPasskey()
  }
  async registerPasskey(kind = 'register') {
    const o = await this.api(`/api/passkey/${kind}/options`, { lang: 'en' })
    if (!o.data?.options) return o
    return this.api(`/api/passkey/${kind}/verify`, { lang: 'en', credential: this.auth.create(o.data.options) })
  }
  async login() {
    const o = await this.api('/api/passkey/login/options', { lang: 'en' })
    return this.api('/api/passkey/login/verify', { lang: 'en', credential: this.auth.get(o.data.options), next: '/me' })
  }
  async open(pollUrl) {
    const r = await this.get(pollUrl)
    const dt = r.text.match(/data-dt="([^"]+)"/)?.[1]
    if (dt && !this.dt) this.dt = dt // the page script keeps the first one in browser storage
    return r
  }
  // Vote like the page script: options -> passkey -> signed vote with the mirrored device token and browser signals.
  async vote(pollId, candidate, { tamper = false, mirror } = {}) {
    const o = await this.api('/api/vote/options', { lang: 'en', poll: pollId, candidate })
    if (!o.data?.options) return o
    return this.api('/api/vote', {
      lang: 'en',
      poll: pollId,
      candidate,
      credential: this.auth.get(o.data.options, { tamper }),
      mirror: mirror === undefined ? this.dt : mirror,
      signals: this.signals,
    })
  }
}

// Local D1 only (never --remote). Returns the rows of the last statement.
// The local D1 file is shared with the running dev server; a busy write can fail with "Failed to get session commit
// token" (2026-11-04) — retry a few times before giving up.
const sql = (command) => {
  if (command.includes('"')) throw new Error('no double quotes in smoke SQL')
  for (let attempt = 1; ; attempt++) {
    try {
      const out = execSync(`npx wrangler d1 execute versus-db --local --json --command "${command}"`, { stdio: 'pipe' }).toString()
      return JSON.parse(out.slice(out.indexOf('['))).at(-1)?.results ?? []
    } catch (e) {
      const text = `${e.stdout ?? ''}${e.stderr ?? ''}`
      if (attempt >= 6 || !/commit token|internal error|SQLITE_BUSY|database is locked/i.test(text)) throw e
      execSync(process.platform === 'win32' ? 'ping -n 3 127.0.0.1 >NUL' : 'sleep 2')
    }
  }
}
const count = (q) => sql(q)[0]?.n
let phoneNo = 1000
const nextPhone = () => `010-1234-${String(phoneNo++).padStart(4, '0')}`
const candidatesOf = (html) => [...html.matchAll(/data-vote="([a-z0-9]+)"/g)].map((m) => m[1])

// ---------------------------------------------------------------------------------------------------------------------
// 0. clean local database
// ---------------------------------------------------------------------------------------------------------------------
sql(
  [
    'DELETE FROM rankings',
    'DELETE FROM ranking_meta',
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
  ].join('; '),
)

// 1. anonymous browsing, both languages
const anon = new User('anon')
let r = await anon.get('/')
ok(r.status === 200 && r.text.includes('Which is actually better?') && r.text.includes('<html lang="en"'), 'English home')
ok(['ko', 'es', 'fr', 'hi', 'de', 'ja', 'zh', 'ru'].every((l) => r.text.includes(`href="/${l}"`)) && r.text.includes('hreflang="ja"'), 'language menu and hreflang links for all nine languages')
for (const [l, word] of [['es', 'mejor'], ['fr', 'meilleur'], ['hi', 'बेहतर'], ['de', 'besser'], ['ja', '本当'], ['zh', '更好'], ['ru', 'лучше']]) {
  r = await anon.get(`/${l}`)
  ok(r.status === 200 && r.text.includes(`<html lang="${l}"`) && r.text.includes(word), `home in ${l}`)
}
r = await anon.get('/')
r = await anon.get('/ko')
ok(r.status === 200 && r.text.includes('진짜 뭐가 더 나을까') && r.text.includes('<html lang="ko"'), 'Korean home')
r = await anon.get('/new')
ok(r.status === 302 && r.location === '/login?next=%2Fnew', 'create poll requires sign-in')
r = await anon.get('/ko/new')
ok(r.status === 302 && r.location === '/ko/login?next=%2Fko%2Fnew', 'Korean create poll -> Korean sign-in')
r = await anon.get('/login')
ok(r.status === 200 && r.text.includes('data-passkey-login') && r.text.includes('name="country"') && r.text.includes('cf-turnstile'), 'sign-in page: passkey button, phone form, bot check')
ok(/script-src[^;]*'self'[^;]*challenges\.cloudflare\.com/.test(r.csp) && /frame-ancestors 'none'/.test(r.csp), 'CSP: own script + bot check only, no framing')

// 2. sign-up with a phone number
const alice = new User('alice')
r = await alice.post('/auth/phone', { country: 'KR', phone: '010-1234-0001', next: '/' })
ok(r.status === 400 && r.text.includes('bot check'), 'phone step needs the bot check')
r = await alice.post('/auth/phone', { country: 'KR', phone: '12345', next: '/', ...BOT })
ok(r.status === 400 && r.text.includes('does not look like a valid mobile number'), 'invalid number refused')
r = await alice.post('/auth/phone', { country: 'KR', phone: '070-1234-5678', next: '/', ...BOT })
ok(r.status === 400 && r.text.includes('internet (VoIP)'), 'internet phone (070) refused')
r = await alice.post('/auth/phone', { country: 'KR', phone: '02-312-3456', next: '/', ...BOT })
ok(r.status === 400 && r.text.includes('Landline'), 'landline refused')
const vpn = new User('vpn', { asn: 16509 })
r = await vpn.post('/auth/phone', { country: 'KR', phone: '010-1234-0999', next: '/', ...BOT })
ok(r.status === 403 && r.text.includes('VPN, a data centre'), 'sign-up from a data centre network refused')
r = await alice.post('/auth/phone', { country: 'KR', phone: '010-1234-0001', next: '/', ...BOT })
ok(r.status === 303 && /^\/auth\/code\?dev=\d{6}$/.test(r.location ?? ''), 'code sent (development shows it)')
const aliceCode = new URL(r.location, BASE).searchParams.get('dev')
r = await alice.get(r.location)
ok(r.text.includes('+82 •••• 0001') && r.text.includes(`data-dev-code="${aliceCode}"`), 'code page shows the masked number')
ok(count("SELECT COUNT(*) AS n FROM phone_flows WHERE phone_e164 = '+821012340001'") === 1, 'the number is kept only inside the open flow')
r = await alice.post('/auth/code', { code: aliceCode === '000000' ? '111111' : '000000' })
ok(r.status === 400 && r.text.includes('That code is not right'), 'wrong code refused')
r = await alice.post('/auth/code', { code: aliceCode })
ok(r.status === 303 && r.location === '/join/profile', 'code confirmed -> profile')
ok(count('SELECT COUNT(*) AS n FROM phone_flows WHERE phone_e164 IS NOT NULL') === 0, 'number erased once the code is confirmed')
r = await alice.post('/join/profile', { birth_year: String(THIS_YEAR - 12), gender: 'F', agree: 'yes' })
ok(r.status === 400 && r.text.includes('at least 14'), 'Korean number: under 14 refused (self-reported birth year)')
r = await alice.post('/join/profile', { birth_year: '1990', gender: 'F' })
ok(r.status === 400 && r.text.includes('agree'), 'terms consent required')
r = await alice.post('/join/profile', { birth_year: '1990', gender: 'F', agree: 'yes' })
ok(r.status === 303 && r.location === '/join/passkey', 'profile saved -> passkey')
r = await alice.get('/join/passkey')
ok(r.text.includes('data-passkey-register'), 'passkey page')
r = await alice.api('/api/passkey/register/options', { lang: 'en' }, { origin: false })
ok(r.status === 400, 'JSON endpoints refuse requests without Origin')
r = await alice.registerPasskey()
ok(r.status === 200 && r.data?.redirect === '/' && alice.jar.has('vs_sid'), 'passkey created -> member signed in')
ok(count("SELECT COUNT(*) AS n FROM members WHERE phone_hash IS NOT NULL AND birth_year = 1990 AND gender = 'F' AND phone_country = 'KR'") === 1, 'member keeps phone hash, birth year, gender, country only')
ok(count('SELECT COUNT(*) AS n FROM passkeys') === 1 && count('SELECT COUNT(*) AS n FROM phone_flows') === 0, 'one passkey stored, flow closed')
r = await alice.get('/me')
ok(r.status === 200 && r.text.includes('phone verified (KR)') && r.text.includes('/i/'), 'my page: verified, invite link')

// 3. the same number again = the same account (sign-in by phone), never a second one
const alicePhone = new User('alice-phone')
r = await alicePhone.signup('010-1234-0001')
ok(r.status === 303 && r.location === '/' && alicePhone.jar.has('vs_sid'), 'same number -> signed in to the existing account')
ok(count('SELECT COUNT(*) AS n FROM members') === 1, 'still one account for that number')

// 4. passkey sign-in on another browser (synced passkey)
const aliceLaptop = new User('alice-laptop', { auth: alice.auth })
r = await aliceLaptop.login()
ok(r.status === 200 && r.data?.redirect === '/me' && aliceLaptop.jar.has('vs_sid'), 'passkey sign-in')

r = await alice.get('/login?next=%2F%09%2Fevil.com')
ok(r.status === 302 && r.location === '/', 'sign-in redirect refuses control characters (no open redirect)')
r = await alice.get('/login?next=%2Fme')
ok(r.status === 302 && r.location === '/me', '... and keeps ordinary paths')

// 5. create polls
r = await alice.post('/new', { category: 'ai-assistants', maker1: 'OpenAI', product1: 'ChatGPT', maker2: 'Anthropic', product2: 'Claude' })
ok(r.status === 400 && r.text.includes('bot check') && r.text.includes('value="Claude"'), 'poll without bot check refused, form kept')
r = await alice.post('/new', { category: 'ai-assistants', maker1: 'OpenAI', product1: 'ChatGPT', maker2: 'Anthropic', product2: 'Claude', question: 'Best for writing?', ...BOT })
ok(r.status === 303 && /^\/v\/[a-z0-9]{8}\//.test(r.location ?? ''), 'poll created')
const pollUrl = r.location
const pollId = pollUrl.split('/')[2]
r = await alice.post('/new', { category: 'ai-coding', maker1: 'Anysphere', product1: 'Cursor', maker2: 'GitHub', product2: 'Copilot', ...BOT })
const poll2Url = r.location
const poll2Id = poll2Url.split('/')[2]
r = await alice.post('/ko/new', { category: 'ai-image', maker1: 'Midjourney', product1: 'Midjourney', maker2: 'Black Forest Labs', product2: 'FLUX', ...BOT })
ok(r.status === 303 && r.location?.startsWith('/ko/v/'), 'Korean page creates a poll and returns to the Korean URL')
const poll3Id = r.location.split('/')[3]
ok(count(`SELECT COUNT(*) AS n FROM polls WHERE id = '${poll3Id}' AND lang = 'ko'`) === 1, 'poll remembers its language')
r = await anon.get(`/ko/v/${poll3Id}/x`)
ok(r.status === 301 && r.location === `/ko/v/${poll3Id}/midjourney-vs-flux`, 'wrong slug -> canonical, same language')
r = await anon.get(`/ko/v/${poll3Id}/midjourney-vs-flux`)
ok(r.text.includes('Midjourney vs Black Forest Labs FLUX') && r.text.includes('AI 비교 카드'), 'maker name not repeated ("Midjourney"), Korean labels')

// 6. voting: passkey signature per vote, one vote per member
r = await alice.open(pollUrl)
const ids = candidatesOf(r.text)
ok(ids.length === 2 && r.text.includes('data-dt="') && alice.jar.has('vs_dt'), 'vote buttons + device token for a member who can vote')
ok(!r.text.includes('challenges.cloudflare.com/turnstile'), 'no bot-check widget on the poll page (the passkey signs the vote)')
r = await alice.api('/api/vote', { lang: 'en', poll: pollId, candidate: ids[0] })
ok(r.status === 401 && r.data?.error?.includes('passkey'), 'vote without a passkey signature refused')
r = await alice.vote(pollId, ids[0], { tamper: true })
ok(r.status === 401, 'vote with a forged signature refused')
r = await alice.vote(pollId, 'nope')
ok(r.status === 400 && r.data?.redirect?.includes('m=invalid'), 'unknown candidate refused')
r = await alice.vote(pollId, ids[0])
ok(r.status === 200 && r.data?.redirect === `${pollUrl}?m=voted#result`, 'signed vote recorded')
r = await alice.vote(pollId, ids[1])
ok(r.data?.redirect?.includes('m=dup'), 'second vote refused')
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${pollId}' AND dt_hash IS NOT NULL AND fp_hash IS NOT NULL AND net_hash IS NOT NULL`) === 1, 'vote stores per-poll device values')
r = await alice.get(pollUrl)
ok(r.text.includes('Your vote: OpenAI ChatGPT') && r.text.includes('Interim result') && r.text.includes('How these votes were cast'), 'voter sees own choice, interim result, composition')
r = await anon.get(pollUrl)
ok(!r.text.includes('Interim result') && r.text.includes('Sign in to vote'), 'visitor sees no interim result')

// six more members on their own devices -> n = 7
const crowd = []
for (let i = 2; i <= 7; i++) {
  const u = new User(`u${i}`)
  r = await u.signup(nextPhone(), { birthYear: 1991, gender: 'M' })
  ok(r.status === 200 && r.data?.redirect === '/', `member u${i} joined`)
  await u.open(pollUrl)
  r = await u.vote(pollId, ids[i % 2])
  ok(r.data?.redirect?.includes('m=voted'), `member u${i} voted`)
  crowd.push(u)
}
r = await alice.get(pollUrl)
ok(r.text.includes('7 verified humans voted'), 'interim n = 7')

// 7. one vote per device
// R1: another account in the same browser
const sharedBrowser = new User('bob')
sharedBrowser.jar = new Map(alice.jar)
sharedBrowser.ua = alice.ua
await sharedBrowser.post('/logout', {}) // signs alice out of that browser too (same session)
r = await alice.login()
ok(r.data?.redirect === '/me', 'alice signs back in with her passkey')
r = await sharedBrowser.signup(nextPhone())
ok(r.data?.redirect === '/', 'a second account joins in the same browser')
await sharedBrowser.open(pollUrl)
sharedBrowser.ip = '10.9.9.9'
r = await sharedBrowser.vote(pollId, ids[1])
ok(r.status === 409 && r.data?.error?.includes('This device has already been used'), 'R1: same browser, another account -> refused')
// R1 via the mirrored token: cookies cleared, browser storage kept
const clearedCookies = new User('carol')
r = await clearedCookies.signup(nextPhone())
await clearedCookies.open(pollUrl)
r = await clearedCookies.vote(pollId, ids[1], { mirror: alice.dt })
ok(r.status === 409 && r.data?.error?.includes('This device has already been used'), 'R1: token kept in browser storage still links the device')
// R2: fresh browser profile, same device and network
const sameDevice = new User('dave', { ua: crowd[0].ua, ip: crowd[0].ip, signals: crowd[0].signals })
sameDevice.ip = '10.8.8.8'
r = await sameDevice.signup(nextPhone())
sameDevice.ip = crowd[0].ip
await sameDevice.open(pollUrl)
r = await sameDevice.vote(pollId, ids[1])
ok(r.status === 409 && r.data?.error?.includes('mobile data'), 'R2: same device fingerprint on the same network -> refused')
// network check at voting
const relay = new User('erin')
r = await relay.signup(nextPhone())
relay.asn = 14061 // a network on the public example list (the production list in PRIVATE_LIMITS is longer)
await relay.open(pollUrl)
r = await relay.vote(pollId, ids[1])
ok(r.status === 403 && r.data?.error?.includes('iCloud Private Relay'), 'vote through a relay/VPN network refused')
relay.asn = null
r = await relay.vote(pollId, ids[1])
ok(r.data?.redirect?.includes('m=voted'), '... and accepted once the relay is off')
// R3: shared network cap (10 per poll)
const office = []
for (let i = 0; i < 11; i++) {
  const u = new User(`office${i}`)
  r = await u.signup(nextPhone())
  u.ip = '10.77.77.77'
  await u.open(poll2Url)
  r = await u.vote(poll2Id, candidatesOf((await u.get(poll2Url)).text)[i % 2])
  office.push(r)
}
ok(office.slice(0, 10).every((x) => x.data?.redirect?.includes('m=voted')), 'R3: ten different devices on one network vote')
ok(office[10].status === 409 && office[10].data?.error?.includes('More than 10 people'), 'R3: the eleventh on the same network -> refused')
// R3 under simultaneous requests: twelve members on one network vote at the same moment on a fresh poll
r = await alice.post('/new', { category: 'ai-agents', maker1: 'OpenAI', product1: 'Operator', maker2: 'Anthropic', product2: 'Computer Use', ...BOT })
const raceUrl = r.location
const raceId = raceUrl.split('/')[2]
const racers = []
for (let i = 0; i < 12; i++) {
  const u = new User(`race${i}`)
  await u.signup(nextPhone())
  u.ip = '10.66.66.66'
  await u.open(raceUrl)
  racers.push(u)
}
const raceIds = candidatesOf((await racers[0].get(raceUrl)).text)
const opts = await Promise.all(racers.map((u, i) => u.api('/api/vote/options', { lang: 'en', poll: raceId, candidate: raceIds[i % 2] })))
await Promise.all(
  racers.map((u, i) => u.api('/api/vote', { lang: 'en', poll: raceId, candidate: raceIds[i % 2], credential: u.auth.get(opts[i].data.options), mirror: u.dt, signals: u.signals })),
)
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${raceId}'`) === 10, 'R3 holds under simultaneous votes (exactly 10 from one network)')
r = await alice.get(pollUrl)
ok(r.text.includes('blocked at the door: 4') && r.text.includes('same device 3') && r.text.includes('VPN or data centre 1'), 'result discloses attempts blocked at the door (one count per person and reason)')

// 8. viral: share arrival, share counter, embed, result image
const sharer = new User('frank')
r = await sharer.get(`${pollUrl}?via=share`)
ok(r.status === 302 && r.location === pollUrl && sharer.jar.has('vs_src'), 'share link: channel remembered, clean URL')
r = await sharer.signup(nextPhone())
await sharer.open(pollUrl)
r = await sharer.vote(pollId, ids[0])
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${pollId}' AND source = 'share'`) === 1, 'vote attributed to the share channel')
r = await alice.api('/api/share', { poll: pollId })
ok(r.status === 204 && count(`SELECT n FROM share_counts WHERE poll_id = '${pollId}' AND kind = 'share_click'`) === 1, 'share click counted')
r = await anon.get(`/embed/v/${pollId}`)
ok(r.status === 200 && /frame-ancestors \*/.test(r.csp) && !/X-Frame-Options/i.test(r.text) && r.text.includes('verified humans have voted so far'), 'embed widget: framable, no interim percentages')
ok(r.text.includes(`${pollUrl}?via=embed`), 'embed links carry the embed channel')
r = await anon.get(`/og/v/${pollId}.png?lang=en`)
ok(r.status === 200 && r.type === 'image/png', 'result card image renders')
r = await anon.get(pollUrl)
ok(r.text.includes(`og:image" content="${BASE}/og/v/${pollId}.png`), 'poll page points social previews at the result image')

// 8b. contest gauge, rally panel, live tally, README badges (2026-11-01)
r = await alice.get(pollUrl)
ok(r.text.includes(`data-gauge="${pollId}"`) && r.text.includes('g-seg') && r.text.includes('Majority 50%'), 'voter sees the live contest gauge')
ok(/class="side (behind|lead|tied)"/.test(r.text) && /Rally votes|Defend the lead/.test(r.text) && r.text.includes('Your pick '), 'voter sees where the pick stands and a rally button')
ok(r.text.includes(`/badge/${pollId}.svg?for=1`) && r.text.includes(`/badge/card/${pollId}.svg`), 'share box offers README badges')
r = await anon.get(pollUrl)
ok(!r.text.includes('class="side ') && !r.text.includes('data-gauge='), 'visitor sees no gauge and no rally panel while open')
r = await anon.get(`/api/tally/${pollId}`)
ok(r.status === 403, 'live tally refused to a visitor while open')
r = await alice.get(`/api/tally/${pollId}?lang=ko`)
{
  const d = JSON.parse(r.text)
  ok(r.status === 200 && d.open === true && d.segs.length === 2 && d.segs.every((x) => typeof x.pct === 'number' && /표$/.test(x.votes)), 'live tally for the voter, in their language')
}
r = await anon.get(`/badge/${pollId}.svg`)
ok(r.status === 200 && r.type.startsWith('image/svg+xml') && r.text.includes('voting · ') && !r.text.includes('%'), 'badge hides the split while open')
r = await anon.get(`/badge/card/${pollId}.svg`)
ok(r.status === 200 && r.text.includes('split shown to voters'), 'gauge card is locked while open')

// 9. maker claim + campaign link (disclosed votes)
sql(
  `UPDATE cards SET status = 'ready', official_source = 1, official_url = 'https://www.anthropic.com/claude', summary_json = '{}', sources_json = '[]', checked_at = 1 WHERE norm_key = 'anthropic|claude'`,
)
const cardId = sql("SELECT id FROM cards WHERE norm_key = 'anthropic|claude'")[0]?.id
r = await anon.get(pollUrl)
ok(r.text.includes(`/maker/claim/${cardId}`), 'maker can claim a product with a confirmed official site')
const maker = crowd[1]
r = await maker.post(`/maker/claim/${cardId}`, { email: 'me@gmail.com' })
ok(r.status === 400 && r.text.includes('anthropic.com'), 'claim needs an email at the official domain')
r = await maker.post(`/maker/claim/${cardId}`, { email: 'team@anthropic.com' })
const verifyLink = r.text.match(/data-dev-claim-link[^>]*>([^<]+)</)?.[1]?.replace(/&amp;/g, '&')
ok(r.status === 200 && !!verifyLink, 'verification link sent (development shows it)')
r = await maker.get(verifyLink.replace(BASE, ''))
ok(r.status === 200 && r.text.includes('Confirm I work for this maker'), 'email link opens a confirm page')
ok(count("SELECT COUNT(*) AS n FROM maker_claims WHERE status = 'pending'") === 1, '... and opening it alone verifies nothing (mail scanners)')
r = await maker.post('/maker/verify', { t: new URL(verifyLink).searchParams.get('t'), l: 'en' })
ok(r.status === 200 && r.text.includes('You are verified as the maker of Anthropic Claude'), 'maker verified by confirming')
r = await maker.get(pollUrl)
const campaign = r.text.match(/\/m\/([a-z0-9]+)\/([a-z0-9]{8})/)
ok(!!campaign && campaign[2] === pollId, 'verified maker sees a campaign link on the poll')
const fan = new User('grace')
r = await fan.get(`/m/${campaign[1]}/${pollId}`)
ok(r.status === 302 && r.location === pollUrl, 'campaign link -> poll')
r = await fan.signup(nextPhone())
await fan.open(pollUrl)
r = await fan.vote(pollId, ids[1])
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${pollId}' AND source = 'maker' AND maker_claim_id IS NOT NULL`) === 1, 'campaign vote recorded as maker-campaign vote')
r = await fan.get(pollUrl)
ok(r.text.includes('via maker campaigns: 1') && r.text.includes('Anthropic: 1'), 'result discloses maker-campaign votes by maker')

// 10. invites
const inviteCode = sql("SELECT invite_code FROM members WHERE phone_country = 'KR' ORDER BY created_at LIMIT 1")[0]?.invite_code
const invitee = new User('heidi')
r = await invitee.get(`/i/${inviteCode}`)
ok(r.status === 302 && invitee.jar.has('vs_inv'), 'invite link remembered')
r = await invitee.signup(nextPhone())
ok(count(`SELECT COUNT(*) AS n FROM members WHERE invited_by IS NOT NULL`) === 1, 'sign-up through an invite is attributed')
r = await alice.get('/me')
ok(r.text.includes('Joined through your link: 1'), 'inviter sees the count')

// 11. passkey on a second device
const aliceTablet = new User('alice-tablet')
aliceTablet.jar = new Map([['vs_sid', alice.jar.get('vs_sid')]])
r = await aliceTablet.registerPasskey('add')
ok(r.data?.redirect === '/me?m=passkey' && count("SELECT COUNT(*) AS n FROM passkeys") >= 2, 'member adds a passkey on another device')

// 12. board + reports (localized)
r = await anon.get('/board/new')
ok(r.status === 302 && r.location?.startsWith('/login'), 'writing requires sign-in')
r = await alice.post('/board/new', { title: 'Cursor vs Copilot after a week', body: 'first line\nsecond line' })
ok(r.status === 303 && /^\/board\/[a-z0-9]{8}$/.test(r.location ?? ''), 'post created')
const postUrl = r.location
const postId = postUrl.split('/')[2]
r = await crowd[0].post(`${postUrl}/comments`, { body: 'useful, thanks' })
ok(r.location?.includes('m=posted'), 'comment added')
r = await crowd[0].get(postUrl)
const commentId = r.text.match(/\/comments\/([a-z0-9]{10})\/delete/)?.[1]
ok(r.text.includes('first line\nsecond line') && !!commentId, 'post shows line breaks; own comment deletable')
r = await crowd[0].post(`${postUrl}/comments/${commentId}/delete`, {})
ok(r.location?.includes('m=deleted'), 'own comment deleted')
r = await alice.post('/board/new', { title: 'x', body: '' })
ok(r.status === 400 && r.text.includes('Write a title of at least 2 characters.'), 'post validation (English)')
r = await alice.post('/ko/board/new', { title: 'x', body: '' })
ok(r.status === 400 && r.text.includes('제목을 2자 이상'), 'post validation (Korean)')
r = await crowd[1].post('/report', { type: 'post', id: postId, reason: 'rights', detail: 'short' })
ok(r.status === 400 && r.text.includes('at least 10 characters'), 'rights report needs an explanation')
r = await crowd[1].post('/report', { type: 'post', id: postId, reason: 'rights', detail: 'It names me and my workplace without consent' })
ok(r.text.includes('30-day temporary measure'), 'rights report -> temporary measure')
r = await anon.get(postUrl)
ok(r.text.includes('Under a temporary measure until') && !r.text.includes('first line'), 'hidden post shows only the notice')
for (const u of crowd.slice(0, 3)) await u.post('/report', { type: 'poll', id: pollId, reason: 'manipulation' })
r = await anon.get(pollUrl)
ok(r.text.includes('Under review: members reported this poll'), 'three manipulation reports -> review notice')

// 13. close the poll -> final result public; no more votes
sql(`UPDATE polls SET closes_at = 1000 WHERE id = '${pollId}'`)
r = await anon.get(pollUrl)
ok(r.text.includes('Final result') && r.text.includes('verified humans voted'), 'closed poll shows the final result to everyone')
ok(/<meta name="description" content="\d+ verified humans?, one vote each/.test(r.text), 'result summary in meta description')
r = await crowd[5].vote(pollId, ids[0])
ok(r.data?.redirect?.includes('m=closed') || r.data?.redirect?.includes('m=dup'), 'no voting after close')
r = await anon.get('/__scheduled?cron=*/5+*+*+*+*')
ok(r.status === 200 && sql(`SELECT status FROM polls WHERE id = '${pollId}'`)[0]?.status === 'closed', 'cron closes the poll')
r = await anon.get('/embed/v/' + pollId)
ok(r.text.includes('%</span>'), 'embed shows the final result after closing')
r = await anon.get(`/badge/${pollId}.svg?for=1`)
ok(r.status === 200 && /% · final/.test(r.text), 'badge shows the final split for one candidate')
r = await anon.get(`/badge/card/${pollId}.svg`)
ok(r.text.includes('FINAL') && /(wins|tie)/.test(r.text), 'gauge card shows the final result')
r = await anon.get(`/api/tally/${pollId}`)
ok(r.status === 200, 'live tally open to everyone after closing')

// 13b. rankings: closed polls only, polls under review left out, ranked from 30 votes / 3 rivals (operator 2026-11-02, was 300).
// The main poll above is under review (manipulation reports) -> excluded; the race poll is closed cleanly and ranked.
sql(`UPDATE polls SET closes_at = 1000, status = 'closed', review_note = NULL WHERE id = '${raceId}'`)
r = await anon.get('/dev/rank/run')
{
  const d = JSON.parse(r.text)
  ok(r.status === 200 && d.categories >= 1 && d.items >= 2 && d.ranked === 0, 'rankings computed from the closed poll (nothing over the threshold yet)')
}
ok(count("SELECT COUNT(*) AS n FROM rankings WHERE category = 'ai-assistants'") === 0, 'a poll under review is left out of the rankings')
ok(count("SELECT COUNT(*) AS n FROM rankings WHERE category = 'ai-agents' AND item_key = 'openai|operator' AND rank IS NULL AND votes = 10") === 1, 'product stored by its alias-aware key, unranked under 30 votes')
r = await anon.get('/rank')
ok(r.status === 200 && r.text.includes('Rankings') && r.text.includes('/rank/ai-agents') && r.text.includes('Collecting votes'), 'rankings hub lists the category as collecting votes')
ok(r.text.includes('class="rank-nav"') && r.text.includes('href="/rank/etc"') && !r.text.includes('Top 10 across all categories'), 'rankings hub: every category in the menu, no top 10 before anything is ranked')
r = await anon.get('/rank/ai-agents')
ok(r.status === 200 && r.text.includes('Not ranked yet') && r.text.includes('10 / 30 votes') && r.text.includes('How we rank'), 'category ranking shows the threshold queue and the method')
ok(r.text.includes('href="/rank/pet"') && /href="\/rank\/ai-agents" class="on" aria-current="page"/.test(r.text), 'category ranking has the all-category menu with the open one marked')
r = await anon.get('/ko/rank/ai-agents')
ok(r.status === 200 && r.text.includes('순위 집계 중'), 'ranking page in Korean')
r = await anon.get('/api/public/polls')
{
  const d = JSON.parse(r.text)
  const race = d.polls.find((x) => x.id === raceId)
  const openOne = d.polls.find((x) => x.open && x.votes > 0)
  ok(r.status === 200 && race && race.result && race.result.pct > 0 && race.badge.endsWith(`/badge/${raceId}.svg`) && (!openOne || openOne.result === null) && d.rankings.some((x) => x.category === 'ai-agents'), 'public poll list: closed results only, badges, ranking categories')
}
r = await anon.get('/rank/not-a-category')
ok(r.status === 404, 'unknown ranking category is 404')

// 14. search engines
r = await anon.get('/sitemap.xml')
ok(r.text.includes('/rank/ai-agents') && r.text.includes(`/v/${pollId}/`) && r.text.includes(`/ko/v/${pollId}/`) && r.text.includes(`/ja/v/${pollId}/`) && r.text.includes(`/hi/v/${pollId}/`), 'sitemap lists every language')
r = await anon.get('/robots.txt')
ok(r.text.includes('Disallow: /ko/me') && r.text.includes('Disallow: /api/'), 'robots.txt')
r = await anon.get('/search?q=Claude')
ok(r.text.includes('OpenAI ChatGPT vs Anthropic Claude'), 'search')

// 15. metrics snapshot + ledger export
const members = count('SELECT COUNT(*) AS n FROM members')
r = await anon.post(`/dev/metrics/run?day=${KST_TODAY}`, {})
const m = r.data ?? {}
ok(r.status === 200 && m.day === KST_TODAY && m.signups_new === members, 'metrics snapshot: sign-ups')
ok(m.votes_new === count('SELECT COUNT(*) AS n FROM votes') && m.polls_new === 4, 'snapshot: votes, member polls')
ok(m.idv_checks === count("SELECT COUNT(*) AS n FROM otp_log WHERE outcome = 'sent'") && m.idv_cost_krw === m.idv_checks * 20, 'snapshot: verification codes sent and their cost estimate (IDV_UNIT_KRW 20, Google SMS)')
ok(m.refusals_new === count('SELECT COUNT(*) AS n FROM vote_refusals') && m.refusals_new >= 4, 'snapshot: attempts blocked at the door')
ok(m.maker_votes_new === 1 && m.invited_signups_new === 1 && m.shares_new === 1 && m.embed_loads_new >= 1, 'snapshot: viral counters')
const out = join(mkdtempSync(join(tmpdir(), 'pollreal-ledger-')), 'metrics_daily.csv')
execSync(`node scripts/metrics-export.mjs --local --ignite-start ${KST_TODAY} --out "${out}"`, { stdio: 'pipe' })
const ledger = readFileSync(out, 'utf8').trim().split('\n')
ok(
  ledger[0] ===
    'date,stage,signups_total,signups_new,votes_new,polls_new,weekly_return_rate,search_clicks_google,search_clicks_naver,promo_spend_krw,llm_cost_usd,idv_cost_krw,shares_new,embed_loads_new,invited_signups_new,maker_votes_new,refusals_new,notes',
  'ledger export keeps the header',
)
ok(ledger.length === 2 && ledger[1].startsWith(`${KST_TODAY},ignite,${members},${members},`), 'ledger row = ignition day 1')
let refused = false
try {
  execSync(`node scripts/metrics-export.mjs --local --ignite-start ${KST_TODAY} --out "g:/AI Surge/Versus/OPS/x.csv"`, { stdio: 'pipe' })
} catch {
  refused = true
}
ok(refused, 'local data can never be written under ops/')

// 16. withdrawal: votes stay anonymous, number blocked 30 days, passkeys gone
r = await alice.post('/me/withdraw', { confirm: 'yes' })
ok(r.status === 200 && r.text.includes('You have left'), 'withdrawal')
ok(count("SELECT COUNT(*) AS n FROM passkeys p JOIN members m ON m.id = p.member_id WHERE m.status = 'withdrawn'") === 0, 'withdrawn member has no passkeys')
r = await new User('alice-again').signup('010-1234-0001')
ok(r.status === 409 && r.text.includes('30 days'), 'the same number cannot rejoin for 30 days')
ok(count("SELECT COUNT(*) AS n FROM members WHERE status = 'withdrawn' AND (birth_year IS NOT NULL OR gender IS NOT NULL OR invite_code IS NOT NULL)") === 0, 'withdrawn profile erased')
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${pollId}' AND member_id IS NULL`) === 1, 'withdrawn vote kept without a member link')

// 17. device values are erased after 30 days
sql(`UPDATE votes SET created_at = 1000 WHERE poll_id = '${poll2Id}'`)
await anon.get('/__scheduled?cron=*/5+*+*+*+*')
ok(count(`SELECT COUNT(*) AS n FROM votes WHERE poll_id = '${poll2Id}' AND (fp_hash IS NOT NULL OR dt_hash IS NOT NULL OR net_hash IS NOT NULL)`) === 0, 'old device values erased by the cron')

console.log(failures ? `SMOKE: FAIL (${failures} of ${passes + failures})` : `SMOKE: PASS (${passes})`)
process.exit(failures ? 1 : 0)
