// Rankings (Stitch v0.4): a hub of category cards (top 3 with a forest plot each) and a category table — rank,
// product, score, 95% range drawn on one shared scale so overlaps show at a glance, votes, rivals, poll record — with a
// "not ranked yet" queue and the method note. Stitch's invented audit panel and figures are not used.
import { CATEGORIES, CATEGORY_GROUPS, RANK_HALF_LIFE_DAYS, RANK_MIN_RIVALS, RANK_MIN_VOTES } from '../config'
import { type Lang, href, tr } from '../i18n'
import type { RankMeta, RankRow } from '../lib/ranking'
import { Logo, catLabel } from './pages'

export type StoredRank = RankRow & { shared: number | boolean }

const num = (lang: Lang, n: number) => new Intl.NumberFormat(lang).format(Math.round(n))

// One horizontal scale for a set of rows, rounded out to 50 points.
function scaleOf(rows: StoredRank[]) {
  if (!rows.length) return { min: 950, max: 1050 }
  const min = Math.floor(Math.min(...rows.map((r) => r.lo)) / 50) * 50
  const max = Math.ceil(Math.max(...rows.map((r) => r.hi)) / 50) * 50
  return { min, max: max > min ? max : min + 100 }
}
const at = (s: { min: number; max: number }, x: number) => Math.min(100, Math.max(0, ((x - s.min) * 100) / (s.max - s.min)))

function Forest(p: { row: StoredRank; scale: { min: number; max: number }; top?: boolean }) {
  const a = at(p.scale, p.row.lo)
  const b = at(p.scale, p.row.hi)
  return (
    <span class="fp" aria-hidden="true">
      {p.scale.min < 1000 && p.scale.max > 1000 ? <span class="fp-base" style={`left:${at(p.scale, 1000)}%`}></span> : ''}
      <span class="fp-line" style={`left:${a}%;width:${Math.max(b - a, 0.5)}%`}></span>
      <span class={`fp-dot${p.top ? ' top' : ''}`} style={`left:${at(p.scale, p.row.score)}%`}></span>
    </span>
  )
}

// Every category, grouped like the home page, so any ranking is one tap away (operator 2026-11-02). `on` = the open one.
function RankNav(p: { lang: Lang; on: string | null }) {
  const t = tr(p.lang)
  const link = (path: string, label: string, on: boolean) => (
    <a href={href(p.lang, path)} class={on ? 'on' : undefined} aria-current={on ? 'page' : undefined}>
      {label}
    </a>
  )
  return (
    <nav class="rank-nav" aria-label={t.categories}>
      <p class="chips">{link('/rank', t.rankAllCats, p.on === null)}</p>
      {CATEGORY_GROUPS.map((g) => (
        <div class="catrow">
          <h3 class="group">{g === 'ai' ? t.groupAi : g === 'software' ? t.groupSoftware : g === 'premium' ? t.groupPremium : t.groupProduct}</h3>
          <p class="chips">{CATEGORIES.filter((c) => c.group === g).map((c) => link(`/rank/${c.slug}`, catLabel(p.lang, c.slug), p.on === c.slug))}</p>
        </div>
      ))}
    </nav>
  )
}

const rankText = (r: StoredRank) => `${r.shared ? '=' : ''}${r.rank}`
const search = (lang: Lang, name: string) => href(lang, `/search?q=${encodeURIComponent(name)}`)

function Method(p: { lang: Lang }) {
  const t = tr(p.lang)
  return (
    <aside class="rank-how">
      <h2>{t.rankHowTitle}</h2>
      {t.rankHow(RANK_MIN_VOTES, RANK_MIN_RIVALS, RANK_HALF_LIFE_DAYS).map((x) => (
        <p>{x}</p>
      ))}
      <p>
        <a href="https://github.com/pollreal/polls/discussions/1" target="_blank" rel="noopener">
          {t.rankDiscuss} →
        </a>
      </p>
    </aside>
  )
}

