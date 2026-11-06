import { type Context, Hono } from 'hono'
import { getCookie, setCookie } from 'hono/cookie'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import type { Child } from 'hono/jsx'
import { secureHeaders } from 'hono/secure-headers'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { APP_CSS, APP_JS, CSS_VERSION } from './assets'
import { BOARD_PAGE_SIZE, BRAND, CATEGORIES, DAILY_COMMENT_LIMIT, DAILY_POLL_LIMIT, DAILY_POST_LIMIT, INTERIM_PUBLIC, NAVER_SITE_VERIFICATION_FILE, OLDEST_BIRTH_YEAR, applyPrivateLimits, isCategory, isReportReason } from './config'
import { type AppEnv, type Bindings, isDev, pepperOf } from './env'
import { LANGS, type Lang, type Msg, href, isLang, langOfPath, msgText, stripLang, tr } from './i18n'
import { LEGAL_KEYS } from './legal/en'
import { ageBand } from './lib/age'
import { tally } from './lib/aggregate'
import { isNewMember, purgeDeviceHashes, scanAnomalies } from './lib/anomaly'
import * as auth from './lib/auth'
import * as board from './lib/board'
import * as cards from './lib/cards'
import { hmacHex, safeEqual } from './lib/crypto'
import * as db from './lib/db'
import { blockedNetwork, cleanSignals, clientIp, cookieDeviceToken, deviceValues, ensureDeviceToken, networkInfo, readDeviceToken, refusalWho, restoreDeviceCookie } from './lib/device'
import { computeDay, isDay, kstDay, saveDay, snapshotDays } from './lib/metrics'
import { badgeMessage, badgeSvg, cardSvg, hoursLeft, segments, splitVisible } from './lib/gauge'
import { OG_DESIGN, renderOg } from './lib/og'
import * as alert from './lib/alert'
import * as icons from './lib/icons'
import { inAppOf } from './lib/inapp'
import * as ranking from './lib/ranking'
import * as passkey from './lib/passkey'
import * as phone from './lib/phone'
import { candidateName, clean, pollTitle } from './lib/text'
import { isOpen, isoDate, kstYear, remainingParts } from './lib/time'
import { type BotAction, botKeys, probeSecret, verifyBot } from './lib/turnstile'
import { type PollForm, cleanBody, validateComment, validatePollForm, validatePost } from './lib/validate'
import * as viral from './lib/viral'
import { ClaimPage, CodePage, LoginPage, MePage, PasskeyPage, ProfilePage } from './views/account'
import { BoardPage, NewPostPage, PostPage } from './views/board'
import { EmbedPage } from './views/embed'
import { RankCategoryPage, RankHubPage } from './views/ranking'
import { Layout, type LayoutProps } from './views/layout'
import { DocPage, HomePage, ListPage, MessagePage, NewPollPage, PollPage, ReportPage, catLabel, pollPath } from './views/pages'

type Ctx = Context<AppEnv>

const app = new Hono<AppEnv>()

// Maker claims are off in production (operator 2026-11-04); the routes answer 404 and no page links to them.
const makerClaimsOn = (env: Bindings) => env.MAKER_CLAIMS === '1'

// ---- www.pollreal.com → pollreal.com: one origin only (passkeys are bound to pollreal.com) ----
// http:// → https:// as well (2026-11-04): a bare "pollreal.com" pasted in KakaoTalk opens over http, where the secure
// sign-up cookies are never stored — the code page then found no flow and sent the visitor back to the start. Passkeys
// also need https. 308 keeps the method, so a form posted over http is not lost.
app.use('*', async (c, next) => {
  applyPrivateLimits(c.env.PRIVATE_LIMITS)
  const url = new URL(c.req.url)
  const insecure = url.protocol === 'http:' && !isDev(c.env)
  if (url.hostname === 'www.pollreal.com' || (insecure && url.hostname === 'pollreal.com'))
    return c.redirect(`https://pollreal.com${url.pathname}${url.search}`, c.req.method === 'GET' || c.req.method === 'HEAD' ? 301 : 308)
  return next()
})

// ---- headers: the embed widget and the result image are meant to be used by other sites; everything else is not ----
const secure = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    // own page script + bot-check widget + Google reCAPTCHA on the phone step (Firebase phone auth)
    scriptSrc: ["'self'", 'https://challenges.cloudflare.com', 'https://www.google.com', 'https://www.gstatic.com'],
    frameSrc: ['https://challenges.cloudflare.com', 'https://www.google.com', 'https://recaptcha.google.com'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
  },
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
})
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/embed/') || path.startsWith('/og/')) return next()
  return secure(c, next)
})
app.use('*', csrf())
// ---- Naver Search Advisor ownership file — answered before the pre-launch gate so Naver can verify while locked ----
app.use('*', async (c, next) => {
  const file = NAVER_SITE_VERIFICATION_FILE
  if (file && new URL(c.req.url).pathname === `/${file}`) {
    return c.text(`naver-site-verification: ${file}`, 200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
  }
  return next()
})
// ---- operator probe: are the production keys still accepted by their vendors? ----
// Header x-ops-key must equal the OPS_KEY secret; otherwise 404 like any unknown path. One cheap real call per
// external key (Anthropic models list, Turnstile siteverify with a dummy token, Google Identity Platform reCAPTCHA
// setup). Returns statuses only — never a value. Used after key rotations (scripts/launch-check.mjs --keys).
app.get('/ops/key-check', async (c) => {
  const given = (c.req.header('x-ops-key') ?? '').trim()
  const want = (c.env.OPS_KEY ?? '').trim() // a secret put from a pipe may carry a trailing newline
  if (!want || !given || !safeEqual(given, want)) return c.text('Not found', 404)
  const anthropic = async () => {
    if (!c.env.ANTHROPIC_API_KEY) return 'missing'
    try {
      const r = await fetch('https://api.anthropic.com/v1/models?limit=1', {
        headers: { 'x-api-key': c.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(8000),
      })
      return r.status === 200 ? 'ok (200)' : `REJECTED (${r.status})`
    } catch (e) {
      return `unavailable (${String(e).slice(0, 60)})`
    }
  }
  // ?alert=1 also sends the operator one test mail (at most once per day — the alerts table dedupes).
  const alertTest = c.req.query('alert') === '1' ? await alert.sendTest(c.env, Date.now()) : 'skipped'
  return c.json({
    checked_at: new Date().toISOString(),
    anthropic: await anthropic(),
    alert_mail: alertTest,
    turnstile: await probeSecret(c.env),
    sms: await phone.firebaseCheck(c.env),
    resend: c.env.RESEND_API_KEY ? 'set (not probed)' : 'not set (maker claims off)',
    hmac_pepper: c.env.HMAC_PEPPER ? 'set' : 'missing',
    private_limits: c.env.PRIVATE_LIMITS ? 'set' : 'missing',
    operator: c.env.OPERATOR ? 'set' : 'missing',
    alert_to: c.env.ALERT_TO ? 'set' : 'missing',
  })
})

// ---- pre-launch gate (house rule: nothing is public before the launch gates pass) ----
// PRELAUNCH = "1" (wrangler.toml var) → every page answers a noindex holding page, robots.txt disallows everything, the
// image/embed/API routes answer 503 — unless the visitor holds the preview cookie, set by /preview/<PREVIEW_KEY>.
const PREVIEW_COOKIE = 'vs_preview'
const previewToken = async (env: Bindings) => (env.PREVIEW_KEY ? (await hmacHex(env.PREVIEW_KEY, 'preview-cookie')).slice(0, 40) : '')
app.use('*', async (c, next) => {
  if (c.env.PRELAUNCH !== '1') return next()
  const path = new URL(c.req.url).pathname
  if (path.startsWith('/preview/')) {
    const key = path.slice('/preview/'.length)
    if (!c.env.PREVIEW_KEY || !safeEqual(key, c.env.PREVIEW_KEY)) return c.text('Not found', 404)
    setCookie(c, PREVIEW_COOKIE, await previewToken(c.env), { path: '/', httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 30 * 86400 })
    return c.redirect('/', 302)
  }
  const cookie = getCookie(c, PREVIEW_COOKIE)
  if (cookie && c.env.PREVIEW_KEY && safeEqual(cookie, await previewToken(c.env))) {
    if (path === '/preview-alert-test') return c.json({ alert: await alert.sendTest(c.env, Date.now()) })
    // Launch-checklist probe for preview holders only: are the production keys accepted? Values are never returned.
    if (path === '/preview-check') {
      const turnstile = await probeSecret(c.env) // the exact call the sign-up form makes
      return c.json({
        turnstile,
        sms: await phone.firebaseCheck(c.env),
        anthropic_key: c.env.ANTHROPIC_API_KEY ? 'set' : 'missing',
        hmac_pepper: c.env.HMAC_PEPPER ? 'set' : 'missing',
        resend: c.env.RESEND_API_KEY ? 'set' : 'missing (maker e-mail off)',
        browser: c.env.BROWSER ? 'bound' : 'missing (card deep pass off)',
        site_url: c.env.SITE_URL ?? null,
      })
    }
    await next()
    c.header('X-Robots-Tag', 'noindex, nofollow')
    return
  }
  if (path === '/robots.txt') {
    const naver = NAVER_SITE_VERIFICATION_FILE ? `User-agent: Yeti\nAllow: /${NAVER_SITE_VERIFICATION_FILE}\nDisallow: /\n\n` : ''
    return c.text(`${naver}User-agent: *\nDisallow: /\n`, 200, { 'Cache-Control': 'no-store' })
  }
  if (path.startsWith('/assets/') || path === '/favicon.ico') return next()
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('Cache-Control', 'no-store')
  if (path.startsWith('/api/') || path.startsWith('/og/') || path.startsWith('/embed/') || path.startsWith('/badge/')) return c.text('Not open yet', 503)
  return c.html(
    `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${BRAND}</title><link rel="stylesheet" href="/assets/app.css?v=${CSS_VERSION}"></head><body><main><section class="hero"><h1>${BRAND}</h1><p>Which is actually better? Ask real people. — Opening soon.</p></section></main></body></html>`,
    503,
  )
})

// Development only: "x-dev-offline: 1" makes the request act as if no paid service were connected (code shown on screen,
// no SMS, no maker email, no AI cards). The smoke test sends it on every request so it never spends
// money once real keys are in .dev.vars; a person using the local site normally gets the real services.
app.use('*', async (c, next) => {
  if (isDev(c.env) && c.req.header('x-dev-offline') === '1')
    c.env = { ...c.env, FIREBASE_API_KEY: undefined, RESEND_API_KEY: undefined, ANTHROPIC_API_KEY: undefined }
  await next()
})
app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname
  c.set('lang', langOfPath(path))
  const isStatic = path.startsWith('/assets/') || path.startsWith('/icon/') || path.startsWith('/og/') || path.startsWith('/embed/') || path.startsWith('/badge/') || path === '/robots.txt' || path === '/sitemap.xml'
  c.set('member', isStatic ? null : await auth.loadMember(c, Date.now()))
  await next()
})
// Development-only helpers (fail closed everywhere else).
app.use('/dev/*', async (c, next) => (isDev(c.env) ? next() : c.notFound()))


