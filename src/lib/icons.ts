// Maker site icons (operator 2026-11-04, choice a; house rule exception for identification icons). For every ready AI
// card with an official URL, the cron fetches the icon that site already publishes (apple-touch-icon / <link rel=icon> /
// /favicon.ico), checks it is a real raster image, and stores it in D1. Pages show it from /icon/<domain> — never a
// third-party icon service, so visitors' requests stay on pollreal.com. SVG is refused (it can carry script); a maker
// without a usable icon gets a letter badge.

export const ICON_MAX_BYTES = 100_000
const HTML_MAX_BYTES = 600_000
const FETCH_TIMEOUT_MS = 6000
const RETRY_NONE_MS = 86400_000 // sites time out now and then; try a 'none' again the next day
const UA = 'Mozilla/5.0 (compatible; PollrealBot/1.0; +https://pollreal.com)'

export function iconDomain(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    const host = u.hostname.toLowerCase().replace(/^www\./, '')
    return /^[a-z0-9.-]{3,253}$/.test(host) && host.includes('.') ? host : null
  } catch {
    return null
  }
}

// Magic bytes → MIME. Anything else (SVG, HTML error pages, …) is refused.
export function sniff(b: Uint8Array): string | null {
  if (b.length < 12) return null
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return 'image/x-icon'
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

type Link = { href: string; score: number }

// <link rel="…icon…" href="…" sizes="…" type="…"> → candidates, best first. Bigger raster icons look sharper at 2×.
export function iconLinks(html: string, base: string): Link[] {
  const out: Link[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const attr = (name: string) => tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))?.slice(1).find((x) => x !== undefined)
    const rel = (attr('rel') ?? '').toLowerCase()
    const raw = attr('href')
    if (!raw || !/\bicon\b/.test(rel)) continue
    const type = (attr('type') ?? '').toLowerCase()
    if (type.includes('svg') || /\.svg(\?|#|$)/i.test(raw) || rel.includes('mask-icon')) continue
    let href: string
    try {
      href = new URL(raw.replace(/&amp;/g, '&'), base).toString()
    } catch {
      continue
    }
    if (!href.startsWith('https://') && !href.startsWith('http://')) continue
    const size = Math.max(0, ...(attr('sizes') ?? '').split(/\s+/).map((s) => Number.parseInt(s, 10) || 0))
    const apple = rel.includes('apple-touch-icon')
    const score = (apple ? 300 : 200) + Math.min(size || (apple ? 180 : 32), 256) / 4 - (size > 256 ? 40 : 0)
    out.push({ href, score })
  }
  return out.sort((a, b) => b.score - a.score)
}

async function getBytes(url: string, max: number, accept: string): Promise<{ bytes: Uint8Array; finalUrl: string } | null> {
  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': UA, accept }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!r.ok || !r.body) return null
    const len = Number(r.headers.get('content-length') ?? 0)
    if (len > max) return null
    const reader = r.body.getReader()
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) {
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(total)
    let o = 0
    for (const c of chunks) {
      bytes.set(c, o)
      o += c.byteLength
    }
    return { bytes, finalUrl: r.url || url }
  } catch {
    return null
  }
}

export type FoundIcon = { mime: string; data: Uint8Array; source: string }

// docs.midjourney.com → midjourney.com (never a bare public suffix such as co.kr).
export function parentDomain(domain: string): string | null {
  const parts = domain.split('.')
  if (parts.length < 3) return null
  const parent = parts.slice(1).join('.')
  return /^(co|com|or|ne|go|ac|net|org|gov|edu)\.[a-z]{2}$/.test(parent) ? null : parent
}

export async function findIcon(domain: string): Promise<FoundIcon | null> {
  const own = await findIconAt(domain)
  if (own) return own
  const parent = parentDomain(domain)
  return parent ? findIconAt(parent) : null
}

async function findIconAt(domain: string): Promise<FoundIcon | null> {
  const home = `https://${domain}/`
  const page = await getBytes(home, HTML_MAX_BYTES, 'text/html')
  const tries: string[] = []
  if (page) tries.push(...iconLinks(new TextDecoder().decode(page.bytes), page.finalUrl).slice(0, 4).map((l) => l.href))
  tries.push(`https://${domain}/favicon.ico`)
  for (const url of [...new Set(tries)]) {
    const got = await getBytes(url, ICON_MAX_BYTES, 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5')
    const mime = got && sniff(got.bytes)
    if (got && mime) return { mime, data: got.bytes, source: url }
  }
  return null
}

// Cron: icons for ready cards' official domains that have none yet (or whose 'none' is 30 days old).
export async function fillMissingIcons(db: D1Database, limit: number, now: number): Promise<number> {
  const urls = await db.prepare("SELECT DISTINCT official_url FROM cards WHERE status = 'ready' AND official_url IS NOT NULL").all<{ official_url: string }>()
  const have = await db.prepare('SELECT domain, status, fetched_at FROM maker_icons').all<{ domain: string; status: string; fetched_at: number }>()
  const known = new Map(have.results.map((r) => [r.domain, r]))
  const todo = [...new Set(urls.results.map((r) => iconDomain(r.official_url)).filter((d): d is string => !!d))]
    .filter((d) => {
      const k = known.get(d)
      return !k || (k.status === 'none' && now - k.fetched_at > RETRY_NONE_MS)
    })
    .slice(0, limit)
  for (const domain of todo) {
    const icon = await findIcon(domain)
    await db
      .prepare('INSERT OR REPLACE INTO maker_icons (domain, status, mime, data, source_url, fetched_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(domain, icon ? 'ok' : 'none', icon?.mime ?? null, icon ? icon.data : null, icon?.source ?? null, now)
      .run()
  }
  return todo.length
}

// card id → icon domain, for the cards whose site icon is stored.
export async function iconsForCards(db: D1Database, cardIds: (string | null | undefined)[]): Promise<Map<string, string>> {
  const ids = [...new Set(cardIds.filter((x): x is string => !!x))]
  const out = new Map<string, string>()
  if (!ids.length) return out
  // D1 allows 100 bound values per statement → chunks of 90.
  const rows: { id: string; official_url: string }[] = []
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90)
    const r = await db
      .prepare(`SELECT id, official_url FROM cards WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(',')}) AND official_url IS NOT NULL`)
      .bind(...part)
      .all<{ id: string; official_url: string }>()
    rows.push(...r.results)
  }
  const byCard = rows.map((r) => [r.id, iconDomain(r.official_url)] as const).filter((x): x is readonly [string, string] => !!x[1])
  if (!byCard.length) return out
  const ok = await db.prepare("SELECT domain FROM maker_icons WHERE status = 'ok'").all<{ domain: string }>()
  const okSet = new Set(ok.results.map((r) => r.domain))
  for (const [id, d] of byCard) if (okSet.has(d)) out.set(id, d)
  return out
}

export async function getIcon(db: D1Database, domain: string): Promise<{ mime: string; data: ArrayBuffer } | null> {
  const r = await db.prepare("SELECT mime, data FROM maker_icons WHERE domain = ?1 AND status = 'ok'").bind(domain).first<{ mime: string; data: ArrayBuffer | number[] }>()
  if (!r?.data) return null
  const data = r.data instanceof ArrayBuffer ? r.data : new Uint8Array(r.data as number[]).buffer
  return { mime: r.mime, data }
}
