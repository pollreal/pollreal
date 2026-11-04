import { kstParts } from './time'

// Exact age in full years (만 나이) on the KST calendar day of `now`. Returns null for an invalid YYYYMMDD.
export function ageFromBirthDate(birth: string, now: number): number | null {
  if (!/^\d{8}$/.test(birth)) return null
  const y = Number(birth.slice(0, 4))
  const m = Number(birth.slice(4, 6))
  const d = Number(birth.slice(6, 8))
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  const t = kstParts(now)
  let age = t.y - y
  if (t.m < m || (t.m === m && t.d < d)) age -= 1
  return age
}

// Statistical band from birth year only (the only date we keep): 10 | 20 | 30 | 40 | 50 | 60(+).
export function ageBand(birthYear: number, refYear: number): string {
  const a = refYear - birthYear
  if (a < 20) return '10'
  if (a >= 60) return '60'
  return String(Math.floor(a / 10) * 10)
}