const origin = (c: Ctx) => (c.env.SITE_URL ?? new URL(c.req.url).origin).replace(/\/$/, '')

// "3h 12m left" in the viewer's language ('' once closed).
function leftText(lang: Lang, closesAt: number, now: number) {
  const r = remainingParts(closesAt, now)
  return r ? tr(lang).remaining(r.h, r.m) : ''
}

// README badge snippets for the share box: the whole poll, each candidate (a maker's badge) and the gauge card.
function badgeCodes(c: Ctx, pollId: string, title: string, names: string[]) {
  const o = origin(c)
  const link = `${o}/v/${pollId}?via=embed`
  const alt = `${BRAND}: ${title}`.replace(/[[\]]/g, '')
  const t = T(c)
  return [
    { label: t.badgeAll, code: `[![${alt}](${o}/badge/${pollId}.svg)](${link})` },
    ...names.map((name, i) => ({ label: name, code: `[![${alt}](${o}/badge/${pollId}.svg?for=${i + 1})](${link})` })),
    { label: t.badgeCard, code: `[![${alt}](${o}/badge/card/${pollId}.svg)](${link})` },
  ]
}
const rpOf = (c: Ctx): passkey.Rp => {
  const o = origin(c)
  return { id: new URL(o).hostname, origin: o }
}
const L = (c: Ctx) => c.get('lang')
const T = (c: Ctx) => tr(L(c))
const H = (c: Ctx, path: string) => href(L(c), path)
const toLogin = (c: Ctx, next: string) => href(L(c), `/login?next=${encodeURIComponent(next)}`)

async function page(c: Ctx, props: Omit<LayoutProps, 'member' | 'dev' | 'lang' | 'origin' | 'path' | 'unread'>, body: Child, status: ContentfulStatusCode = 200) {
  const member = c.get('member') ?? null
  // One indexed count per page for a signed-in member: the "(n)" next to "My page" (operator notices, community rules §7).
  const unread = member ? await db.unreadNotices(c.env.DB, member.id) : 0
  const path = stripLang(new URL(c.req.url).pathname)
  const inApp = inAppOf(c.req.header('user-agent'), c.req.url)
  const autoExternal = /^\/(login|join|auth)(\/|$)/.test(path)
  return c.html(
    <Layout {...props} member={member} unread={unread} dev={isDev(c.env)} lang={L(c)} origin={origin(c)} path={path} inApp={inApp} autoExternal={autoExternal}>
      {body}
    </Layout>,
    status,
  )
}

// Work that may outlive the response (AI card generation, counters). Errors are logged, never shown to the visitor.
function background(c: Ctx, task: () => Promise<unknown>) {
  const run = task().catch((e) => console.error('background task failed', e))
  try {
    c.executionCtx.waitUntil(run)
  } catch {
    // no execution context (unit tests) — the promise still runs
  }
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// Bot check (step 7) on the phone step and poll creation.
const botSiteKey = (c: Ctx) => botKeys(c.env)?.siteKey ?? null
const checkBot = (c: Ctx, form: Record<string, unknown>, action: BotAction) => verifyBot(c.env, form, { action, ip: clientIp(c) || null, host: new URL(origin(c)).hostname })
const botStatus = (reason: string): ContentfulStatusCode => (reason === 'unavailable' || reason === 'not_configured' ? 503 : 400)

// JSON endpoints: same-origin only (the CSRF middleware covers form posts).
const sameOrigin = (c: Ctx) => c.req.header('origin') === new URL(c.req.url).origin
async function jsonBody(c: Ctx): Promise<Record<string, unknown> | null> {
  if (!sameOrigin(c)) return null
  try {
    const b = await c.req.json()
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null
  } catch {
    return null
  }
}
const langOf = (b: Record<string, unknown>): Lang => (isLang(b.lang as string) ? (b.lang as Lang) : 'en')
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')

app.get('/assets/app.css', (c) => c.body(APP_CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }))
app.get('/assets/app.js', (c) => c.body(APP_JS, 200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }))

// =====================================================================================================================
// Localized pages: the same routes under "/" (English) and "/ko", "/es", "/fr", "/hi", "/de", "/ja", "/zh", "/ru".
// =====================================================================================================================
const site = new Hono<AppEnv>()

site.get('/', async (c) => {
  const now = Date.now()
  const [open, closed, posts] = await Promise.all([db.listOpen(c.env.DB, now, 20), db.listClosed(c.env.DB, now, 20), board.latestPosts(c.env.DB, 5)])
  return page(c, { title: BRAND, description: T(c).homeDescription, canonicalPath: '/', wide: true }, <HomePage lang={L(c)} open={open} closed={closed} posts={posts} now={now} />)
})

site.get('/c/:cat', async (c) => {
  const cat = c.req.param('cat')
  if (!isCategory(cat)) return c.notFound()
  const now = Date.now()
  const [open, closed] = await Promise.all([db.listOpen(c.env.DB, now, 50, cat), db.listClosed(c.env.DB, now, 50, cat)])
  const label = catLabel(L(c), cat)
  return page(
    c,
    { title: T(c).categoryTitle(label), description: T(c).categoryDescription(label), canonicalPath: `/c/${cat}`, wide: true },
    <ListPage lang={L(c)} heading={T(c).categoryTitle(label)} open={open} closed={closed} now={now} />,
  )
})

site.get('/search', async (c) => {
  const q = clean(c.req.query('q')).slice(0, 60)
  const now = Date.now()
  const found = q ? await db.searchPolls(c.env.DB, q, 50) : []
  return page(
    c,
    { title: q ? T(c).searchTitle(q) : T(c).search, noindex: true, wide: true },
    <ListPage lang={L(c)} heading={q ? T(c).searchHeading(q) : T(c).search} open={found.filter((p) => isOpen(p, now))} closed={found.filter((p) => !isOpen(p, now))} now={now} q={q} />,
  )
})

// ---- poll ----

site.get('/v/:id/:slug?', async (c) => {
  const lang = L(c)
  const t = T(c)
  const poll = await db.getPoll(c.env.DB, c.req.param('id'))
  if (!poll || poll.status === 'hidden') return c.notFound()
  const path = pollPath(poll, lang)
  const now = Date.now()
  // Arrivals from share buttons and embeds: remember the channel for 24 hours, count it, continue on the clean URL.
  const via = c.req.query('via')
  if (via === 'share' || via === 'embed') {
    await viral.markSource(c, via, { pollId: poll.id })
    background(c, () => viral.bump(c.env.DB, poll.id, via === 'share' ? 'arrive_share' : 'arrive_embed', now))
    return c.redirect(path, 302)
  }
  const slug = c.req.param('slug')
  if (!slug || safeDecode(slug) !== poll.slug) return c.redirect(path, 301)

  const open = isOpen(poll, now)
  const member = c.get('member')
  const candidates = await db.getCandidates(c.env.DB, poll.id)
  const cardMap = await db.getCards(c.env.DB, candidates.flatMap((x) => (x.card_id ? [x.card_id] : [])))
  const live = cards.cardsEnabled(c.env)
  const waiting = live && [...cardMap.values()].some(cards.isGenerating)
  const blocked = [...cardMap.values()].some((x) => /^(auth_|bad_request)/.test(x.last_error ?? ''))
  if (waiting) background(c, async () => cards.generateCards(c.env, await cards.pendingIdsForPoll(c.env.DB, poll.id, now), now))
  const choice = member ? await db.myChoice(c.env.DB, poll.id, member.id) : null
  const canVote = open && !!member && !choice
  // Interim results only for members who already voted; everyone sees the final result.
  const tl = splitVisible(open, !!choice) ? tally(candidates.map((x) => x.id), await db.voteCells(c.env.DB, poll.id)) : null
  const comp = tl ? await db.composition(c.env.DB, poll.id) : null
  // No self-reload while a member could be voting (it would reset the page under their thumb); they get a link instead.
  const autoRefresh = waiting && !blocked && !canVote
  const title = pollTitle(candidates)
  const names = new Map(candidates.map((x) => [x.id, candidateName(x)]))
  const dt = canVote ? (await ensureDeviceToken(c)).value : null
  const claims = member ? (await viral.claimsOf(c.env.DB, member.id)).filter((x) => x.status === 'verified') : []
  const cardIds = new Set(candidates.map((x) => x.card_id))
  const campaigns = claims.filter((x) => cardIds.has(x.card_id)).map((x) => ({ maker: `${x.maker} ${x.product}`, url: `${origin(c)}/m/${x.code}/${poll.id}` }))
  const claimable = !makerClaimsOn(c.env) ? new Set<string>() : new Set([...cardMap.values()].filter((k) => k.status === 'ready' && k.official_source && viral.officialDomain(k.official_url)).map((k) => k.id))
  const iconMap = await icons.iconsForCards(c.env.DB, candidates.map((x) => x.card_id))
  const embedSrc = `${origin(c)}/embed/v/${poll.id}${lang === 'en' ? '' : `?lang=${lang}`}`
  const n = tl?.n ?? (await db.voteCount(c.env.DB, poll.id))
  const description =
    !open && tl && tl.n ? t.pollDescriptionClosed(tl.n, tl.overall.map((s) => `${names.get(s.candidateId)} ${s.pct}%`).join(', ')) : t.pollDescriptionOpen(title)
  return page(
    c,
    {
      title: `${title} — ${t.pollTitleSuffix}`,
      description,
      canonicalPath: stripLang(path),
      refresh: autoRefresh ? 15 : undefined,
      ogImage: `${origin(c)}/og/v/${poll.id}.png?lang=${lang}&n=${n}&s=${open ? 'o' : 'c'}`,
    },
    <PollPage
      lang={lang}
      poll={poll}
      candidates={candidates}
      cards={cardMap}
      tally={tl}
      comp={comp}
      open={open}
      now={now}
      member={member}
      myChoice={choice}
      path={path}
      flash={t.flash[c.req.query('m') ?? '']}
      cardsLive={live && !blocked}
      autoRefresh={autoRefresh}
      deviceToken={dt}
      share={{
        url: `${origin(c)}${path}?via=share`,
        embedCode: `<iframe src="${embedSrc}" width="560" height="320" style="border:0;max-width:100%" loading="lazy" title="${BRAND}: ${title.replace(/"/g, '&quot;')}"></iframe>`,
        text: t.shareText(title),
        badges: badgeCodes(c, poll.id, title, candidates.map(candidateName)),
        side: { url: `${origin(c)}${path}?via=share`, title, left: leftText(lang, poll.closes_at, now) },
      }}
      campaigns={campaigns}
      claimable={claimable}
      icons={iconMap}
    />,
  )
})

