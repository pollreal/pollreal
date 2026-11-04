import {
  MAX_CANDIDATES,
  MAX_COMMENT,
  MAX_MAKER,
  MAX_POST_BODY,
  MAX_POST_TITLE,
  MAX_PRODUCT,
  MAX_QUESTION,
  MIN_CANDIDATES,
  isCategory,
} from '../config'
import type { Msg } from '../i18n'
import { clean, hasLink, normKey } from './text'

export type CandidateInput = { maker: string; product: string }
export type PollInput = { category: string; question: string | null; candidates: CandidateInput[] }
export type PollForm = { category: string; question: string; rows: CandidateInput[] }

// Errors are message keys (i18n.ts) so the page shows them in the visitor's language.
export type Validation = { ok: true; value: PollInput } | { ok: false; errors: Msg[]; form: PollForm }

export function validatePollForm(raw: Record<string, unknown>): Validation {
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string) : '')
  const category = clean(str('category'))
  const question = clean(str('question'))
  const rows: CandidateInput[] = []
  for (let i = 1; i <= MAX_CANDIDATES; i++) rows.push({ maker: clean(str(`maker${i}`)), product: clean(str(`product${i}`)) })
  const form: PollForm = { category, question, rows }

  const errors: Msg[] = []
  if (!isCategory(category)) errors.push({ k: 'v.category' })
  if (question.length > MAX_QUESTION) errors.push({ k: 'v.questionLong', p: [MAX_QUESTION] })
  if (hasLink(question)) errors.push({ k: 'v.link' })

  const candidates: CandidateInput[] = []
  rows.forEach((r, i) => {
    if (!r.maker && !r.product) return
    const n = i + 1
    if (!r.maker || !r.product) errors.push({ k: 'v.both', p: [n] })
    if (r.maker.length > MAX_MAKER) errors.push({ k: 'v.makerLong', p: [n, MAX_MAKER] })
    if (r.product.length > MAX_PRODUCT) errors.push({ k: 'v.productLong', p: [n, MAX_PRODUCT] })
    if (hasLink(r.maker) || hasLink(r.product)) errors.push({ k: 'v.linkIn', p: [n] })
    if (r.maker && r.product) candidates.push(r)
  })
  if (candidates.length < MIN_CANDIDATES || candidates.length > MAX_CANDIDATES) {
    errors.push({ k: 'v.count', p: [MIN_CANDIDATES, MAX_CANDIDATES] })
  }
  const keys = candidates.map((c) => normKey(c.maker, c.product))
  if (new Set(keys).size !== keys.length) errors.push({ k: 'v.dupe' })

  const seen = new Set<string>()
  const unique = errors.filter((e) => {
    const id = JSON.stringify(e)
    return seen.has(id) ? false : (seen.add(id), true)
  })
  if (unique.length) return { ok: false, errors: unique, form }
  return { ok: true, value: { category, question: question || null, candidates } }
}

// Multi-line text: keep line breaks, trim each line's trailing spaces, at most one blank line in a row.
export const cleanBody = (s: unknown) =>
  (typeof s === 'string' ? s : '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export type PostForm = { title: string; body: string }

export function validatePost(raw: Record<string, unknown>): { ok: true; value: PostForm } | { ok: false; errors: Msg[]; form: PostForm } {
  const form = { title: clean(typeof raw.title === 'string' ? raw.title : ''), body: cleanBody(raw.body) }
  const errors: Msg[] = []
  if (form.title.length < 2) errors.push({ k: 'v.titleShort' })
  if (form.title.length > MAX_POST_TITLE) errors.push({ k: 'v.titleLong', p: [MAX_POST_TITLE] })
  if (form.body.length < 2) errors.push({ k: 'v.bodyShort' })
  if (form.body.length > MAX_POST_BODY) errors.push({ k: 'v.bodyLong', p: [MAX_POST_BODY] })
  return errors.length ? { ok: false, errors, form } : { ok: true, value: form }
}

export function validateComment(raw: Record<string, unknown>): { ok: true; body: string } | { ok: false; error: Msg } {
  const body = cleanBody(raw.body)
  if (body.length < 1) return { ok: false, error: { k: 'v.commentEmpty' } }
  if (body.length > MAX_COMMENT) return { ok: false, error: { k: 'v.commentLong', p: [MAX_COMMENT] } }
  return { ok: true, body }
}
