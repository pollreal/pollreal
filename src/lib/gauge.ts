// Contest gauge (2026-11-01, Stitch v0.3 "the contest gauge"): one horizontal bar whose segments meet where the votes
// split — the leader in copper, the others in slate — like an election tally bar. Pure functions shared by the poll page,
// the share image, the embed and the README badges. Candidate order never changes (only the colour moves to the leader),
// so a lead change reads as the boundary moving, not the bar flipping.
import { BADGE_MIN_VOTES, BRAND, INTERIM_PUBLIC } from '../config'
import type { Tally } from './aggregate'

export type Tone = 'lead' | 'rest' | 'rest2' | 'rest3'
export type Seg = { id: string; name: string; count: number; pct: number; lead: boolean; mine: boolean; tone: Tone; from: number }

// Tokens (Blackstone via Stitch): copper leader, slate others (#525357, #8C8E94, #B4B6BC), 1px #D5D8DF rule.
export const GAUGE_COLORS: Record<Tone, string> = { lead: '#A95228', rest: '#525357', rest2: '#8C8E94', rest3: '#B4B6BC' }
export const GAUGE_EMPTY = '#E7D8C9' // taupe: no votes yet / split hidden

// Segments in candidate order. `from` = left edge in % (for the "You" marker). With no votes every segment is equal.
export function segments(ids: string[], names: string[], tally: Tally | null, myChoice: string | null = null): Seg[] {
  const n = tally?.n ?? 0
  const single = (tally?.leaders.length ?? 0) === 1
  let rank = 0
  let from = 0
  return ids.map((id, i) => {
    const s = tally?.overall.find((x) => x.candidateId === id)
    const pct = n ? (s?.pct ?? 0) : Math.round((1000 / ids.length)) / 10
    const lead = n > 0 && single && (tally?.leaders.includes(id) ?? false)
    const rests: Tone[] = ['rest', 'rest2', 'rest3']
    // tied leaders share the first slate so a dead heat looks even
    const tiedTop = n > 0 && !single && (tally?.leaders.includes(id) ?? false)
    const tone: Tone = lead ? 'lead' : tiedTop ? 'rest' : (rests[Math.min(rank++, 2)] ?? 'rest')
    const seg = { id, name: names[i] ?? '', count: s?.count ?? 0, pct, lead, mine: id === myChoice, tone, from }
    from += pct
    return seg
  })
}

export type Standing = { kind: 'behind' | 'lead' | 'tied'; margin: number; versus: string; mine: string }

// The member's side against the field: behind the leader, ahead of the runner-up, or level with another leader.
export function standing(ids: string[], names: string[], tally: Tally | null, myChoice: string | null): Standing | null {
  if (!tally || !tally.n || !myChoice) return null
  const i = ids.indexOf(myChoice)
  if (i < 0) return null
  const count = (id: string) => tally.overall.find((x) => x.candidateId === id)?.count ?? 0
  const mineN = count(myChoice)
  const others = ids.filter((id) => id !== myChoice).map((id) => ({ id, n: count(id), name: names[ids.indexOf(id)] ?? '' }))
  if (!others.length) return null
  const best = others.reduce((a, b) => (b.n > a.n ? b : a))
  const kind = mineN > best.n ? 'lead' : mineN < best.n ? 'behind' : 'tied'
  return { kind, margin: Math.abs(mineN - best.n), versus: best.name, mine: names[i] ?? '' }
}

// Whether a viewer may see the split of a poll right now.
export const splitVisible = (open: boolean, voted: boolean, publicInterim = INTERIM_PUBLIC) => !open || voted || publicInterim

// ---- README badge (shields-style, 20 px) ---------------------------------------------------------------------------

export type BadgeIn = {
  ids: string[]
  names: string[]
  tally: Tally | null // null while the split is hidden
  open: boolean
  n: number
  hoursLeft: number | null
  forIndex?: number // 0-based candidate to speak for (a maker badge); undefined = the poll as a whole
  publicInterim?: boolean
}
export type BadgeOut = { label: string; message: string; color: string }

// The label cell is slate #515256; a trailing candidate's cell must read as different from it.
const BADGE_OTHER = '#7A7C82'