// ---- rankings ----

site.get('/rank', async (c) => {
  const [meta, rows] = await Promise.all([ranking.rankingMeta(c.env.DB), c.env.DB.prepare('SELECT * FROM rankings ORDER BY category, rank IS NULL, rank, score DESC').all<ranking.RankRow & { shared: number }>()])
  const iconMap = await icons.iconsForCards(c.env.DB, rows.results.map((r) => (r as { card_id: string | null }).card_id))
  return page(c, { title: T(c).rankTitle, description: T(c).rankDescription, canonicalPath: '/rank', wide: true }, <RankHubPage lang={L(c)} meta={meta.results} rows={rows.results} icons={iconMap} />)
})

site.get('/rank/:cat', async (c) => {
  const cat = c.req.param('cat')
  if (!isCategory(cat)) return c.notFound()
  const [rows, meta] = await Promise.all([ranking.rankingsOf(c.env.DB, cat), c.env.DB.prepare('SELECT * FROM ranking_meta WHERE category = ?1').bind(cat).first<ranking.RankMeta>()])
  const iconMap = await icons.iconsForCards(c.env.DB, rows.results.map((r) => (r as { card_id: string | null }).card_id))
  const label = catLabel(L(c), cat)
  return page(
    c,
    { title: T(c).rankCatTitle(label), description: T(c).rankCatDescription(label), canonicalPath: `/rank/${cat}`, wide: true, noindex: !meta },
    <RankCategoryPage lang={L(c)} category={cat} meta={meta} rows={rows.results} icons={iconMap} />,
  )
})

// ---- create ----

site.get('/new', async (c) => {
  if (!c.get('member')) return c.redirect(toLogin(c, H(c, '/new')))
  return page(c, { title: T(c).createTitle, noindex: true, botScript: true }, <NewPollPage lang={L(c)} botSiteKey={botSiteKey(c)} />)
})

site.post('/new', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(toLogin(c, H(c, '/new')), 303)
  const now = Date.now()
  const body = await c.req.parseBody()
  const v = validatePollForm(body)
  const again = (form: PollForm, errors: Msg[], status: ContentfulStatusCode) =>
    page(c, { title: T(c).createTitle, noindex: true, botScript: true }, <NewPollPage lang={L(c)} form={form} errors={errors} botSiteKey={botSiteKey(c)} />, status)
  if (!v.ok) return again(v.form, v.errors, 400)
  const form = { category: v.value.category, question: v.value.question ?? '', rows: v.value.candidates }
  const bot = await checkBot(c, body, 'new_poll')
  if (!bot.ok) return again(form, [{ k: `bot.${bot.reason}` }], botStatus(bot.reason))
  if ((await db.countPollsSince(c.env.DB, member.id, now - 24 * 60 * 60 * 1000)) >= DAILY_POLL_LIMIT) {
    return again(form, [{ k: 'dailyLimit', p: [DAILY_POLL_LIMIT] }], 429)
  }
  const created = await db.createPoll(c.env.DB, member.id, v.value, now, L(c))
  if (cards.cardsEnabled(c.env)) background(c, async () => cards.generateCards(c.env, await cards.pendingIdsForPoll(c.env.DB, created.id, now), now))
  return c.redirect(pollPath(created, L(c)), 303)
})

// ---- sign-in / sign-up (design v0.2 §2) ----

const defaultCountry = (c: Ctx) => {
  const cf = networkInfo(c).country
  if (cf && /^[A-Z]{2}$/.test(cf) && cf !== 'T1' && cf !== 'XX') return cf
  return L(c) === 'ko' ? 'KR' : 'US'
}

async function loginPage(c: Ctx, o: { next: string; country?: string; phone?: string; error?: Msg | null }, status: ContentfulStatusCode = 200) {
  const country = o.country || defaultCountry(c)
  const recaptcha = await phone.recaptchaSetup(c.env)
  return page(
    c,
    { title: T(c).loginTitle, noindex: true, botScript: true, recaptcha },
    <LoginPage
      lang={L(c)}
      next={o.next}
      countries={phone.countryOptions(L(c), country)}
      country={country}
      phone={o.phone}
      error={o.error}
      botSiteKey={botSiteKey(c)}
      recaptchaSiteKey={recaptcha?.siteKey ?? null}
      recaptchaMode={recaptcha?.mode ?? null}
    />,
    status,
  )
}

site.get('/login', async (c) => {
  const next = auth.safeNext(c.req.query('next') ?? H(c, '/'))
  if (c.get('member')) return c.redirect(next)
  return loginPage(c, { next })
})

// After a refused send the address bar shows /auth/phone; a refresh or a language switch there must not end on 404.
site.get('/auth/phone', (c) => c.redirect(H(c, '/login'), 302))

site.post('/auth/phone', async (c) => {
  const now = Date.now()
  const body = await c.req.parseBody()
  const next = auth.safeNext(body.next)
  const country = str(body.country, 2).toUpperCase()
  const raw = str(body.phone, 30)
  const fail = (k: string, status: ContentfulStatusCode = 400) => loginPage(c, { next, country, phone: raw, error: { k } }, status)
  const bot = await checkBot(c, body, 'phone')
  if (!bot.ok) {
    // A double tap: the first request already sent the code and opened the flow, so hand that flow to this browser.
    // Finishing needs the code from the SMS, so this gives nothing to someone who only knows the number.
    const p = bot.reason === 'spent' ? phone.parsePhone(country, raw) : null
    const resumed = p && typeof p === 'object' ? await auth.recentFlowFor(c, await phone.phoneHash(pepperOf(c.env), p.e164), now) : null
    if (resumed) {
      await auth.setFlowCookie(c, resumed)
      return c.redirect(H(c, '/auth/code'), 303)
    }
    return fail(`bot.${bot.reason}`, botStatus(bot.reason))
  }
  if (!phone.senderOf(c.env)) return fail('e.smsOff', 503)
  const parsed = phone.parsePhone(country, raw)
  if (parsed === 'invalid') return fail('e.phoneInvalid')
  const pepper = pepperOf(c.env)
  const ipH = await auth.otpIpHash(c, clientIp(c))
  if (parsed === 'type') {
    await phone.logOtp(c.env.DB, `type:${country}`, ipH, country, 'blocked_type', now)
    return fail('e.phoneType')
  }
  const phoneH = await phone.phoneHash(pepper, parsed.e164)
  const net = networkInfo(c)
  const key = phone.sendKey(parsed.country, net.asn)
  if (blockedNetwork(net)) {
    await phone.logOtp(c.env.DB, phoneH, ipH, key, 'blocked_network', now)
    return fail('e.network', 403)
  }
  // The send is reserved atomically against every limit before anything paid happens.
  const slot = await phone.reserveSend(c.env.DB, { phoneH, ipH, country: key, now })
  if ('hit' in slot) {
    await phone.logOtp(c.env.DB, phoneH, ipH, key, 'blocked_limit', now)
    if (slot.hit === 'limitSite') background(c, () => alert.otpCapReached(c.env, key, now))
    return fail(`e.${slot.hit}`, 429)
  }
  const setOutcome = (outcome: string) => c.env.DB.prepare('UPDATE otp_log SET outcome = ?2 WHERE id = ?1').bind(slot.id, outcome).run()
  const flowId = auth.newFlowId()
  const invitedBy = await auth.inviterFromCookie(c)
  // Sending and recording the flow run to the end even if the browser drops this request: a double tap cancels the
  // first request after its SMS went out, and the repeat can only pick up a flow that exists (2026-11-02).
  const work = (async () => {
    const sent = await phone.sendCode(c.env, pepper, flowId, parsed.e164, L(c), str(body.recaptcha, 4000), str(body.rcmode, 2) === 'e' ? 'enterprise' : 'v2')
    if (!sent.ok) {
      await setOutcome('send_failed') // otp_log's CHECK has no captcha outcome; the reason is in the worker log
      return sent
    }
    await auth.createFlow(
      c,
      { id: flowId, e164: parsed.e164, phoneHash: phoneH, country: parsed.country, hint: parsed.hint, codeHash: sent.codeHash, session: sent.session ?? null, lang: L(c), next, invitedBy },
      now,
    )
    return sent
  })()
  background(c, () => work)
  const sent = await work
  if (!sent.ok) return sent.captcha ? fail('bot.rejected', 403) : fail('e.sendFailed', 502)
  // Development shows the code on the next page (nothing is sent).
  return c.redirect(H(c, `/auth/code${sent.devCode && isDev(c.env) ? `?dev=${sent.devCode}` : ''}`), 303)
})

