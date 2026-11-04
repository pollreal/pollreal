import { AGE_BANDS, GENDERS, MIN_CELL } from '../config'

export type Cell = { candidate_id: string; age_band: string; gender: string; c: number }
export type Share = { candidateId: string; count: number; pct: number }
// Group labels are added by the page in the visitor's language (i18n.ts gender/age tables).
export type Group = { key: string; n: number; suppressed: boolean; shares: Share[] }
export type Tally = { n: number; overall: Share[]; byGender: Group[]; byAge: Group[]; leaders: string[] }

const round1 = (x: number) => Math.round(x * 10) / 10

function shares(candidateIds: string[], counts: Map<string, number>, n: number): Share[] {
  return candidateIds.map((id) => {
    const count = counts.get(id) ?? 0
    return { candidateId: id, count, pct: n ? round1((count * 100) / n) : 0 }
  })
}

// Small groups reveal individual choices, so a group under `minCell` is hidden.
// Overall shares are always public, so hidden votes could be recovered by subtraction (overall − visible groups);
// keep hiding the smallest visible group until the hidden votes are 0 or at least `minCell`.
function suppress(groups: Group[], minCell: number): Group[] {
  for (const g of groups) g.suppressed = g.n < minCell
  for (;;) {
    const hidden = groups.filter((g) => g.suppressed).reduce((s, g) => s + g.n, 0)
    if (hidden === 0 || hidden >= minCell) break
    const next = groups.filter((g) => !g.suppressed && g.n > 0).sort((a, b) => a.n - b.n)[0]
    if (!next) break
    next.suppressed = true
  }
  for (const g of groups) if (g.suppressed) g.shares = []
  return groups
}

function dimension(
  keys: readonly string[],
  pick: (c: Cell) => string,
  candidateIds: string[],
  cells: Cell[],
  minCell: number,
): Group[] {
  const groups = keys.map((key) => {
    const counts = new Map<string, number>()
    let n = 0
    for (const c of cells) {
      if (pick(c) !== key) continue
      counts.set(c.candidate_id, (counts.get(c.candidate_id) ?? 0) + c.c)
      n += c.c
    }
    return { key, n, suppressed: false, shares: shares(candidateIds, counts, n) }
  })
  return suppress(groups, minCell)
}

export function tally(candidateIds: string[], cells: Cell[], minCell = MIN_CELL): Tally {
  const valid = cells.filter((c) => candidateIds.includes(c.candidate_id))
  const counts = new Map<string, number>()
  let n = 0
  for (const c of valid) {
    counts.set(c.candidate_id, (counts.get(c.candidate_id) ?? 0) + c.c)
    n += c.c
  }
  const overall = shares(candidateIds, counts, n)
  const top = Math.max(0, ...overall.map((s) => s.count))
  return {
    n,
    overall,
    byGender: dimension(GENDERS, (c) => c.gender, candidateIds, valid, minCell),
    byAge: dimension(AGE_BANDS, (c) => c.age_band, candidateIds, valid, minCell),
    leaders: n ? overall.filter((s) => s.count === top).map((s) => s.candidateId) : [],
  }
}
