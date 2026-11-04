// leaving and termination share one statement list (app + scripts/terminate.mjs).
import { describe, expect, it } from 'vitest'
import { WITHDRAW_SQL, isMemberId, withdrawSqlText } from '../src/lib/withdraw'

describe('withdraw / terminate statements', () => {
  it('member ids: 12 characters of the public-id alphabet only', () => {
    expect(isMemberId('abcdefghjk23')).toBe(true)
    expect(isMemberId('abcdefghjk2')).toBe(false) // 11
    expect(isMemberId('abcdefghijk2')).toBe(false) // i is not in the alphabet
    expect(isMemberId("x' OR 1=1 --")).toBe(false)
  })

  it('writes the id and time into every statement, one per line', () => {
    const text = withdrawSqlText('abcdefghjk23', 1_700_000_000_000)
    const lines = text.split('\n')
    expect(lines).toHaveLength(WITHDRAW_SQL.length)
    expect(text).not.toContain('?1')
    expect(text).not.toContain('?2')
    expect(lines.every((l) => l.endsWith(';'))).toBe(true)
    expect(text).toContain("withdrawn_at = 1700000000000 WHERE id = 'abcdefghjk23'")
    expect(text).toContain("UPDATE votes SET member_id = NULL WHERE member_id = 'abcdefghjk23'") // votes stay, anonymous
  })

  it('refuses anything that is not a member id', () => {
    expect(() => withdrawSqlText("a'; DROP TABLE votes; --", 1)).toThrow()
    expect(() => withdrawSqlText('abcdefghjk23', Number.NaN)).toThrow()
  })
})