function codePage(c: Ctx, flow: auth.FlowRow, error?: Msg | null, status: ContentfulStatusCode = 200) {
  const dev = isDev(c.env) ? (c.req.query('dev') ?? null) : null
  return page(c, { title: T(c).codeTitle, noindex: true }, <CodePage lang={L(c)} hint={flow.phone_hint} devCode={dev} error={error} />, status)
}

site.get('/auth/code', async (c) => {
  const flow = await auth.currentFlow(c, Date.now())
  if (!flow || flow.verified_at) return c.redirect(H(c, '/login'))
  return codePage(c, flow)
})

site.post('/auth/code', async (c) => {
  const now = Date.now()
  const flow = await auth.currentFlow(c, now)
  if (!flow || flow.verified_at) return loginPage(c, { next: H(c, '/'), error: { k: 'e.expired' } }, 400)
  const body = await c.req.parseBody()
  const code = str(body.code, 10).replace(/\D/g, '')
  const used = await auth.spendAttempt(c, flow)
  if (used === null) return loginPage(c, { next: flow.next, error: { k: 'e.codeTooMany' } }, 400)
  // The check and its record run to the end even if the browser drops the request: Google spends the code on the
  // first check, so a lost first request plus a repeat submit would otherwise read as a wrong code (2026-11-02).
  const check = (async () => {
    if (!(await phone.codeMatches(c.env, pepperOf(c.env), flow, code))) return false
    await auth.markVerified(c, flow.id, now)
    return true
  })()
  background(c, () => check)
  let ok = await check
  // A repeat submit of a code another request is already checking: wait for that request's result.
  for (let i = 0; !ok && flow.provider_session && i < 4; i++) {
    await new Promise((r) => setTimeout(r, 750))
    ok = !!(await auth.currentFlow(c, Date.now()))?.verified_at
  }
  if (!ok) {
    const r = await auth.wrongCode(c, flow, used)
    if (r === 'codeTooMany') return loginPage(c, { next: flow.next, error: { k: 'e.codeTooMany' } }, 400)
    return codePage(c, flow, { k: 'e.codeWrong' }, 400)
  }
  const existing = await db.memberByPhone(c.env.DB, flow.phone_hash)
  if (existing) {
    await auth.endFlow(c, flow.id)
    if (existing.status === 'withdrawn') return loginPage(c, { next: flow.next, error: { k: 'e.withdrawn' } }, 409)
    if (!auth.memberActive(existing, now)) return loginPage(c, { next: flow.next, error: auth.restrictionMsg(existing, L(c)) }, 403)
    await auth.startSession(c, existing.id, now)
    return c.redirect(auth.safeNext(flow.next), 303)
  }
  return c.redirect(H(c, '/join/profile'), 303)
})

const birthYears = (now: number) => {
  const top = new Date(now).getUTCFullYear() - 13
  return Array.from({ length: top - OLDEST_BIRTH_YEAR + 1 }, (_, i) => top - i)
}

site.get('/join/profile', async (c) => {
  const now = Date.now()
  const flow = await auth.currentFlow(c, now)
  if (!flow?.verified_at) return c.redirect(H(c, '/login'))
  return page(c, { title: T(c).profileTitle, noindex: true }, <ProfilePage lang={L(c)} years={birthYears(now)} birthYear={flow.birth_year} gender={flow.gender} />)
})

site.post('/join/profile', async (c) => {
  const now = Date.now()
  const flow = await auth.currentFlow(c, now)
  if (!flow?.verified_at) return c.redirect(H(c, '/login'), 303)
  const body = await c.req.parseBody()
  const birthYear = Number.parseInt(str(body.birth_year, 4), 10)
  const gender = str(body.gender, 1)
  const error = auth.profileError(flow.phone_country, birthYear, gender, body.agree === 'yes', now)
  if (error) {
    return page(
      c,
      { title: T(c).profileTitle, noindex: true },
      <ProfilePage lang={L(c)} years={birthYears(now)} birthYear={Number.isNaN(birthYear) ? null : birthYear} gender={gender} error={error} />,
      400,
    )
  }
  await c.env.DB.prepare('UPDATE phone_flows SET birth_year = ?2, gender = ?3 WHERE id = ?1').bind(flow.id, birthYear, gender).run()
  return c.redirect(H(c, '/join/passkey'), 303)
})

site.get('/join/passkey', async (c) => {
  const flow = await auth.currentFlow(c, Date.now())
  if (!flow?.verified_at) return c.redirect(H(c, '/login'))
  if (!flow.birth_year || !flow.gender) return c.redirect(H(c, '/join/profile'))
  return page(c, { title: T(c).passkeyTitle, noindex: true }, <PasskeyPage lang={L(c)} />)
})

site.post('/logout', async (c) => {
  await auth.endSession(c)
  return c.redirect(H(c, '/'), 303)
})

// ---- my page ----

site.get('/me', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(toLogin(c, H(c, '/me')))
  const now = Date.now()
  const [polls, votes, posts, keys, invited, claims, notices] = await Promise.all([
    db.myPolls(c.env.DB, member.id),
    db.myVotes(c.env.DB, member.id),
    board.myPosts(c.env.DB, member.id),
    passkey.passkeysOf(c.env.DB, member.id),
    db.invitedCount(c.env.DB, member.id),
    viral.claimsOf(c.env.DB, member.id),
    db.noticesOf(c.env.DB, member.id),
  ])
  // Viewing the page is the receipt: the operator's notices count as read from here on (the nav badge disappears).
  if (notices.some((n) => n.read_at === null)) await db.markNoticesRead(c.env.DB, member.id, now)
  return page(
    c,
    { title: T(c).meTitle, noindex: true },
    <MePage
      lang={L(c)}
      member={member}
      passkeys={keys.length}
      inviteUrl={member.invite_code ? `${origin(c)}/i/${member.invite_code}` : null}
      invited={invited}
      claims={claims}
      notices={notices}
      polls={polls}
      votes={votes}
      posts={posts}
      now={now}
      flash={c.req.query('m') === 'passkey' ? T(c).passkeyAdded : undefined}
    />,
  )
})

site.post('/me/withdraw', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(H(c, '/login'), 303)
  const body = await c.req.parseBody()
  if (body.confirm !== 'yes') return c.redirect(H(c, '/me'), 303)
  await db.withdrawMember(c.env.DB, member.id, Date.now())
  await auth.endSession(c)
  c.set('member', null)
  const t = T(c)
  return page(c, { title: t.withdrawnTitle, noindex: true }, <MessagePage heading={t.withdrawnTitle} message={t.withdrawnText} link={{ href: H(c, '/'), label: t.home }} />)
})

// ---- maker claims ----

const claimDomain = (card: db.CardRow) => (card.status === 'ready' && card.official_source ? viral.officialDomain(card.official_url) : null)

site.get('/maker/claim/:cardId', async (c) => {
  if (!makerClaimsOn(c.env)) return c.notFound()
  const member = c.get('member')
  const id = c.req.param('cardId')
  if (!member) return c.redirect(toLogin(c, H(c, `/maker/claim/${id}`)))
  const card = (await db.getCards(c.env.DB, [id])).get(id)
  if (!card) return c.notFound()
  const name = `${card.maker} ${card.product}`
  return page(c, { title: T(c).claimTitle(name), noindex: true }, <ClaimPage lang={L(c)} name={name} cardId={card.id} domain={claimDomain(card)} />)
})

site.post('/maker/claim/:cardId', async (c) => {
  if (!makerClaimsOn(c.env)) return c.notFound()
  const member = c.get('member')
  if (!member) return c.redirect(H(c, '/login'), 303)
  const t = T(c)
  const now = Date.now()
  const id = c.req.param('cardId')
  const card = (await db.getCards(c.env.DB, [id])).get(id)
  if (!card) return c.notFound()
  const name = `${card.maker} ${card.product}`
  const domain = claimDomain(card)
  const body = await c.req.parseBody()
  const email = str(body.email, 120).trim()
  if (!domain || !viral.emailMatches(email, domain)) {
    return page(
      c,
      { title: t.claimTitle(name), noindex: true },
      <ClaimPage lang={L(c)} name={name} cardId={card.id} domain={domain} email={email} error={domain ? t.claimWrongDomain(domain) : undefined} />,
      400,
    )
  }
  const limit = await viral.claimLimit(c.env.DB, member.id, card.id, now)
  if (limit) {
    return page(
      c,
      { title: t.claimTitle(name), noindex: true },
      <ClaimPage lang={L(c)} name={name} cardId={card.id} domain={domain} email={email} error={limit === 'resend' ? t.claimResend : t.claimDaily} />,
      429,
    )
  }
  const pepper = pepperOf(c.env)
  const claimId = await viral.createClaim(c.env.DB, pepper, card.id, member.id, email, domain, now)
  const link = `${origin(c)}/maker/verify?l=${L(c)}&t=${encodeURIComponent(await viral.claimToken(pepper, claimId, now))}`
  const sent = await viral.sendClaimEmail(c.env, email, link, name)
  if (sent === 'off' || sent === 'failed') return page(c, { title: t.claimTitle(name), noindex: true }, <MessagePage heading={t.claimTitle(name)} message={t.claimEmailOff} />, 503)
  return page(
    c,
    { title: t.claimTitle(name), noindex: true },
    <MessagePage
      heading={t.claimTitle(name)}
      message={t.claimSent}
      extra={
        sent === 'dev' ? (
          <p class="flash">
            {t.claimDevLink}{' '}
            <a href={link} data-dev-claim-link>
              {link}
            </a>
          </p>
        ) : undefined
      }
    />,
  )
})

