import { describe, expect, it } from 'vitest'
import { type Msg, msgText } from '../src/i18n'
import { cleanBody, validateComment, validatePollForm, validatePost } from '../src/lib/validate'

// Errors are message keys; the pages show them in the visitor's language.
const ko = (errs: Msg[]) => errs.map((e) => msgText('ko', e))
const en = (errs: Msg[]) => errs.map((e) => msgText('en', e))

describe('board validation', () => {
  it('keeps line breaks but squeezes blank runs and trailing spaces', () => {
    expect(cleanBody('첫 줄   \r\n\r\n\r\n\r\n둘째 줄  ')).toBe('첫 줄\n\n둘째 줄')
  })
  it('requires a title and body of at least two characters', () => {
    const v = validatePost({ title: 'x', body: '' })
    expect(!v.ok && ko(v.errors)).toEqual(['제목을 2자 이상 적어 주세요.', '내용을 2자 이상 적어 주세요.'])
    expect(!v.ok && en(v.errors)).toEqual(['Write a title of at least 2 characters.', 'Write at least 2 characters.'])
    expect(validatePost({ title: '키보드 후기', body: '좋아요' }).ok).toBe(true)
  })
  it('limits comment length', () => {
    const long = validateComment({ body: 'a'.repeat(1001) })
    expect(!long.ok && msgText('ko', long.error)).toBe('댓글은 1000자까지입니다.')
    expect(validateComment({ body: ' 참고할게요 ' })).toEqual({ ok: true, body: '참고할게요' })
  })
})

const base = { category: 'peripheral', maker1: '로지텍', product1: 'MX Keys S', maker2: '키크론', product2: 'K8 Pro' }

describe('validatePollForm', () => {
  it('accepts two candidates and trims the question', () => {
    const v = validatePollForm({ ...base, question: '  사무실용  조용한 키보드 ' })
    expect(v.ok).toBe(true)
    if (v.ok) {
      expect(v.value.candidates).toHaveLength(2)
      expect(v.value.question).toBe('사무실용 조용한 키보드')
    }
  })

  it('treats an empty question as none', () => {
    const v = validatePollForm(base)
    expect(v.ok && v.value.question).toBeNull()
  })

  it('rejects one candidate, half-filled rows and unknown categories', () => {
    const v = validatePollForm({ category: 'nope', maker1: '로지텍', product1: 'MX Keys S', maker2: '키크론' })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(ko(v.errors)).toContain('카테고리를 골라 주세요.')
      expect(ko(v.errors)).toContain('후보 2: 회사와 상품·서비스를 모두 적어 주세요.')
      expect(ko(v.errors)).toContain('후보는 2개에서 4개까지입니다.')
      expect(en(v.errors)).toContain('Add 2 to 4 candidates.')
      expect(v.form.rows[0]).toEqual({ maker: '로지텍', product: 'MX Keys S' })
    }
  })

  it('rejects the same product written twice in different spellings', () => {
    const v = validatePollForm({ category: 'peripheral', maker1: 'Logitech', product1: 'MX Keys', maker2: 'logitech', product2: 'mx-keys' })
    expect(!v.ok && ko(v.errors)).toContain('같은 후보가 두 번 들어갔습니다.')
  })

  it('rejects links and over-long fields', () => {
    const v = validatePollForm({ ...base, product1: 'https://example.com/item', question: 'x'.repeat(101) })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(ko(v.errors)).toContain('후보 1: 주소(링크)는 넣을 수 없습니다.')
      expect(ko(v.errors)).toContain('고민 한 줄은 100자까지입니다.')
    }
  })

  it('accepts up to four candidates', () => {
    const v = validatePollForm({ ...base, maker3: '레오폴드', product3: 'FC900R', maker4: '한성', product4: 'GK893B' })
    expect(v.ok && v.value.candidates.length).toBe(4)
  })
})