// Top 10 over every category (operator 2026-11-02). Scores come from separate per-category fits, so the note says so.
function TopTen(p: { lang: Lang; rows: StoredRank[]; icons?: Map<string, string> }) {
  const t = tr(p.lang)
  const top = p.rows
    .filter((r) => r.rank !== null)
    .sort((a, b) => b.score - a.score || b.votes - a.votes)
    .slice(0, 10)
  if (!top.length) return null
  return (
    <section class="rank-top">
      <h2>{t.rankTopTitle}</h2>
      <div class="rank-table-wrap">
        <table class="rank-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t.rankCol.product}</th>
              <th scope="col">{t.categories}</th>
              <th scope="col" class="r">
                {t.rankCol.score}
              </th>
              <th scope="col" class="r">
                {t.rankCol.votes}
              </th>
            </tr>
          </thead>
          <tbody>
            {top.map((r, i) => (
              <tr class={i === 0 ? 'first' : ''}>
                <td class="rk">{i + 1}</td>
                <td class="nm">
                  <a class="with-logo" href={search(p.lang, r.name)}>
                    <Logo domain={r.card_id ? p.icons?.get(r.card_id) : undefined} name={r.name} />
                    <span>{r.name}</span>
                  </a>
                </td>
                <td>
                  <a href={href(p.lang, `/rank/${r.category}`)}>{catLabel(p.lang, r.category)}</a>
                </td>
                <td class="r sc">{num(p.lang, r.score)}</td>
                <td class="r">{num(p.lang, r.votes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p class="note">{t.rankTopNote}</p>
      </div>
    </section>
  )
}

export function RankHubPage(p: { lang: Lang; meta: RankMeta[]; rows: StoredRank[]; icons?: Map<string, string> }) {
  const t = tr(p.lang)
  const byCat = new Map<string, StoredRank[]>()
  for (const r of p.rows) byCat.set(r.category, [...(byCat.get(r.category) ?? []), r])
  const metaOf = new Map(p.meta.map((m) => [m.category, m]))
  const cats = CATEGORIES.filter((c) => metaOf.has(c.slug))
  return (
    <>
      <p class="eyebrow">Bradley–Terry · {t.rankCol.range}</p>
      <h1>{t.rankTitle}</h1>
      <p class="lede">{t.rankSub}</p>
      <TopTen lang={p.lang} rows={p.rows} icons={p.icons} />
      <RankNav lang={p.lang} on={null} />
      {!cats.length && <p class="empty">{t.rankEmpty}</p>}
      <div class="rank-grid">
        {cats.map((c) => {
          const m = metaOf.get(c.slug) as RankMeta
          const rows = byCat.get(c.slug) ?? []
          const top = rows.filter((r) => r.rank !== null).slice(0, 3)
          const queue = rows
            .filter((r) => r.rank === null)
            .sort((a, b) => b.votes - a.votes)
            .slice(0, 3)
          const scale = scaleOf(top)
          return (
            <section class={`rank-card${top.length ? '' : ' muted'}`}>
              <header>
                <span class="label">{catLabel(p.lang, c.slug)}</span>
                <span class="n">{top.length ? `n = ${num(p.lang, m.votes)}` : t.rankCollecting}</span>
              </header>
              {top.length ? (
                <ol class="rank-mini">
                  {top.map((r, i) => (
                    <li>
                      <span class="rk">{rankText(r)}</span>
                      <a class="nm with-logo" href={search(p.lang, r.name)}>
                        <Logo domain={r.card_id ? p.icons?.get(r.card_id) : undefined} name={r.name} />
                        <span>{r.name}</span>
                      </a>
                      <b class="sc">{num(p.lang, r.score)}</b>
                      <Forest row={r} scale={scale} top={i === 0} />
                    </li>
                  ))}
                </ol>
              ) : (
                <ul class="rank-queue">
                  {queue.map((r) => (
                    <li>
                      <span class="nm">{r.name}</span>
                      <span class="pg">{t.rankNeeds(num(p.lang, r.votes), num(p.lang, RANK_MIN_VOTES), r.rivals, RANK_MIN_RIVALS)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <footer>
                <span class="note">{t.rankReady(m.ranked, m.items)}</span>
                <a href={href(p.lang, `/rank/${c.slug}`)}>{t.rankFull} →</a>
              </footer>
            </section>
          )
        })}
      </div>
      <Method lang={p.lang} />
    </>
  )
}

export function RankCategoryPage(p: { lang: Lang; category: string; meta: RankMeta | null; rows: StoredRank[]; icons?: Map<string, string> }) {
  const t = tr(p.lang)
  const label = catLabel(p.lang, p.category)
  const ranked = p.rows.filter((r) => r.rank !== null)
  const queue = p.rows.filter((r) => r.rank === null).sort((a, b) => b.votes - a.votes)
  const scale = scaleOf(ranked)
  const ticks: number[] = []
  const step = scale.max - scale.min > 300 ? 100 : 50
  for (let x = scale.min; x <= scale.max; x += step) ticks.push(x)
  return (
    <>
      <p class="crumb">
        <a href={href(p.lang, '/rank')}>{t.rankTitle}</a> / {label}
      </p>
      <h1>{t.rankCatTitle(label)}</h1>
      <RankNav lang={p.lang} on={p.category} />
      {p.meta ? <p class="meta">{t.rankMeta(num(p.lang, p.meta.ranked), num(p.lang, p.meta.votes))}</p> : <p class="empty">{t.rankNone}</p>}
      <div class="rank-layout">
        <div>
          {ranked.length ? (
            <div class="rank-table-wrap">
              <table class="rank-table">
                <thead>
                  <tr>
                    <th scope="col">{t.rankCol.rank}</th>
                    <th scope="col">{t.rankCol.product}</th>
                    <th scope="col" class="r">
                      {t.rankCol.score}
                    </th>
                    <th scope="col" class="fp-col">
                      <span>{t.rankCol.range}</span>
                      <span class="ticks" aria-hidden="true">
                        {ticks.map((x) => (
                          <span style={`left:${at(scale, x)}%`}>{x}</span>
                        ))}
                      </span>
                    </th>
                    <th scope="col" class="r">
                      {t.rankCol.votes}
                    </th>
                    <th scope="col" class="r">
                      {t.rankCol.rivals}
                    </th>
                    <th scope="col">{t.rankCol.record}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranked.map((r, i) => (
                    <tr class={r.rank === 1 ? 'first' : ''}>
                      <td class="rk" title={r.shared ? t.rankShared : undefined}>
                        {rankText(r)}
                      </td>
                      <td class="nm">
                        <a class="with-logo" href={search(p.lang, r.name)}>
                          <Logo domain={r.card_id ? p.icons?.get(r.card_id) : undefined} name={r.name} />
                          <span>{r.name}</span>
                        </a>
                      </td>
                      <td class="r sc">{num(p.lang, r.score)}</td>
                      <td class="fp-col">
                        <Forest row={r} scale={scale} top={i === 0} />
                        <span class="fp-nums">
                          {num(p.lang, r.lo)}–{num(p.lang, r.hi)}
                        </span>
                      </td>
                      <td class="r">{num(p.lang, r.votes)}</td>
                      <td class="r">{r.rivals}</td>
                      <td class="rec">{t.rankRecord(r.wins, r.losses, r.ties)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p class="note">{t.rankScaleNote}</p>
            </div>
          ) : (
            ''
          )}
          {queue.length ? (
            <section class="rank-wait">
              <h2>{t.rankNotYet}</h2>
              <ul>
                {queue.map((r) => (
                  <li>
                    <span class="nm">{r.name}</span>
                    <span class="pg">{t.rankNeeds(num(p.lang, r.votes), num(p.lang, RANK_MIN_VOTES), r.rivals, RANK_MIN_RIVALS)}</span>
                    <span class="bar" aria-hidden="true">
                      <span style={`width:${Math.min(100, (r.votes * 100) / RANK_MIN_VOTES)}%`}></span>
                    </span>
                    <span class="rec">{t.rankRecord(r.wins, r.losses, r.ties)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            ''
          )}
        </div>
        <Method lang={p.lang} />
      </div>
    </>
  )
}