// ---- free board ----

const DAY = 24 * 60 * 60 * 1000

site.get('/board', async (c) => {
  const pageNo = Math.max(1, Math.min(1000, Number.parseInt(c.req.query('page') ?? '1', 10) || 1))
  const { rows, total } = await board.listPosts(c.env.DB, pageNo, BOARD_PAGE_SIZE)
  return page(c, { title: T(c).board, description: T(c).boardIntro, canonicalPath: '/board' }, <BoardPage lang={L(c)} posts={rows} page={pageNo} total={total} member={c.get('member') ?? null} />)
})

site.get('/board/new', async (c) => {
  if (!c.get('member')) return c.redirect(toLogin(c, H(c, '/board/new')))
  return page(c, { title: T(c).writeTitle, noindex: true }, <NewPostPage lang={L(c)} />)
})

site.post('/board/new', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(toLogin(c, H(c, '/board/new')), 303)
  const now = Date.now()
  const v = validatePost(await c.req.parseBody())
  if (!v.ok) return page(c, { title: T(c).writeTitle, noindex: true }, <NewPostPage lang={L(c)} form={v.form} errors={v.errors} />, 400)
  if ((await board.countSince(c.env.DB, 'posts', member.id, now - DAY)) >= DAILY_POST_LIMIT) {
    return page(c, { title: T(c).writeTitle, noindex: true }, <NewPostPage lang={L(c)} form={v.value} errors={[{ k: 'dailyPosts', p: [DAILY_POST_LIMIT] }]} />, 429)
  }
  const id = await board.createPost(c.env.DB, { memberId: member.id, nickname: member.nickname ?? 'anon', title: v.value.title, body: v.value.body, now })
  return c.redirect(H(c, `/board/${id}`), 303)
})

site.get('/board/:id', async (c) => {
  const post = await board.getPost(c.env.DB, c.req.param('id'))
  if (!post || post.status === 'deleted') return c.notFound()
  const comments = await board.getComments(c.env.DB, post.id)
  const t = T(c)
  const flash = { posted: t.commentPosted, deleted: t.commentDeleted }[c.req.query('m') ?? '']
  const hidden = post.status !== 'visible'
  return page(
    c,
    { title: hidden ? t.board : post.title, description: hidden ? undefined : post.body.slice(0, 120), canonicalPath: `/board/${post.id}`, noindex: hidden },
    <PostPage lang={L(c)} post={post} comments={comments} member={c.get('member') ?? null} flash={flash} />,
  )
})

site.post('/board/:id/comments', async (c) => {
  const post = await board.getPost(c.env.DB, c.req.param('id'))
  if (!post || post.status !== 'visible') return c.notFound()
  const member = c.get('member')
  const self = H(c, `/board/${post.id}`)
  if (!member) return c.redirect(toLogin(c, self), 303)
  const now = Date.now()
  const v = validateComment(await c.req.parseBody())
  const overLimit = (await board.countSince(c.env.DB, 'comments', member.id, now - DAY)) >= DAILY_COMMENT_LIMIT
  if (!v.ok || overLimit) {
    const comments = await board.getComments(c.env.DB, post.id)
    const error: Msg = !v.ok ? v.error : { k: 'dailyComments', p: [DAILY_COMMENT_LIMIT] }
    return page(c, { title: post.title, noindex: true }, <PostPage lang={L(c)} post={post} comments={comments} member={member} error={error} />, !v.ok ? 400 : 429)
  }
  await board.createComment(c.env.DB, { postId: post.id, memberId: member.id, nickname: member.nickname ?? 'anon', body: v.body, now })
  return c.redirect(`${self}?m=posted`, 303)
})

site.post('/board/:id/delete', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(H(c, '/login'), 303)
  if (!(await board.deleteOwnPost(c.env.DB, c.req.param('id'), member.id))) return c.notFound()
  const t = T(c)
  return page(c, { title: t.deletedTitle, noindex: true }, <MessagePage heading={t.deletedTitle} message={t.deletedText} link={{ href: H(c, '/board'), label: t.toBoard }} />)
})

site.post('/board/:id/comments/:cid/delete', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(H(c, '/login'), 303)
  const postId = await board.deleteOwnComment(c.env.DB, c.req.param('cid'), member.id)
  if (!postId) return c.notFound()
  return c.redirect(H(c, `/board/${postId}?m=deleted`), 303)
})

// ---- reports (immediate block / temporary measure / hidden after three reports — lib/board.ts fileReport) ----

const isTarget = (t: string): t is board.TargetType => t === 'poll' || t === 'post' || t === 'comment'

async function backOf(c: Ctx, type: board.TargetType, id: string) {
  if (type === 'poll') {
    const p = await db.getPoll(c.env.DB, id)
    return p && p.status !== 'hidden' ? pollPath(p, L(c)) : H(c, '/')
  }
  if (type === 'post') return H(c, `/board/${id}`)
  const cm = await c.env.DB.prepare('SELECT post_id FROM comments WHERE id = ?1').bind(id).first<{ post_id: string }>()
  return cm ? H(c, `/board/${cm.post_id}`) : H(c, '/board')
}

site.get('/report', async (c) => {
  const type = c.req.query('type') ?? ''
  const id = c.req.query('id') ?? ''
  if (!isTarget(type) || !(await board.targetExists(c.env.DB, type, id))) return c.notFound()
  if (!c.get('member')) return c.redirect(toLogin(c, H(c, `/report?type=${type}&id=${id}`)))
  return page(c, { title: T(c).reportTitle, noindex: true }, <ReportPage lang={L(c)} type={type} id={id} />)
})

site.post('/report', async (c) => {
  const member = c.get('member')
  if (!member) return c.redirect(H(c, '/login'), 303)
  const t = T(c)
  const body = await c.req.parseBody()
  const type = str(body.type, 10)
  const id = str(body.id, 20)
  const reason = str(body.reason, 20)
  if (!isTarget(type) || !(await board.targetExists(c.env.DB, type, id))) return c.notFound()
  const back = await backOf(c, type, id)
  const again = (error: string) => page(c, { title: t.reportTitle, noindex: true }, <ReportPage lang={L(c)} type={type} id={id} error={error} />, 400)
  if (!isReportReason(reason)) return again(t.reportPickReason)
  const detail = cleanBody(body.detail).slice(0, 1000) || null
  if (reason === 'rights' && (!detail || detail.length < 10)) return again(t.reportRightsDetail)
  const r = await board.fileReport(c.env.DB, { type, id, reason, detail, memberId: member.id, now: Date.now() })
  const message = r.result === 'duplicate' ? t.reportDone.duplicate : t.reportDone[r.action]
  return page(c, { title: t.reportTitle, noindex: true }, <MessagePage heading={t.reportTitle} message={message ?? ''} link={{ href: back, label: t.back }} />)
})

// ---- legal documents (English + Korean; published before launch — house rule) ----
// The operator's representative and address live in the OPERATOR secret, not in the public code (open development).
function fillOperator(html: string, raw: string | undefined) {
  let o: { rep?: { en?: string; ko?: string }; address?: { en?: string; ko?: string } } = {}
  try {
    o = raw ? JSON.parse(raw) : {}
  } catch {
    o = {}
  }
  const esc = (v: string | undefined, fallback: string) => (v ?? fallback).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return html
    .replaceAll('{{OPERATOR_REP_EN}}', esc(o.rep?.en, 'see hello@pollreal.com'))
    .replaceAll('{{OPERATOR_REP_KO}}', esc(o.rep?.ko, 'hello@pollreal.com 문의'))
    .replaceAll('{{OPERATOR_ADDRESS_EN}}', esc(o.address?.en, 'available on request: hello@pollreal.com'))
    .replaceAll('{{OPERATOR_ADDRESS_KO}}', esc(o.address?.ko, 'hello@pollreal.com로 요청 시 안내'))
}

for (const slug of LEGAL_KEYS) {
  site.get(`/${slug}`, async (c) => {
    const res = await page(c, { title: T(c).docs[slug] ?? slug, canonicalPath: `/${slug}` }, <DocPage lang={L(c)} slug={slug} />)
    return new Response(fillOperator(await res.text(), c.env.OPERATOR), { status: res.status, headers: res.headers })
  })
}

for (const l of LANGS) if (l !== 'en') app.route(`/${l}`, site)
app.route('/', site)

// =====================================================================================================================
// JSON endpoints used by the page script (passkeys, votes, share counter). Same-origin only.
// =====================================================================================================================

const jsonError = (c: Ctx, lang: Lang, k: string, status: ContentfulStatusCode = 400) => c.json({ error: msgText(lang, { k }) }, status)

