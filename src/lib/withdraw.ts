// Leaving and termination are one path (community rules §7 — no permanent ban): votes stay as anonymous counts, authored
// polls/posts/comments stay public without an author, sign-in and contact data are erased, and the phone hash stays
// for REJOIN_BLOCK_DAYS (the cron releases it). One list of statements, used by the app (db.withdrawMember) and by the
// operator script (scripts/terminate.mjs): they used to be two copies (code + README SQL).
// ?1 = member id, ?2 = now (ms). No Worker-only imports here: Node runs this file directly for the script.

export const WITHDRAW_SQL = [
  'UPDATE votes SET member_id = NULL WHERE member_id = ?1',
  'UPDATE polls SET member_id = NULL WHERE member_id = ?1',
  'UPDATE posts SET member_id = NULL WHERE member_id = ?1',
  'UPDATE comments SET member_id = NULL WHERE member_id = ?1',
  'DELETE FROM sessions WHERE member_id = ?1',
  'DELETE FROM passkeys WHERE member_id = ?1',
  'DELETE FROM notices WHERE member_id = ?1',
  "UPDATE maker_claims SET status = 'revoked', email_hash = '' WHERE member_id = ?1",
  'UPDATE members SET invited_by = NULL WHERE invited_by = ?1',
  `UPDATE members SET status = 'withdrawn', suspended_until = NULL, provider_uid_hash = NULL, birth_year = NULL, gender = NULL, nickname = NULL,
     phone_country = NULL, invite_code = NULL, user_handle = NULL, invited_by = NULL, withdrawn_at = ?2 WHERE id = ?1`,
] as const

// Member ids are randomId(12) from the public-id alphabet (src/lib/crypto.ts).
export const isMemberId = (s: string) => /^[a-hjkmnp-z2-9]{12}$/.test(s)

// The same statements with the values written in, for `wrangler d1 execute --file` (the id is checked first, so it
// cannot carry SQL).
export function withdrawSqlText(memberId: string, now: number) {
  if (!isMemberId(memberId)) throw new Error(`not a member id: ${memberId}`)
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error('bad time')
  return WITHDRAW_SQL.map((s) => `${s.replaceAll('?1', `'${memberId}'`).replaceAll('?2', String(now)).replace(/\s+/g, ' ')};`).join('\n')
}
