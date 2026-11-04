// Result card image: the picture platforms show when a poll link is shared. Running polls show the
// candidates and how many verified humans voted (interim percentages stay for voters only); closed polls show the result.
// Rendered with satori + resvg (WASM) from plain element objects — no React. One gothic family like the site: Inter
// for Latin text, fetched by the server from Google Fonts and cached (the visitor's browser never contacts Google);
// non-Latin text (Korean …) pulls Noto Sans glyphs from Google Fonts on demand.
import { GoogleFont, cache, render } from '@cf-wasm/og/workerd'
import { BRAND } from '../config'
import { type Lang, tr } from '../i18n'
import type { Tally } from './aggregate'
import { GAUGE_COLORS, GAUGE_EMPTY, clip, segments } from './gauge'

type El = { type: string; props: Record<string, unknown> & { children?: unknown } }
const h = (type: string, style: Record<string, unknown>, ...children: unknown[]): El => ({
  type,
  props: { style, children: children.length === 1 ? children[0] : children },
})

// Stitch design tokens (Blackstone tone): white, black text, slate greys, copper accent — no black fills.
const ACC = '#A95228'
const INK = '#000000'
const SUB = '#515256'
const LINE = '#D5D8DF'
const SANS = 'Inter'
// Bumped whenever the card's look changes: part of the image cache key (index.tsx).
export const OG_DESIGN = 'gauge2'

// tally = null while the split is hidden (open poll, INTERIM_PUBLIC off): the gauge is drawn locked.
export type OgInput = { lang: Lang; names: string[]; ids: string[]; open: boolean; n: number; tally: Tally | null; left?: string }

// Contest gauge (Stitch v0.3 screen B): names and big percentages above, one bar with a 2 px white seam, the 50 mark.
function gauge(o: OgInput): El {
  const t = tr(o.lang)
  const split = !!o.tally && o.tally.n > 0
  const segs = segments(o.ids, o.names, split ? o.tally : null)
  const duel = segs.length === 2
  const big = segs.length > 3 ? 40 : 56
  const head = h(
    'div',
    { display: 'flex', width: '100%', justifyContent: 'space-between' },
    ...segs.map((s, i) =>
      h(
        'div',
        {
          display: 'flex',
          flexDirection: 'column',
          width: `${Math.floor(100 / segs.length)}%`,
          alignItems: duel && i === 1 ? 'flex-end' : 'flex-start',
          paddingRight: 12,
          boxSizing: 'border-box',
        },
        h('div', { display: 'flex', fontSize: segs.length > 3 ? 22 : 26, fontWeight: 600, color: INK }, clip(s.name, segs.length > 2 ? 18 : 30)),
        split ? h('div', { display: 'flex', fontSize: big, fontWeight: 600, letterSpacing: -1, color: s.lead ? ACC : INK, marginTop: 2 }, `${s.pct}%`) : h('div', { display: 'flex', height: 8 }),
      ),
    ),
  )
  const track = split
    ? h(
        'div',
        { display: 'flex', width: '100%', height: 72, border: `1px solid ${LINE}`, marginTop: 14 },
        ...segs.map((s, i) =>
          h(
            'div',
            {
              display: 'flex',
              alignItems: 'center',
              justifyContent: duel && i === 1 ? 'flex-end' : 'flex-start',
              width: `${s.pct}%`,
              height: '100%',
              backgroundColor: GAUGE_COLORS[s.tone],
              borderLeft: i ? '2px solid #FFFFFF' : 'none',
              padding: '0 14px',
              boxSizing: 'border-box',
              color: '#FFFFFF',
              fontSize: 20,
              fontWeight: 600,
            },
            s.pct >= 12 ? `${s.pct}%` : '',
          ),
        ),
      )
    : h(
        'div',
        { display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: 72, border: `1px solid ${LINE}`, marginTop: 14, backgroundColor: GAUGE_EMPTY, color: INK, fontSize: 22, fontWeight: 600 },
        o.open ? t.gaugeLocked : t.noVotesYet,
      )
  const mid = duel
    ? h(
        'div',
        { display: 'flex', width: '100%', justifyContent: 'center', marginTop: 6 },
        h('div', { display: 'flex', fontSize: 16, color: SUB, letterSpacing: 1 }, `▲ ${t.gaugeMajority.toUpperCase()}`),
      )
    : h('div', { display: 'flex', height: 6 })
  return h('div', { display: 'flex', flexDirection: 'column', width: '100%', marginTop: 24 }, head, track, mid)
}

export function ogElement(o: OgInput): El {
  const t = tr(o.lang)
  const title = o.names.join(' vs ')
  const meta = o.open ? [t.ogVerified(o.n), o.left].filter(Boolean).join(' · ') : `${t.ogFinal} · ${t.ogVerified(o.n)}`
  return h(
    'div',
    // copper rule down the left edge = the verdict banner of the Stitch result page
    { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', backgroundColor: '#FFFFFF', borderLeft: `12px solid ${ACC}`, fontFamily: SANS },
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px 18px', borderBottom: `1px solid ${LINE}` },
      h('div', { display: 'flex', fontSize: 28, fontWeight: 600, letterSpacing: 3, color: INK }, BRAND.toUpperCase()),
      o.open
        ? h('div', { display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 2, color: SUB }, (o.left || t.ogOpen).toUpperCase())
        : h('div', { display: 'flex', fontSize: 20, fontWeight: 600, letterSpacing: 2, color: '#FFFFFF', backgroundColor: ACC, padding: '6px 14px' }, 'FINAL'),
    ),
    h(
      'div',
      { display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', padding: '0 48px 8px' },
      h('div', { display: 'flex', fontSize: title.length > 60 ? 36 : 46, fontWeight: 600, letterSpacing: -1, color: INK, lineHeight: 1.15 }, title),
      gauge(o),
      h('div', { display: 'flex', fontSize: 22, color: SUB, marginTop: 10 }, meta),
    ),
    h(
      'div',
      { display: 'flex', justifyContent: 'space-between', padding: '0 48px 26px', fontSize: 20, color: SUB },
      h('div', { display: 'flex' }, t.tagline),
      h('div', { display: 'flex', fontWeight: 600, color: INK }, 'pollreal.com'),
    ),
  )
}

// Latin faces for the card (the same family the site serves itself).
const FONTS = () => [
  new GoogleFont('Inter', { name: SANS, weight: 400 }),
  new GoogleFont('Inter', { name: SANS, weight: 600 }),
]

// Hono's execution context and the library's type differ only in fields the cache does not use.
export async function renderOg(ctx: { waitUntil(p: Promise<unknown>): void }, o: OgInput): Promise<Uint8Array> {
  cache.setExecutionContext(ctx as never)
  const { image } = await render(ogElement(o) as never, { width: 1200, height: 630, fonts: FONTS() }).asPng()
  return image
}