app.post('/api/passkey/register/options', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const now = Date.now()
  const flow = await auth.currentFlow(c, now)
  if (!flow?.verified_at || !flow.birth_year || !flow.gender) return jsonError(c, lang, 'e.expired')
  let handle = flow.user_handle
  if (!handle) {
    handle = passkey.randomHandle()
    await c.env.DB.prepare('UPDATE phone_flows SET user_handle = ?2 WHERE id = ?1').bind(flow.id, handle).run()
  }
  const options = await passkey.registrationOptions(c.env.DB, rpOf(c), { userHandle: handle, userName: `${BRAND} ${flow.phone_hint}`, exclude: [], purpose: 'register', subject: flow.id }, now)
  return c.json({ options })
})

app.post('/api/passkey/register/verify', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const now = Date.now()
  const flow = await auth.currentFlow(c, now)
  if (!flow?.verified_at || !flow.birth_year || !flow.gender || !flow.user_handle) return jsonError(c, lang, 'e.expired')
  const cred = b.credential as RegistrationResponseJSON
  const challenge = cred ? passkey.challengeOf(cred) : null
  const ch = challenge ? await passkey.consumeChallenge(c.env.DB, challenge, 'register', now) : null
  if (!challenge || !ch || ch.subject !== flow.id) return jsonError(c, lang, 'refuse.passkey')
  const key = await passkey.verifyRegistration(rpOf(c), cred, challenge)
  if (!key) return jsonError(c, lang, 'refuse.passkey')
  const m = await auth.newMemberStatement(c, flow, now)
  try {
    await c.env.DB.batch([m.stmt, passkey.insertPasskey(c.env.DB, m.id, key, now)])
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) {
      await auth.endFlow(c, flow.id)
      return jsonError(c, lang, 'e.expired', 409)
    }
    throw e
  }
  await auth.startSession(c, m.id, now)
  await auth.endFlow(c, flow.id)
  return c.json({ redirect: auth.safeNext(flow.next) })
})

app.post('/api/passkey/login/options', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const options = await passkey.authenticationOptions(c.env.DB, rpOf(c), { allow: [], purpose: 'login', subject: null }, Date.now())
  return c.json({ options })
})

app.post('/api/passkey/login/verify', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const now = Date.now()
  const cred = b.credential as AuthenticationResponseJSON
  const challenge = cred ? passkey.challengeOf(cred) : null
  const ch = challenge ? await passkey.consumeChallenge(c.env.DB, challenge, 'login', now) : null
  const key = cred?.id ? await passkey.passkeyById(c.env.DB, str(cred.id, 300)) : null
  if (!challenge || !ch || !key) return jsonError(c, lang, 'refuse.passkey', 401)
  const member = await db.memberById(c.env.DB, key.member_id)
  if (!member) return jsonError(c, lang, 'e.suspended', 403)
  if (!auth.memberActive(member, now)) return c.json({ error: msgText(lang, auth.restrictionMsg(member, lang)) }, 403)
  const ok = await passkey.verifyAuthentication(rpOf(c), cred, challenge, key)
  if (!ok) return jsonError(c, lang, 'refuse.passkey', 401)
  await passkey.touchPasskey(c.env.DB, key.id, ok.counter, now)
  await auth.startSession(c, member.id, now)
  return c.json({ redirect: auth.safeNext(b.next) })
})

app.post('/api/passkey/add/options', async (c) => {
  const b = await jsonBody(c)
  const member = c.get('member')
  if (!b || !member) return c.json({ error: 'bad request' }, 400)
  const now = Date.now()
  const row = await c.env.DB.prepare('SELECT user_handle FROM members WHERE id = ?1').bind(member.id).first<{ user_handle: string | null }>()
  let handle = row?.user_handle ?? null
  if (!handle) {
    handle = passkey.randomHandle()
    await c.env.DB.prepare('UPDATE members SET user_handle = ?2 WHERE id = ?1').bind(member.id, handle).run()
  }
  const exclude = await passkey.passkeysOf(c.env.DB, member.id)
  const options = await passkey.registrationOptions(c.env.DB, rpOf(c), { userHandle: handle, userName: `${BRAND} ${member.nickname ?? ''}`, exclude, purpose: 'add', subject: member.id }, now)
  return c.json({ options })
})

app.post('/api/passkey/add/verify', async (c) => {
  const b = await jsonBody(c)
  const member = c.get('member')
  if (!b || !member) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const now = Date.now()
  const cred = b.credential as RegistrationResponseJSON
  const challenge = cred ? passkey.challengeOf(cred) : null
  const ch = challenge ? await passkey.consumeChallenge(c.env.DB, challenge, 'add', now) : null
  if (!challenge || !ch || ch.subject !== member.id) return jsonError(c, lang, 'refuse.passkey')
  const key = await passkey.verifyRegistration(rpOf(c), cred, challenge)
  if (!key) return jsonError(c, lang, 'refuse.passkey')
  try {
    await passkey.insertPasskey(c.env.DB, member.id, key, now).run()
  } catch (e) {
    if (/UNIQUE/i.test(String(e))) return jsonError(c, lang, 'refuse.passkey', 409)
    throw e
  }
  return c.json({ redirect: href(lang, '/me?m=passkey') })
})

// Vote step 1: a challenge bound to this member, poll and candidate; only this member's passkeys may answer it.
app.post('/api/vote/options', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const now = Date.now()
  const poll = await db.getPoll(c.env.DB, str(b.poll, 20))
  if (!poll || poll.status === 'hidden') return c.json({ error: 'not found' }, 404)
  const back = pollPath(poll, lang)
  const member = c.get('member')
  if (!member) return c.json({ redirect: href(lang, `/login?next=${encodeURIComponent(back)}`) }, 401)
  if (!isOpen(poll, now)) return c.json({ redirect: `${back}?m=closed#result` }, 409)
  if (await db.myChoice(c.env.DB, poll.id, member.id)) return c.json({ redirect: `${back}?m=dup#result` }, 409)
  const candidate = str(b.candidate, 20)
  if (!(await db.getCandidates(c.env.DB, poll.id)).some((x) => x.id === candidate)) return c.json({ redirect: `${back}?m=invalid` }, 400)
  const allow = await passkey.passkeysOf(c.env.DB, member.id)
  if (!allow.length) return jsonError(c, lang, 'refuse.no_passkey')
  const options = await passkey.authenticationOptions(c.env.DB, rpOf(c), { allow, purpose: 'vote', subject: member.id, data: { p: poll.id, c: candidate } }, now)
  return c.json({ options })
})

// Vote step 2: signed answer -> network -> one vote per device -> record. Refusals are counted on the result.
app.post('/api/vote', async (c) => {
  const b = await jsonBody(c)
  if (!b) return c.json({ error: 'bad request' }, 400)
  const lang = langOf(b)
  const t = tr(lang)
  const now = Date.now()
  const pepper = pepperOf(c.env)
  const poll = await db.getPoll(c.env.DB, str(b.poll, 20))
  if (!poll || poll.status === 'hidden') return c.json({ error: 'not found' }, 404)
  const back = pollPath(poll, lang)
  const member = c.get('member')
  if (!member) return c.json({ redirect: href(lang, `/login?next=${encodeURIComponent(back)}`) }, 401)
  const candidate = str(b.candidate, 20)
  const cred = b.credential as AuthenticationResponseJSON
  const challenge = cred ? passkey.challengeOf(cred) : null
  const ch = challenge ? await passkey.consumeChallenge(c.env.DB, challenge, 'vote', now) : null
  let data: { p?: string; c?: string } = {}
  try {
    data = ch?.data ? JSON.parse(ch.data) : {}
  } catch {
    data = {}
  }
  const key = cred?.id ? await passkey.passkeyById(c.env.DB, str(cred.id, 300)) : null
  if (!challenge || !ch || ch.subject !== member.id || data.p !== poll.id || data.c !== candidate || !key || key.member_id !== member.id) {
    return c.json({ error: t.refuse.passkey }, 401)
  }
  const signed = await passkey.verifyAuthentication(rpOf(c), cred, challenge, key)
  if (!signed) return c.json({ error: t.refuse.passkey }, 401)
  await passkey.touchPasskey(c.env.DB, key.id, signed.counter, now)

  if (!isOpen(poll, now)) return c.json({ redirect: `${back}?m=closed#result` })
  if (await db.myChoice(c.env.DB, poll.id, member.id)) return c.json({ redirect: `${back}?m=dup#result` })
  const who = await refusalWho(pepper, poll.id, member.id)
  if (blockedNetwork(networkInfo(c))) {
    await db.logRefusal(c.env.DB, poll.id, 'network', who, now)
    return c.json({ error: t.refuse.network }, 403)
  }
  const token = await cookieDeviceToken(c)
  if (!token) return c.json({ error: t.refuse.no_device }, 400)
  const mirrorValue = str(b.mirror, 80) || null
  const mirror = await readDeviceToken(pepper, mirrorValue)
  const dv = await deviceValues(pepper, poll.id, { token, mirror, ip: clientIp(c), userAgent: c.req.header('user-agent') ?? '', signals: cleanSignals(b.signals) })
  const { source, makerClaimId } = await viral.sourceForVote(c, poll.id, now)
  const r = await db.castVote(c.env.DB, {
    pollId: poll.id,
    memberId: member.id,
    candidateId: candidate,
    ageBand: ageBand(member.birth_year, kstYear(now)),
    gender: member.gender,
    newMember: isNewMember(member.created_at, now),
    source,
    makerClaimId,
    ...dv,
    now,
  })
  if (r === 'device' || r === 'fingerprint' || r === 'network_cap') {
    await db.logRefusal(c.env.DB, poll.id, r, who, now)
    return c.json({ error: t.refuse[r] }, 409)
  }
  if (r === 'ok' && mirror && mirror !== token && mirrorValue) restoreDeviceCookie(c, mirrorValue)
  const m = { ok: 'voted', duplicate: 'dup', closed: 'closed', invalid: 'invalid' }[r]
  return c.json({ redirect: `${back}?m=${m}#result` })
})

