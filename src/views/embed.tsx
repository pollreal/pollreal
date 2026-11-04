// Embed widget: a tiny script-free page other sites put in an iframe. Running polls show the candidates and how
// many verified humans voted (interim percentages stay for voters); closed polls show the result. Links carry
// ?via=embed so votes that arrive through embeds are counted as such.
import { BRAND } from '../config'
import { type Lang, tr } from '../i18n'
import type { Tally } from '../lib/aggregate'
import { GAUGE_COLORS, segments } from '../lib/gauge'

// Stitch design tokens: copper #A95228 accent, slate #525357 for the other bars, 1 px #D5D8DF rules; one gothic family.
const CSS = `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-wght-normal.woff2) format("woff2-variations");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+2212}
*{box-sizing:border-box}body{margin:0;font:14px/1.5 "Inter Variable",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Apple SD Gothic Neo","Malgun Gothic","Hiragino Sans","PingFang SC","Microsoft YaHei","Noto Sans",sans-serif;color:#000;background:#fff}
.w{border:1px solid #D5D8DF;border-left:4px solid #A95228;padding:14px 16px;max-width:560px}
.b{display:flex;justify-content:space-between;align-items:center;margin:0 0 8px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#515256}
.b strong{color:#000;font-size:13px;font-weight:700;letter-spacing:.08em}h1{font-size:18px;line-height:1.3;font-weight:600;letter-spacing:-.01em;margin:0 0 10px}
.hd{display:flex;justify-content:space-between;gap:8px;margin:0 0 6px}.hd div{display:flex;flex-direction:column;min-width:0}.hd div:last-child{text-align:right}.hd.multi div:last-child{text-align:left}.nm{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pc{font-size:22px;line-height:1.1;font-weight:600;font-variant-numeric:tabular-nums}.lead .pc{color:#A95228}.tr{display:flex;height:18px;border:1px solid #D5D8DF}.tr span{display:block;height:100%}.tr span+span{border-left:2px solid #fff}.lk{display:flex;align-items:center;justify-content:center;height:30px;border:1px solid #D5D8DF;background:#E7D8C9;font-size:12px;font-weight:600}.mt{margin:6px 0 0;font-size:12px;color:#515256}a.v{display:inline-block;margin-top:10px;background:#A95228;color:#fff;text-decoration:none;padding:8px 16px;border-radius:2px;font-size:11px;font-weight:500;letter-spacing:.06em;text-transform:uppercase}a.v:hover{background:#8F441F}
.c{margin:4px 0;color:#000}`

export function EmbedPage(p: { lang: Lang; title: string; names: string[]; ids: string[]; open: boolean; n: number; tally: Tally | null; left?: string; link: string }) {
  const t = tr(p.lang)
  const segs = segments(p.ids, p.names, p.tally)
  return (
    <html lang={p.lang}>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{`${p.title} | ${BRAND}`}</title>
        <style>{CSS}</style>
      </head>
      <body>
        <div class="w">
          <p class="b">
            <strong>{BRAND}</strong>
            <span>{p.open ? t.embedSoFar(p.n) : t.ogVerified(p.n)}</span>
          </p>
          <h1>{p.title}</h1>
          {p.tally && p.tally.n ? (
            <>
              <div class={`hd${segs.length > 2 ? ' multi' : ''}`}>
                {segs.map((x) => (
                  <div class={x.lead ? 'lead' : ''}>
                    <span class="nm">{x.name}</span>
                    <span class="pc">{x.pct}%</span>
                  </div>
                ))}
              </div>
              <div class="tr" role="img" aria-label={segs.map((x) => `${x.name} ${x.pct}%`).join(', ')}>
                {segs.map((x) => (
                  <span style={`width:${x.pct}%;background:${GAUGE_COLORS[x.tone]}`}></span>
                ))}
              </div>
            </>
          ) : (
            <>
              {p.names.map((n) => (
                <p class="c">• {n}</p>
              ))}
              {p.open && <div class="lk">{t.gaugeLocked}</div>}
            </>
          )}
          {p.open && p.left ? <p class="mt">{p.left}</p> : ''}
          <a class="v" href={p.link} target="_blank" rel="noopener">
            {p.open ? t.embedVoteNow : t.ogFinal}
          </a>
        </div>
      </body>
    </html>
  )
}
