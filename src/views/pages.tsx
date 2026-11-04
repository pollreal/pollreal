import { CARD_DEEP_MAX_ATTEMPTS, CARD_MAX_ATTEMPTS, CATEGORIES, CATEGORY_GROUPS, MAX_CANDIDATES, REPORT_REASON_KEYS } from '../config'
import type { Member } from '../env'
import { type Lang, type Msg, href, tr } from '../i18n'
import type { Group, Tally } from '../lib/aggregate'
import type { PostRow } from '../lib/board'
import type { CandRow, CardRow, Composition, PollRow, PollSummary } from '../lib/db'
import { type Seg, segments, standing } from '../lib/gauge'
import { candidateName, pollTitle } from '../lib/text'
import { dayText, remainingParts, whenText } from '../lib/time'
import type { PollForm } from '../lib/validate'
import { LEGAL as LEGAL_EN, LEGAL_KEYS, type LegalDoc, type LegalKey } from '../legal/en'
import { LEGAL as LEGAL_KO } from '../legal/ko'
import { PostList } from './board'
import { BotCheck, Errors, Status, loginPath, pollPath, reportPath } from './common'

export { pollPath } from './common'

export const catLabel = (lang: Lang, slug: string) => tr(lang).cat[slug] ?? slug

function remaining(lang: Lang, closesAt: number, now: number) {
  const r = remainingParts(closesAt, now)
  return r ? tr(lang).remaining(r.h, r.m) : tr(lang).closed
}

// ---- lists ----