app.post('/api/share', async (c) => {
  const b = await jsonBody(c)
  const pollId = b ? str(b.poll, 20) : ''
  if (!/^[a-z0-9]{8}$/.test(pollId)) return c.body(null, 204)
  if (await db.getPoll(c.env.DB, pollId)) background(c, () => viral.bump(c.env.DB, pollId, 'share_click', Date.now()))
  return c.body(null, 204)
})

// =====================================================================================================================
// Viral entry points, result image and embed (root only).
// =====================================================================================================================

// Maker campaign link: votes through it are disclosed as maker-campaign votes.
app.get('/m/:code/:pollId', async (c) => {
  if (!makerClaimsOn(c.env)) return c.notFound()
  const poll = await db.getPoll(c.env.DB, c.req.param('pollId'))
  if (!poll || poll.status === 'hidden') return c.notFound()
  const claim = await viral.claimForPoll(c.env.DB, c.req.param('code'), poll.id)
  if (claim) {
    await viral.markSource(c, 'maker', { pollId: poll.id, makerClaimId: claim.id })
    background(c, () => viral.bump(c.env.DB, poll.id, 'arrive_maker', Date.now()))
  }
  return c.redirect(pollPath(poll, isLang(poll.lang) ? poll.lang : 'en'), 302)
})

// Invite link: remembered for the sign-up; no reward.
app.get('/i/:code', async (c) => {
  const found = await db.memberByInviteCode(c.env.DB, c.req.param('code'))
  const inviter = found && auth.memberActive(found, Date.now()) ? found : null
  if (inviter) {
    await auth.setInviteCookie(c, inviter.id)
    await viral.markSource(c, 'invite')
    background(c, () => viral.bump(c.env.DB, '', 'arrive_invite', Date.now()))
  }
  return c.redirect(inviter && isLang(inviter.lang) ? href(inviter.lang, '/') : '/', 302)
})

// The emailed link only shows a button: mail scanners that open links must not verify anyone (the POST does).
app.get('/maker/verify', async (c) => {
  if (!makerClaimsOn(c.env)) return c.notFound()
  const l = c.req.query('l')
  const lang: Lang = isLang(l) ? l : 'en'
  c.set('lang', lang)
  const t = tr(lang)
  const token = c.req.query('t') ?? ''
  const claim = await viral.verifyClaimToken(c.env.DB, pepperOf(c.env), token, Date.now(), false)
  if (!claim || claim.status === 'revoked') return page(c, { title: t.makerSection, noindex: true }, <MessagePage heading={t.makerSection} message={t.claimInvalid} />, 400)
  return page(
    c,
    { title: t.makerSection, noindex: true },
    <MessagePage
      heading={t.claimTitle(`${claim.maker} ${claim.product}`)}
      message={t.claimConfirmText(claim.email_domain)}
      extra={
        <form method="post" action="/maker/verify" class="stack">
          <input type="hidden" name="t" value={token} />
          <input type="hidden" name="l" value={lang} />
          <button type="submit">{t.claimConfirm}</button>
        </form>
      }
    />,
  )
})

app.post('/maker/verify', async (c) => {
  if (!makerClaimsOn(c.env)) return c.notFound()
  const body = await c.req.parseBody()
  const lang: Lang = isLang(body.l) ? body.l : 'en'
  c.set('lang', lang)
  const t = tr(lang)
  const claim = await viral.verifyClaimToken(c.env.DB, pepperOf(c.env), str(body.t, 600), Date.now(), true)
  if (!claim || claim.status !== 'verified') return page(c, { title: t.makerSection, noindex: true }, <MessagePage heading={t.makerSection} message={t.claimInvalid} />, 400)
  return page(
    c,
    { title: t.makerSection, noindex: true },
    <MessagePage heading={t.makerSection} message={t.claimVerified(`${claim.maker} ${claim.product}`)} link={{ href: href(lang, '/me'), label: t.navMe }} />,
  )
})

async function pollForWidget(c: Ctx, id: string) {
  const poll = await db.getPoll(c.env.DB, id)
  if (!poll || poll.status === 'hidden') return null
  const candidates = await db.getCandidates(c.env.DB, poll.id)
  const open = isOpen(poll, Date.now())
  const tl = splitVisible(open, false) ? tally(candidates.map((x) => x.id), await db.voteCells(c.env.DB, poll.id)) : null
  const n = tl?.n ?? (await db.voteCount(c.env.DB, poll.id))
  return { poll, candidates, open, tl, n, names: candidates.map(candidateName), ids: candidates.map((x) => x.id), hours: hoursLeft(poll.closes_at, Date.now()) }
}

app.get('/og/v/:file', async (c) => {
  const id = c.req.param('file').replace(/\.png$/, '')
  const q = c.req.query('lang')
  const lang: Lang = isLang(q) ? q : 'en'
  // The poll is looked up first (hidden polls disappear at once) and the cache key uses real values only, so made-up
  // query strings cannot force new renders.
  const w = await pollForWidget(c, id)
  if (!w) return c.notFound()
  // d = design version of the card (bump it when og.ts changes look) so cached cards of the old design are not served.
  const key = new Request(`${origin(c)}/og/v/${w.poll.id}.png?lang=${lang}&n=${w.n}&s=${w.open ? 'o' : 'c'}&h=${w.hours ?? ''}&d=${OG_DESIGN}`)
  const cacheApi = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  const hit = await cacheApi?.match(key)
  if (hit) return hit
  const left = w.open ? leftText(lang, w.poll.closes_at, Date.now()) : ''
  const png = await renderOg(c.executionCtx, { lang, names: w.names, ids: w.ids, open: w.open, n: w.n, tally: w.tl, left })
  const res = new Response(png, { headers: { 'Content-Type': 'image/png', 'Cache-Control': `public, max-age=${w.open ? 600 : 86400}` } })
  const copy = res.clone()
  background(c, async () => {
    await cacheApi?.put(key, copy)
    await viral.bump(c.env.DB, w.poll.id, 'og_render', Date.now())
  })
  return res
})

app.get('/embed/v/:id', async (c) => {
  const q = c.req.query('lang')
  const lang: Lang = isLang(q) ? q : 'en'
  const w = await pollForWidget(c, c.req.param('id'))
  if (!w) return c.notFound()
  background(c, () => viral.bump(c.env.DB, w.poll.id, 'embed_load', Date.now()))
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self' data:; frame-ancestors *; base-uri 'none'; form-action 'none'")
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cache-Control', 'public, max-age=300')
  return c.html(
    <EmbedPage
      lang={lang}
      title={pollTitle(w.candidates)}
      names={w.names}
      ids={w.ids}
      open={w.open}
      n={w.n}
      tally={w.tl}
      left={w.open ? leftText(lang, w.poll.closes_at, Date.now()) : ''}
      link={`${origin(c)}${pollPath(w.poll, lang)}?via=embed`}
    />,
  )
})

// README badges (2026-11-01): shields-style 20 px "/badge/<id>.svg" (?for=N speaks for candidate N) and a 320×80 card
// "/badge/card/<id>.svg" with the mini gauge. English only (READMEs), cached 5 minutes. The split follows the same rule as
// the share image: after closing (or with INTERIM_PUBLIC once the poll has BADGE_MIN_VOTES votes).
const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  'X-Content-Type-Options': 'nosniff',
}

