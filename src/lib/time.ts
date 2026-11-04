export const KST_OFFSET_MS = 9 * 60 * 60 * 1000

export const isOpen = (p: { status: string; closes_at: number }, now: number) => p.status === 'open' && p.closes_at > now

// Hours and minutes left (ceil to the minute); null once closed.
export function remainingParts(closesAt: number, now: number): { h: number; m: number } | null {
  const ms = closesAt - now
  if (ms <= 0) return null
  const minutes = Math.ceil(ms / 60000)
  return { h: Math.floor(minutes / 60), m: minutes % 60 }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function kstParts(t: number) {
  const d = new Date(t + KST_OFFSET_MS)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }
}

export const kstYear = (t: number) => kstParts(t).y

export function kstDateText(t: number): string {
  const p = kstParts(t)
  return `${p.y}.${pad(p.m)}.${pad(p.d)} ${pad(p.hh)}:${pad(p.mm)}`
}

export const isoDate = (t: number) => new Date(t).toISOString()

// Korean pages show Korea time; English pages show UTC with the zone written out (server-rendered, no visitor zone).
export function whenText(lang: string, t: number): string {
  if (lang === 'ko') return kstDateText(t)
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

export const dayText = (lang: string, t: number) => whenText(lang, t).slice(0, 10)