export function PollList(p: { lang: Lang; polls: PollSummary[]; now: number; empty: string }) {
  const t = tr(p.lang)
  if (!p.polls.length) return <p class="empty">{p.empty}</p>
  return (
    <ul class="polls">
      {p.polls.map((poll) => {
        const open = poll.status === 'open' && poll.closes_at > p.now
        return (
          <li>
            <a href={pollPath(poll, p.lang)}>
              <span class="row1">
                <span class="tags">
                  <span class="cat">{catLabel(p.lang, poll.category)}</span>
                  {poll.is_seed ? <span class="badge">{t.seedBadge}</span> : ''}
                </span>
                <span class={open ? 'live' : 'done'}>{open ? remaining(p.lang, poll.closes_at, p.now) : t.closed}</span>
              </span>
              <strong>{pollTitle(poll.candidates)}</strong>
              <span class="meta">{t.votesCount(poll.votes)}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

export function HomePage(p: { lang: Lang; open: PollSummary[]; closed: PollSummary[]; posts: PostRow[]; now: number }) {
  const t = tr(p.lang)
  return (
    <>
      <section class="hero">
        <p class="eyebrow hero-tag">{t.tagline}</p>
        <HeroTitle text={t.heroTitle} />
        <p>{t.heroSub}</p>
        <p class="hero-actions">
          <a class="btn" href={href(p.lang, '/new')}>
            {t.heroCreate}
          </a>
          <a class="btn ghost" href={href(p.lang, '/board')}>
            {t.heroBoard}
          </a>
        </p>
      </section>
      <div class="cats">
        <SearchBox lang={p.lang} q="" />
        <CategoryNav lang={p.lang} heading={false} />
      </div>
      <div class="ledger">
        <section>
          <h2>{t.closingSoon}</h2>
          <PollList lang={p.lang} polls={p.open} now={p.now} empty={t.noOpen} />
        </section>
        <section>
          <h2>{t.recentResults}</h2>
          <PollList lang={p.lang} polls={p.closed} now={p.now} empty={t.noClosed} />
        </section>
      </div>
      <section class="home-board">
        <h2>
          {t.board}{' '}
          <a class="more" href={href(p.lang, '/board')}>
            {t.more}
          </a>
        </h2>
        <PostList lang={p.lang} posts={p.posts} empty={t.noPosts} />
      </section>
    </>
  )
}

// The headline's first sentence, then the rest on its own line (italic in Latin and Cyrillic scripts — Stitch hero).
function HeroTitle(p: { text: string }) {
  const m = p.text.match(/^(.+?[?？])\s*(.+)$/)
  if (!m) return <h1>{p.text}</h1>
  return (
    <h1>
      {m[1]} <span class="em">{m[2]}</span>
    </h1>
  )
}

export function CategoryNav(p: { lang: Lang; heading?: boolean }) {
  const t = tr(p.lang)
  return (
    <section aria-label={t.categories}>
      {p.heading !== false && <h2>{t.categories}</h2>}
      {CATEGORY_GROUPS.map((g) => (
        <div class="catrow">
          <h3 class="group">{g === 'ai' ? t.groupAi : g === 'software' ? t.groupSoftware : g === 'premium' ? t.groupPremium : t.groupProduct}</h3>
          <p class="chips">
            {CATEGORIES.filter((c) => c.group === g).map((c) => (
              <a href={href(p.lang, `/c/${c.slug}`)}>{catLabel(p.lang, c.slug)}</a>
            ))}
          </p>
        </div>
      ))}
    </section>
  )
}

export function SearchBox(p: { lang: Lang; q: string }) {
  const t = tr(p.lang)
  return (
    <form class="search" method="get" action={href(p.lang, '/search')}>
      <input type="search" name="q" value={p.q} placeholder={t.searchPlaceholder} maxlength={60} />
      <button type="submit">{t.searchButton}</button>
    </form>
  )
}

export function ListPage(p: { lang: Lang; heading: string; open: PollSummary[]; closed: PollSummary[]; now: number; q?: string }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{p.heading}</h1>
      {p.q !== undefined && <SearchBox lang={p.lang} q={p.q} />}
      <div class="ledger">
        <section>
          <h2>{t.running}</h2>
          <PollList lang={p.lang} polls={p.open} now={p.now} empty={t.noOpen} />
        </section>
        <section>
          <h2>{t.results}</h2>
          <PollList lang={p.lang} polls={p.closed} now={p.now} empty={t.noClosed} />
        </section>
      </div>
    </>
  )
}

// ---- AI comparison card ----

type Spec = { label: string; value: string }
type CardSummary = { specs?: Spec[]; notes?: string[]; ko?: { specs?: Spec[]; notes?: string[] } }
type CardSource = { title: string; url: string; official?: boolean }

const parse = <T,>(s: string | null, fallback: T): T => {
  try {
    return s ? (JSON.parse(s) as T) : fallback
  } catch {
    return fallback
  }
}

// Maker identification icon (operator 2026-11-04): the maker site's own icon served from /icon/<domain>, else a letter badge.
export function Logo(p: { domain?: string; name: string }) {
  if (p.domain) return <img class="mlogo" src={`/icon/${p.domain}`} alt="" width="20" height="20" loading="lazy" decoding="async" />
  const letter = [...p.name.trim()][0]?.toUpperCase() ?? '?'
  return (
    <span class="mlogo letter" aria-hidden="true">
      {letter}
    </span>
  )
}

export function CardView(p: { lang: Lang; card: CardRow | undefined; live: boolean; autoRefresh: boolean; path: string }) {
  const t = tr(p.lang)
  const card = p.card
  if (!card || card.status !== 'ready') {
    // same rule as isGenerating in src/lib/cards.ts (first pass, or the deep pass queued after it)
    const searching = p.live && !!card && card.status === 'pending' && (card.attempts < CARD_MAX_ATTEMPTS || (card.deep_state === 1 && card.deep_attempts < CARD_DEEP_MAX_ATTEMPTS))
    const message = card?.status === 'failed' ? t.cardFailed : searching ? (p.autoRefresh ? t.cardSearchingAuto : t.cardSearching) : t.cardPending
    const manual = searching && !p.autoRefresh && card?.status === 'pending'
    return (
      <div class="card pending">
        <span class="ai">{t.aiCard}</span>
        <p class="muted">
          {message}
          {manual && (
            <>
              {' '}
              <a href={p.path}>{t.refresh}</a>
            </>
          )}
        </p>
      </div>
    )
  }
  const summary = parse<CardSummary>(card.summary_json, {})
  // Korean pages use the Korean translation when the card has one; English is the source.
  const local = p.lang === 'ko' && summary.ko?.specs?.length ? summary.ko : summary
  const specs = local.specs ?? []
  const notes = (p.lang === 'ko' && summary.ko?.specs?.length ? summary.ko.notes : summary.notes) ?? []
  const sources = parse<CardSource[]>(card.sources_json, [])
  const officialLink = card.official_url ?? sources.find((s) => s.official)?.url
  // Closed by default (operator 2026-11-04): the next candidate must stay in view; the AI label and the official link stay
  // visible in the summary line (rule 3), the specs open on a tap.
  return (
    <details class="card">
      <summary class="card-head">
        <span class="ai">{t.cardHead}</span>
        <span class="card-tools">
          {officialLink ? (
            <a class="official" href={officialLink} rel="nofollow noopener noreferrer" target="_blank">
              {t.officialPage}
            </a>
          ) : (
            ''
          )}
          <span class="toggle">
            <span class="more">{t.cardMore}</span>
            <span class="less">{t.cardLess}</span>
          </span>
        </span>
      </summary>
      {card.product_title && <p class="ptitle">{card.product_title}</p>}
      {!card.official_source && <p class="warn small">{t.notOfficial}</p>}
      {specs.length ? (
        <dl class="specs">
          {specs.map((s) => (
            <>
              <dt>{s.label}</dt>
              <dd>{s.value}</dd>
            </>
          ))}
        </dl>
      ) : (
        ''
      )}
      {notes.length ? (
        <ul class="notes">
          {notes.map((n) => (
            <li>{n}</li>
          ))}
        </ul>
      ) : (
        ''
      )}
      {sources.length ? (
        <p class="sources">
          {t.sources}{' '}
          {sources.map((s, i) => (
            <>
              {i ? ' · ' : ''}
              <a href={s.url} rel="nofollow noopener noreferrer" target="_blank">
                {s.title}
              </a>
              {s.official ? t.officialMark : ''}
            </>
          ))}
        </p>
      ) : (
        ''
      )}
      <p class="note">{card.checked_at ? t.checkedOn(dayText(p.lang, card.checked_at)) : ''}</p>
    </details>
  )
}

// ---- poll / result ----

// Contest gauge (Stitch v0.3): one bar, candidate order fixed, the leader in copper, a 2px white seam between segments,
// "You" under the member's own segment, a 0–100 scale with the 50 mark for head-to-head polls. `live` = the page script
// refreshes it from /api/tally while the poll is open.
export function Gauge(p: { lang: Lang; candidates: CandRow[]; tally: Tally; myChoice: string | null; live?: { pollId: string } }) {
  const t = tr(p.lang)
  const segs: Seg[] = segments(
    p.candidates.map((c) => c.id),
    p.candidates.map(candidateName),
    p.tally,
    p.myChoice,
  )
  const duel = segs.length === 2
  const mine = segs.find((x) => x.mine)
  return (
    <div class={`gauge${duel ? ' duel' : ''}`} data-gauge={p.live?.pollId ?? ''} data-lang={p.lang} style={`--cols:${segs.length}`}>
      <div class="g-head">
        {segs.map((x) => (
          <div class={`g-cand${x.lead ? ' lead' : ''}`} data-cand={x.id}>
            <span class="g-name">
              {x.name}
              {x.mine ? <span class="g-tag you">{t.gaugeYou}</span> : ''}
              {x.lead ? <span class="g-tag lead">{p.live ? t.gaugeLead : t.first}</span> : ''}
            </span>
            <b class="g-pct" data-pct>
              {x.pct}%
            </b>
            <span class="g-votes" data-votes>
              {t.votesShort(x.count)}
            </span>
          </div>
        ))}
      </div>
      <div class="g-track" role="img" aria-label={segs.map((x) => `${x.name} ${x.pct}%`).join(', ')}>
        {segs.map((x) => (
          <span class={`g-seg ${x.tone}`} data-seg={x.id} style={`width:${p.tally.n ? x.pct : 100 / segs.length}%`}>
            <span class="g-in">{p.tally.n && x.pct >= 9 ? `${x.pct}%` : ''}</span>
          </span>
        ))}
      </div>
      <div class="g-marks">
        {mine && p.tally.n ? (
          <span class="g-you" data-you={mine.id} style={`left:${mine.from + mine.pct / 2}%`}>
            {t.gaugeYou}
          </span>
        ) : (
          ''
        )}
      </div>
      <div class="g-scale" aria-hidden="true">
        <span>0</span>
        <span>25</span>
        <span class="mid">{duel ? t.gaugeMajority : '50'}</span>
        <span>75</span>
        <span>100</span>
      </div>
    </div>
  )
}

// After voting, while the poll is open: where the member's pick stands, and a one-tap rally. The message is put together
// for this member's page only (pages are never cached) and is not stored anywhere.
export type SideShare = { url: string; title: string; left: string }

function SidePanel(p: { lang: Lang; candidates: CandRow[]; tally: Tally; myChoice: string; share: SideShare; pollId: string }) {
  const t = tr(p.lang)
  const st = standing(
    p.candidates.map((c) => c.id),
    p.candidates.map(candidateName),
    p.tally,
    p.myChoice,
  )
  if (!st) return <></>
  const gap = t.votesShort(st.margin)
  const line =
    st.kind === 'behind'
      ? t.sideBehind(st.mine, gap, st.versus, p.share.left)
      : st.kind === 'lead'
        ? t.sideLead(st.mine, gap, st.versus, p.share.left)
        : t.sideTied(st.mine, st.versus, p.share.left)
  const text =
    st.kind === 'behind'
      ? t.shareBehind(st.mine, p.share.title, p.share.left)
      : st.kind === 'lead'
        ? t.shareLead(st.mine, p.share.title, p.share.left)
        : t.shareTied(st.mine, p.share.title, p.share.left)
  const x = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(p.share.url)}`
  return (
    <section class={`side ${st.kind}`} data-share-poll={p.pollId}>
      <p class="side-line">{line}</p>
      <p class="actions">
        <button type="button" data-webshare={p.share.url} data-text={text} data-copy={`${text} ${p.share.url}`} data-copied={t.copied} data-share-click>
          {st.kind === 'lead' ? t.sideDefend : t.sideRally}
        </button>
        <a class="btn ghost" href={x} target="_blank" rel="noopener" data-share-click>
          {t.shareX}
        </a>
        <button type="button" class="ghost" data-copy={`${text} ${p.share.url}`} data-copied={t.copied} data-share-click>
          {t.shareCopy}
        </button>
      </p>
      <p class="note">{t.sideAnon}</p>
    </section>
  )
}

function GroupTable(p: { lang: Lang; title: string; groups: Group[]; labels: Record<string, string>; candidates: CandRow[] }) {
  const t = tr(p.lang)
  return (
    <table class="groups">
      <caption>{p.title}</caption>
      <thead>
        <tr>
          <th scope="col">{t.group}</th>
          {p.candidates.map((c) => (
            <th scope="col">{c.product}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {p.groups.map((g) => (
          <tr>
            <th scope="row">{p.labels[g.key] ?? g.key}</th>
            {g.suppressed ? (
              <td colspan={p.candidates.length} class="muted">
                {t.tooFew}
              </td>
            ) : (
              g.shares.map((s) => {
                const top = Math.max(...g.shares.map((x) => x.pct))
                return <td class={s.pct === top && top > 0 ? 'top' : ''}>{s.pct}%</td>
              })
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function verdict(lang: Lang, candidates: CandRow[], tl: Tally) {
  const t = tr(lang)
  if (!tl.n) return t.noVotesYet
  const name = new Map(candidates.map((c) => [c.id, candidateName(c)]))
  if (tl.leaders.length > 1) return t.tie(tl.leaders.map((id) => name.get(id)).join(', '))
  const lead = tl.overall.find((s) => s.candidateId === tl.leaders[0])
  return t.verdict(tl.n, name.get(tl.leaders[0] ?? '') ?? '', lead?.pct ?? 0)
}

const pct = (part: number, whole: number) => (whole ? Math.round((part * 1000) / whole) / 10 : 0)

export function CompositionLine(p: { lang: Lang; comp: Composition }) {
  const t = tr(p.lang)
  const c = p.comp
  const blocked = c.refusals.device + c.refusals.fingerprint + c.refusals.network_cap + c.refusals.network
  return (
    <div class="composition">
      <p class="note">
        <strong>{t.composition}</strong> · {t.nVoted(c.n)} · {t.compNew(pct(c.newMembers, c.n))}
        {c.maker ? (
          <>
            {' · '}
            {t.compMaker(c.maker, pct(c.maker, c.n))} ({c.makers.map((m) => t.compMakerOne(m.maker, m.n)).join(', ')})
          </>
        ) : (
          ''
        )}
        {blocked ? (
          <>
            {' · '}
            {t.compBlocked(blocked)} ({t.compBlockedWhy(c.refusals.device + c.refusals.fingerprint, c.refusals.network_cap, c.refusals.network)})
          </>
        ) : (
          ''
        )}
      </p>
    </div>
  )
}

function Results(p: { lang: Lang; candidates: CandRow[]; tally: Tally; final: boolean; comp: Composition; myChoice: string | null; pollId: string }) {
  const t = tr(p.lang)
  return (
    <section class="results" id="result">
      <h2>{p.final ? t.finalResult : t.interimResult}</h2>
      <p class="verdict">{verdict(p.lang, p.candidates, p.tally)}</p>
      <p class="meta">{t.nVoted(p.tally.n)}</p>
      <Gauge lang={p.lang} candidates={p.candidates} tally={p.tally} myChoice={p.myChoice} live={p.final ? undefined : { pollId: p.pollId }} />
      {p.tally.n > 0 && (
        <>
          <div class="tables">
            <GroupTable lang={p.lang} title={t.byGender} groups={p.tally.byGender} labels={t.gender} candidates={p.candidates} />
            <GroupTable lang={p.lang} title={t.byAge} groups={p.tally.byAge} labels={t.age} candidates={p.candidates} />
          </div>
          <p class="note">{t.smallCellNote}</p>
        </>
      )}
      <CompositionLine lang={p.lang} comp={p.comp} />
    </section>
  )
}

function reviewText(lang: Lang, note: string) {
  const t = tr(lang)
  if (note === 'surge') return t.reviewSurge
  if (note === 'reports') return t.reviewReports
  return t.reviewOther(note)
}

export type ShareInfo = { url: string; embedCode: string; text: string; badges: { label: string; code: string }[]; side: SideShare }

function ShareBox(p: { lang: Lang; pollId: string; share: ShareInfo }) {
  const t = tr(p.lang)
  const x = `https://x.com/intent/post?text=${encodeURIComponent(p.share.text)}&url=${encodeURIComponent(p.share.url)}`
  const threads = `https://www.threads.net/intent/post?text=${encodeURIComponent(`${p.share.text} ${p.share.url}`)}`
  return (
    <section class="share" data-share-poll={p.pollId}>
      <h2>{t.share}</h2>
      <p class="actions">
        <a class="btn ghost" href={x} target="_blank" rel="noopener" data-share-click>
          {t.shareX}
        </a>
        <a class="btn ghost" href={threads} target="_blank" rel="noopener" data-share-click>
          {t.shareThreads}
        </a>
        <button type="button" class="ghost" data-copy={p.share.url} data-copied={t.copied} data-share-click>
          {t.shareCopy}
        </button>
      </p>
      <details>
        <summary>{t.embed}</summary>
        <p class="note">{t.embedHelp}</p>
        <textarea class="code" rows={3} readonly>
          {p.share.embedCode}
        </textarea>
        <button type="button" class="ghost" data-copy={p.share.embedCode} data-copied={t.copied}>
          {t.embedCopy}
        </button>
      </details>
      <details>
        <summary>{t.badge}</summary>
        <p class="note">{t.badgeHelp}</p>
        <ul class="badges">
          {p.share.badges.map((b) => (
            <li>
              <span>{b.label}</span>
              <code>{b.code}</code>
              <button type="button" class="ghost" data-copy={b.code} data-copied={t.copied}>
                {t.shareCopy}
              </button>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}

export function PollPage(p: {
  lang: Lang
  poll: PollRow
  candidates: CandRow[]
  cards: Map<string, CardRow>
  tally: Tally | null
  comp: Composition | null
  open: boolean
  now: number
  member: Member | null
  myChoice: string | null
  path: string
  flash?: string
  cardsLive: boolean
  autoRefresh: boolean
  deviceToken: string | null
  share: ShareInfo
  campaigns: { maker: string; url: string }[]
  claimable: Set<string>
  icons?: Map<string, string>
}) {
  const t = tr(p.lang)
  const { poll } = p
  const mine = p.candidates.find((c) => c.id === p.myChoice)
  const canVote = p.open && !p.myChoice && !!p.member
  return (
    <>
      <p class="crumb">
        <a href={href(p.lang, `/c/${poll.category}`)}>{catLabel(p.lang, poll.category)}</a>
        {poll.is_seed ? <span class="badge">{t.seedBadgeLong}</span> : ''}
      </p>
      <h1>{pollTitle(p.candidates)}</h1>
      {poll.question && <p class="question">“{poll.question}”</p>}
      <div class="statusbar">
        <span class={p.open ? 'live' : 'done'}>{p.open ? t.liveFor(remaining(p.lang, poll.closes_at, p.now)) : t.closedAt(whenText(p.lang, poll.closes_at))}</span>
        {p.open && <span class="sign">{t.passkeyPrompt}</span>}
      </div>
      {poll.review_note && <p class="warn">{reviewText(p.lang, poll.review_note)}</p>}
      {p.flash && <p class="flash">{p.flash}</p>}
      {mine && (
        <p class="flash">
          {t.myVote(candidateName(mine))}
          {p.open ? t.myVoteLocked : ''}
        </p>
      )}

      {p.tally && p.comp && (
        <Results lang={p.lang} candidates={p.candidates} tally={p.tally} final={!p.open} comp={p.comp} myChoice={p.myChoice} pollId={poll.id} />
      )}
      {p.open && p.tally && p.myChoice && (
        <SidePanel lang={p.lang} candidates={p.candidates} tally={p.tally} myChoice={p.myChoice} share={p.share.side} pollId={poll.id} />
      )}

      <h2>{t.compare}</h2>
      {canVote && (
        <div
          id="vote"
          class="voteform"
          data-poll={poll.id}
          data-dt={p.deviceToken ?? ''}
          data-msg-prompt={t.passkeyPrompt}
          data-msg-cancelled={t.refuse.passkey}
          data-msg-unsupported={t.passkeyUnsupported}
        >
          <noscript>
            <p class="warn">{t.votingNeedsJs}</p>
          </noscript>
          <Status />
        </div>
      )}
      <ol class="candidates">
        {p.candidates.map((c, i) => (
          <li>
            <div class="c-head">
              <span class="eyebrow">{t.candidate(i + 1)}</span>
              <h3 class="with-logo">
                <Logo domain={c.card_id ? p.icons?.get(c.card_id) : undefined} name={c.maker} />
                <span>{candidateName(c)}</span>
              </h3>
            </div>
            <div class="c-body">
              {c.interest_note && <p class="interest">{c.interest_note}</p>}
              <CardView lang={p.lang} card={c.card_id ? p.cards.get(c.card_id) : undefined} live={p.cardsLive} autoRefresh={p.autoRefresh} path={p.path} />
              {(canVote || (p.open && !p.member)) && (
                <div class="c-foot">
                  {canVote && (
                    <button type="button" data-vote={c.id} disabled>
                      {t.vote} →
                    </button>
                  )}
                  {p.open && !p.member && (
                    <a class="btn ghost" href={loginPath(p.lang, p.path)}>
                      {t.signInToVote}
                    </a>
                  )}
                </div>
              )}
              {c.card_id && p.claimable.has(c.card_id) && (
                <p class="note maker">
                  {t.makerAsk} <a href={href(p.lang, `/maker/claim/${c.card_id}`)}>{t.makerClaim}</a>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!p.tally && <p class="note">{t.resultAfterVote}</p>}
      {p.campaigns.length ? (
        <section class="campaign">
          <p class="note">{t.makerCampaign}</p>
          {p.campaigns.map((cp) => (
            <p>
              <strong>{cp.maker}</strong> <code>{cp.url}</code>{' '}
              <button type="button" class="ghost" data-copy={cp.url} data-copied={t.copied}>
                {t.shareCopy}
              </button>
            </p>
          ))}
        </section>
      ) : (
        ''
      )}
      <ShareBox lang={p.lang} pollId={poll.id} share={p.share} />
      <p class="note">
        {t.pollFooter}
        <a href={href(p.lang, '/board')}>{t.board}</a>
        {t.pollFooter2} · <a href={reportPath(p.lang, 'poll', poll.id)}>{t.report}</a>
      </p>
    </>
  )
}

// ---- create ----

export function NewPollPage(p: { lang: Lang; form?: PollForm; errors?: Msg[]; botSiteKey: string | null }) {
  const t = tr(p.lang)
  const f = p.form
  const rows = Array.from({ length: MAX_CANDIDATES }, (_, i) => f?.rows[i] ?? { maker: '', product: '' })
  return (
    <>
      <h1>{t.createTitle}</h1>
      <Errors lang={p.lang} errors={p.errors} />
      <form method="post" action={href(p.lang, '/new')} class="stack">
        <label>
          {t.category}
          <select name="category" required>
            <option value="">{t.choose}</option>
            {CATEGORY_GROUPS.map((g) => (
              <optgroup label={g === 'ai' ? t.groupAi : g === 'software' ? t.groupSoftware : g === 'premium' ? t.groupPremium : t.groupProduct}>
                {CATEGORIES.filter((c) => c.group === g).map((c) => (
                  <option value={c.slug} selected={f?.category === c.slug}>
                    {catLabel(p.lang, c.slug)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {rows.map((r, i) => (
          <fieldset>
            <legend>
              {t.candidate(i + 1)}
              {i >= 2 ? t.optional : ''}
            </legend>
            <input name={`maker${i + 1}`} value={r.maker} placeholder={t.makerPh} maxlength={40} required={i < 2} />
            <input name={`product${i + 1}`} value={r.product} placeholder={t.productPh} maxlength={80} required={i < 2} />
          </fieldset>
        ))}
        <label>
          {t.question}
          <input name="question" value={f?.question ?? ''} maxlength={100} placeholder={t.questionPh} />
        </label>
        <p class="note">{t.createNote}</p>
        <BotCheck siteKey={p.botSiteKey} action="new_poll" lang={p.lang} />
        <button type="submit">{t.submit}</button>
      </form>
    </>
  )
}

// ---- reports ----

export function ReportPage(p: { lang: Lang; type: string; id: string; error?: string }) {
  const t = tr(p.lang)
  return (
    <>
      <h1>{t.reportTitle}</h1>
      {p.error && <p class="warn">{p.error}</p>}
      <form method="post" action={href(p.lang, '/report')} class="stack">
        <input type="hidden" name="type" value={p.type} />
        <input type="hidden" name="id" value={p.id} />
        <fieldset>
          <legend>{t.reason}</legend>
          {REPORT_REASON_KEYS.map((key, i) => (
            <label class="row">
              <input type="radio" name="reason" value={key} required={i === 0} /> {t.reasons[key]}
            </label>
          ))}
        </fieldset>
        <label>
          {t.reportDetail}
          <textarea name="detail" rows={4} maxlength={1000}></textarea>
        </label>
        <p class="note">{t.reportNote}</p>
        <button type="submit">{t.reportSubmit}</button>
      </form>
    </>
  )
}

export function MessagePage(p: { heading: string; message: string; link?: { href: string; label: string }; extra?: unknown }) {
  return (
    <>
      <h1>{p.heading}</h1>
      <p>{p.message}</p>
      {p.extra ?? ''}
      {p.link && (
        <p>
          <a class="btn" href={p.link.href}>
            {p.link.label}
          </a>
        </p>
      )}
    </>
  )
}

// ---- legal documents: English is authoritative, Korean is a faithful translation, every other language shows
// the English text with a one-line notice. Drafts until a lawyer has reviewed them (the design notes).

function LegalBody(p: { doc: LegalDoc }) {
  return (
    <>
      <p class="version">{p.doc.version}</p>
      {p.doc.intro.map((x) => (
        <p>{x}</p>
      ))}
      {p.doc.sections.map((s) => (
        <section>
          <h2>{s.heading}</h2>
          {(s.paras ?? []).map((x) => (
            <p>{x}</p>
          ))}
          {s.bullets?.length ? (
            <ul>
              {s.bullets.map((x) => (
                <li>{x}</li>
              ))}
            </ul>
          ) : (
            ''
          )}
          {s.table ? (
            <table>
              <thead>
                <tr>
                  {s.table.head.map((h) => (
                    <th scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.table.rows.map((r) => (
                  <tr>
                    {r.map((cell) => (
                      <td>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            ''
          )}
          {(s.after ?? []).map((x) => (
            <p>{x}</p>
          ))}
        </section>
      ))}
    </>
  )
}

export function DocPage(p: { lang: Lang; slug: LegalKey }) {
  const t = tr(p.lang)
  const doc = (p.lang === 'ko' ? LEGAL_KO : LEGAL_EN)[p.slug]
  return (
    <article class="legal" lang={p.lang === 'ko' ? 'ko' : 'en'}>
      <h1>{doc.title}</h1>
      {p.lang !== 'en' && p.lang !== 'ko' ? (
        <p class="warn" lang={p.lang}>
          {t.docEnglishOnly}
        </p>
      ) : (
        ''
      )}
      <LegalBody doc={doc} />
      <nav class="docnav" aria-label={t.docs[p.slug] ?? p.slug}>
        {LEGAL_KEYS.filter((k) => k !== p.slug).map((k) => (
          <a href={href(p.lang, `/${k}`)}>{t.docs[k] ?? k}</a>
        ))}
      </nav>
    </article>
  )
}