// Maker site icons (operator 2026-11-04): stored copies only, raster formats only, cached a week.
app.get('/icon/:domain', async (c) => {
  const domain = c.req.param('domain')
  if (!/^[a-z0-9.-]{3,253}$/.test(domain)) return c.notFound()
  const icon = await icons.getIcon(c.env.DB, domain)
  if (!icon) return c.notFound()
  return c.body(icon.data, 200, {
    'Content-Type': icon.mime,
    'Cache-Control': 'public, max-age=604800',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
})

app.get('/badge/card/:file', async (c) => {
  const w = await pollForWidget(c, c.req.param('file').replace(/\.svg$/, ''))
  if (!w) return c.notFound()
  background(c, () => viral.bump(c.env.DB, w.poll.id, 'embed_load', Date.now()))
  const segs = segments(w.ids, w.names, w.tl)
  const svg = cardSvg({ title: pollTitle(w.candidates), segs, open: w.open, n: w.n, hoursLeft: w.hours, split: !!w.tl })
  return c.body(svg, 200, SVG_HEADERS)
})

app.get('/badge/:file', async (c) => {
  const w = await pollForWidget(c, c.req.param('file').replace(/\.svg$/, ''))
  if (!w) return c.notFound()
  background(c, () => viral.bump(c.env.DB, w.poll.id, 'embed_load', Date.now()))
  const f = Number(c.req.query('for'))
  const forIndex = Number.isInteger(f) && f >= 1 && f <= w.ids.length ? f - 1 : undefined
  const svg = badgeSvg(badgeMessage({ ids: w.ids, names: w.names, tally: w.tl, open: w.open, n: w.n, hoursLeft: w.hours, forIndex }))
  return c.body(svg, 200, SVG_HEADERS)
})

// Public poll list for the open GitHub repo github.com/pollreal/polls: only what every visitor already sees —
// titles, category, open/closed, vote count and, after closing, the result. Split of open polls stays hidden.
app.get('/api/public/polls', async (c) => {
  const now = Date.now()
  const o = origin(c)
  const [polls, cands, counts, meta] = await Promise.all([
    c.env.DB.prepare("SELECT id, slug, category, closes_at, status, is_seed, review_note FROM polls WHERE status != 'hidden' ORDER BY closes_at DESC LIMIT 500").all<{
      id: string
      slug: string
      category: string
      closes_at: number
      status: string
      is_seed: number
      review_note: string | null
    }>(),
    c.env.DB.prepare(
      "SELECT c.poll_id, c.id, c.maker, c.product FROM candidates c JOIN polls p ON p.id = c.poll_id WHERE p.status != 'hidden' ORDER BY c.poll_id, c.position",
    ).all<{ poll_id: string; id: string; maker: string; product: string }>(),
    c.env.DB.prepare("SELECT v.poll_id, v.candidate_id, COUNT(*) AS n FROM votes v JOIN polls p ON p.id = v.poll_id WHERE p.status != 'hidden' GROUP BY 1, 2").all<{
      poll_id: string
      candidate_id: string
      n: number
    }>(),
    ranking.rankingMeta(c.env.DB),
  ])
  const byPoll = new Map<string, { id: string; name: string }[]>()
  for (const x of cands.results) byPoll.set(x.poll_id, [...(byPoll.get(x.poll_id) ?? []), { id: x.id, name: candidateName(x) }])
  const votes = new Map<string, Map<string, number>>()
  for (const x of counts.results) {
    const m = votes.get(x.poll_id) ?? new Map<string, number>()
    m.set(x.candidate_id, x.n)
    votes.set(x.poll_id, m)
  }
  const label = (slug: string) => CATEGORIES.find((k) => k.slug === slug)?.en ?? slug
  const list = polls.results.map((p) => {
    const cs = byPoll.get(p.id) ?? []
    const vs = votes.get(p.id) ?? new Map<string, number>()
    const n = [...vs.values()].reduce((a, b) => a + b, 0)
    const open = isOpen(p, now)
    let result: { leaders: string[]; pct: number } | null = null
    if (!open && n && !p.review_note) {
      const top = Math.max(...cs.map((x) => vs.get(x.id) ?? 0))
      result = { leaders: cs.filter((x) => (vs.get(x.id) ?? 0) === top).map((x) => x.name), pct: Math.round((top * 1000) / n) / 10 }
    }
    return {
      id: p.id,
      title: cs.map((x) => x.name).join(' vs '),
      category: p.category,
      categoryLabel: label(p.category),
      seed: !!p.is_seed,
      underReview: !!p.review_note,
      open,
      closesAt: new Date(p.closes_at).toISOString(),
      votes: n,
      url: `${o}/v/${p.id}/${encodeURIComponent(p.slug)}`,
      badge: `${o}/badge/${p.id}.svg`,
      result,
    }
  })
  return c.json(
    {
      generatedAt: new Date(now).toISOString(),
      site: o,
      rankings: meta.results.map((m) => ({ category: m.category, label: label(m.category), ranked: m.ranked, products: m.items, url: `${o}/rank/${m.category}` })),
      polls: list,
    },
    200,
    { 'Cache-Control': 'public, max-age=600' },
  )
})

// Live gauge for the poll page: only for viewers who may see the split (voted, closed, or INTERIM_PUBLIC). Never cached.
app.get('/api/tally/:id', async (c) => {
  c.header('Cache-Control', 'no-store')
  const q = c.req.query('lang')
  const lang: Lang = isLang(q) ? q : 'en'
  const t = tr(lang)
  const poll = await db.getPoll(c.env.DB, c.req.param('id'))
  if (!poll || poll.status === 'hidden') return c.json({ error: 'not found' }, 404)
  const now = Date.now()
  const open = isOpen(poll, now)
  const member = c.get('member')
  const voted = member ? !!(await db.myChoice(c.env.DB, poll.id, member.id)) : false
  if (!splitVisible(open, voted)) return c.json({ error: 'hidden' }, 403)
  const candidates = await db.getCandidates(c.env.DB, poll.id)
  const tl = tally(candidates.map((x) => x.id), await db.voteCells(c.env.DB, poll.id))
  const segs = segments(candidates.map((x) => x.id), candidates.map(candidateName), tl)
  return c.json({
    open,
    n: tl.n,
    segs: segs.map((x) => ({ id: x.id, pct: x.pct, tone: x.tone, lead: x.lead, from: x.from, votes: t.votesShort(x.count) })),
  })
})

// =====================================================================================================================
// Development helpers, search engines, errors, cron.
// =====================================================================================================================

// Fill every waiting card now (e.g. the seed polls) and report what it cost.
// Development only: recompute the rankings now (the cron does it once a day).
app.get('/dev/rank/run', async (c) => c.json(await ranking.computeRankings(c.env.DB, Date.now())))

// Development only: which keys from .dev.vars reached the Worker and whether each has the expected shape — never the values.
app.get('/dev/keys', (c) => {
  const shape = (v: string | undefined, re: RegExp) => ({ set: !!v, shape_ok: !!v && re.test(v), length: v?.length ?? 0 })
  return c.json({
    ANTHROPIC_API_KEY: shape(c.env.ANTHROPIC_API_KEY, /^sk-ant-[A-Za-z0-9_-]{20,}$/),
    FIREBASE_API_KEY: shape(c.env.FIREBASE_API_KEY, /^AIza[0-9A-Za-z_-]{30,}$/),
  })
})

app.post('/dev/cards/run', async (c) => {
  const now = Date.now()
  const ids = await cards.pendingIds(c.env.DB, 200, now)
  const report = await cards.generateCards(c.env, ids, now)
  return c.json({ waiting: ids.length, ...report, costUsd: Math.round(report.costUsd * 10000) / 10000 })
})

// Deep pass on demand (locally the cron makes no paid calls): queued cards, browser + model.
app.post('/dev/cards/deep', async (c) => {
  const report = await cards.generateDeepCards(c.env, Date.now(), Number(c.req.query('limit') ?? 3))
  return c.json({ ...report, costUsd: Math.round(report.costUsd * 10000) / 10000 })
})

// Snapshot one KST day now (default today, even unfinished) — replaces that day's row.
app.post('/dev/metrics/run', async (c) => {
  const now = Date.now()
  const day = c.req.query('day') ?? kstDay(now)
  if (!isDay(day)) return c.json({ error: 'day must be YYYY-MM-DD' }, 400)
  const m = await computeDay(c.env.DB, day)
  await saveDay(c.env.DB, m, now, true)
  return c.json(m)
})

app.get('/robots.txt', (c) => {
  const lines = ['User-agent: *']
  for (const p of ['/me', '/new', '/login', '/auth/', '/join/', '/search', '/report', '/maker/']) for (const l of LANGS) lines.push(`Disallow: ${href(l, p)}`)
  lines.push('Disallow: /dev/', 'Disallow: /api/', 'Disallow: /m/', 'Disallow: /i/', 'Disallow: /embed/', `Sitemap: ${origin(c)}/sitemap.xml`, '')
  return c.text(lines.join('\n'))
})

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

app.get('/sitemap.xml', async (c) => {
  const base = origin(c)
  const now = Date.now()
  // Every language version is listed (5,000 polls x 9 languages stays under the 50,000-URL sitemap limit); the pages
  // themselves carry the hreflang alternates.
  const rows = await db.sitemapPolls(c.env.DB, 5000)
  const all = (path: string, lastmod?: string) =>
    LANGS.map((lang) => `<url><loc>${escXml(base + href(lang, path))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`).join('')
  const rankCats = (await ranking.rankingMeta(c.env.DB)).results.map((m) => all(`/rank/${m.category}`))
  const urls = [all('/'), all('/rank'), ...rankCats, ...rows.map((r) => all(`/v/${r.id}/${encodeURIComponent(r.slug)}`, isoDate(Math.min(r.closes_at, now))))]
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
    200,
    { 'Content-Type': 'application/xml; charset=utf-8' },
  )
})

app.notFound((c) => {
  const t = T(c)
  return page(c, { title: t.notFoundTitle, noindex: true }, <MessagePage heading={t.notFoundTitle} message={t.notFoundText} link={{ href: H(c, '/'), label: t.home }} />, 404)
})

app.onError((err, c) => {
  if (err instanceof HTTPException) return err.getResponse() // e.g. 403 from the CSRF check
  console.error(err)
  return c.html(`<!doctype html><meta charset="utf-8"><title>${BRAND}</title><p>Something went wrong. Please try again. / 잠시 문제가 생겼습니다. 다시 시도해 주세요.</p>`, 500)
})

export default {
  fetch: app.fetch,
  // Every 5 minutes: close expired polls, drop expired sessions/flows/challenges, release 30-day-old withdrawn phone
  // hashes, end timed suspensions, write any AI card the page/new-poll triggers missed, review voting patterns, snapshot metrics.
  async scheduled(_event: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    applyPrivateLimits(env.PRIVATE_LIMITS)
    const now = Date.now()
    const log = (what: string) => (e: unknown) => console.error(`cron ${what} failed`, e)
    ctx.waitUntil(db.maintenance(env.DB, now).catch(log('maintenance')))
    // Locally the cron only runs when the smoke test triggers it — no paid AI calls there (cards come from page views
    // or /dev/cards/run).
    if (!isDev(env))
      ctx.waitUntil(
        cards
          .pendingIds(env.DB, 20, now)
          .then((ids) => cards.generateCards(env, ids, now))
          .then(() => cards.generateDeepCards(env, Date.now()))
          .catch(log('cards')),
      )
    ctx.waitUntil(scanAnomalies(env.DB, now).catch(log('anomalies')))
    ctx.waitUntil(purgeDeviceHashes(env.DB, now).catch(log('purge')))
    ctx.waitUntil(snapshotDays(env.DB, now).catch(log('metrics')))
    ctx.waitUntil(ranking.refreshRankingsIfStale(env.DB, now).catch(log('rankings')))
    // Maker site icons: a few per run (network fetches), never locally.
    if (!isDev(env)) ctx.waitUntil(icons.fillMissingIcons(env.DB, 8, now).catch(log('icons')))
  },
} satisfies ExportedHandler<Bindings>