const left = (h: number | null) => (h === null ? 'closing' : h < 1 ? '<1h left' : `${h}h left`)
const plural = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'vote' : 'votes'}`

// English only: badges live in READMEs and docs (the poll page itself is in nine languages).
export function badgeMessage(b: BadgeIn): BadgeOut {
  const label = BRAND
  const muted = '#8C8E94'
  const showSplit = !!b.tally && b.tally.n > 0 && (!b.open || ((b.publicInterim ?? INTERIM_PUBLIC) && b.n >= BADGE_MIN_VOTES))
  if (!showSplit || !b.tally) {
    if (!b.open) return { label, message: b.n ? `final · ${plural(b.n)}` : 'closed · no votes', color: muted }
    return { label, message: `voting · ${left(b.hoursLeft)}`, color: muted }
  }
  const segs = segments(b.ids, b.names, b.tally)
  const tail = b.open ? left(b.hoursLeft) : 'final'
  const s = b.forIndex === undefined ? undefined : segs[b.forIndex]
  if (s) {
    return { label, message: `${s.name} ${s.pct}% · ${tail}`, color: s.lead ? GAUGE_COLORS.lead : BADGE_OTHER }
  }
  const top = segs.find((s) => s.lead)
  if (!top) return { label, message: `tie ${segs[0]?.pct ?? 0}% · ${tail}`, color: BADGE_OTHER }
  const verb = b.open ? 'leads' : 'wins'
  return { label, message: `${top.name} ${verb} ${top.pct}% · ${b.open ? plural(b.n) : tail}`, color: GAUGE_COLORS.lead }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Rough advance widths of Verdana/DejaVu 11 px (what shields.io measures with), enough to size a badge cell.
export function textWidth(s: string, px = 11): number {
  let w = 0
  for (const ch of s) {
    if (/[il.,:;'|!·]/.test(ch)) w += 3.6
    else if (/[fjrt()\-[\] ]/.test(ch)) w += 4.6
    else if (/[mwMW%]/.test(ch)) w += 10.2
    else if (/[A-Z0-9#&@<>]/.test(ch)) w += 7.6
    else if (ch.charCodeAt(0) > 0x2e7f) w += 11 // CJK and other full-width
    else w += 6.6
  }
  return (w * px) / 11
}

export const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

export function badgeSvg(o: BadgeOut): string {
  const label = esc(o.label)
  const message = esc(clip(o.message, 60))
  const lw = Math.round(textWidth(o.label) + 14)
  const mw = Math.round(textWidth(clip(o.message, 60)) + 14)
  const w = lw + mw
  const font = 'Verdana,DejaVu Sans,Geneva,sans-serif'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${message}"><title>${label}: ${message}</title><clipPath id="r"><rect width="${w}" height="20" rx="2" fill="#fff"/></clipPath><g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#515256"/><rect x="${lw}" width="${mw}" height="20" fill="${o.color}"/></g><g fill="#fff" text-anchor="middle" font-family="${font}" font-size="11"><text x="${lw / 2}" y="14">${label}</text><text x="${lw + mw / 2}" y="14">${message}</text></g></svg>`
}

// 320 × 80 card: wordmark + state, title, the mini gauge, the leader line.
export function cardSvg(o: { title: string; segs: Seg[]; open: boolean; n: number; hoursLeft: number | null; split: boolean }): string {
  const W = 320
  const font = 'Inter,-apple-system,Segoe UI,Helvetica,Arial,sans-serif'
  const state = o.open ? left(o.hoursLeft) : 'FINAL'
  const track = { x: 12, y: 44, w: W - 24, h: 12 }
  let bars = ''
  if (o.split && o.n) {
    let x = track.x
    o.segs.forEach((s, i) => {
      const w = i === o.segs.length - 1 ? track.x + track.w - x : Math.round((track.w * s.pct) / 100)
      if (w > 0) bars += `<rect x="${x}" y="${track.y}" width="${w}" height="${track.h}" fill="${GAUGE_COLORS[s.tone]}"/>`
      if (i > 0) bars += `<rect x="${x - 1}" y="${track.y}" width="2" height="${track.h}" fill="#fff"/>`
      x += w
    })
  } else {
    bars = `<rect x="${track.x}" y="${track.y}" width="${track.w}" height="${track.h}" fill="${GAUGE_EMPTY}"/>`
  }
  const top = o.segs.find((s) => s.lead)
  const foot =
    o.split && o.n
      ? top
        ? `${clip(top.name, 24)} ${o.open ? 'leads' : 'wins'} ${top.pct}% · ${plural(o.n)}`
        : `tie · ${plural(o.n)}`
      : o.open
        ? `${plural(o.n)} so far · split shown to voters`
        : `${plural(o.n)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="80" viewBox="0 0 ${W} 80" role="img" aria-label="${esc(`${BRAND}: ${o.title} — ${foot}`)}"><rect x=".5" y=".5" width="${W - 1}" height="79" fill="#fff" stroke="#D5D8DF"/><rect width="4" height="80" fill="#A95228"/><g font-family="${font}"><text x="12" y="16" font-size="9" font-weight="700" letter-spacing="1.2" fill="#000">${esc(BRAND.toUpperCase())}</text><text x="${W - 12}" y="16" font-size="9" font-weight="600" letter-spacing=".6" text-anchor="end" fill="${o.open ? '#515256' : '#A95228'}">${esc(state)}</text><text x="12" y="35" font-size="13" font-weight="600" fill="#000">${esc(clip(o.title, 44))}</text>${bars}<rect x="${track.x - 0.5}" y="${track.y - 0.5}" width="${track.w + 1}" height="${track.h + 1}" fill="none" stroke="#D5D8DF"/><text x="12" y="72" font-size="10" fill="#515256">${esc(foot)}</text></g></svg>`
}

// Whole hours left (for share image and badge cache keys and labels).
export const hoursLeft = (closesAt: number, now: number) => (closesAt > now ? Math.floor((closesAt - now) / 3600000) : null)
