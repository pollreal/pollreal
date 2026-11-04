// Operator alerts by mail (operator 2026-11-04: when the daily SMS cap is reached, tell the operator by mail). Sent through
// Cloudflare Email Routing's Worker binding (ALERT_MAIL) to the verified destination in wrangler.toml — no third-party
// mail service. One mail per kind per KST day (alerts table). Without the binding (local tests) nothing is sent.
import { OTP_CAPS } from '../config'
import type { Bindings } from '../env'

const FROM = 'alerts@pollreal.com'
const KST = 9 * 3600_000
const DAY = 86400_000
const kstDay = (now: number) => new Date(now + KST).toISOString().slice(0, 10)
const kstTime = (now: number) => new Date(now + KST).toISOString().slice(0, 16).replace('T', ' ')

const b64 = (s: string) => {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

export function mime(o: { from: string; to: string; subject: string; text: string; now: number }): string {
  const body = b64(o.text).replace(/.{76}/g, '$&\r\n')
  return [
    `From: Pollreal <${o.from}>`,
    `To: ${o.to}`,
    `Subject: =?UTF-8?B?${b64(o.subject)}?=`,
    `Date: ${new Date(o.now).toUTCString()}`,
    `Message-ID: <${o.now}.${Math.random().toString(36).slice(2)}@pollreal.com>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
    '',
  ].join('\r\n')
}

async function sendOnce(env: Bindings, kind: string, now: number, subject: string, text: string): Promise<'sent' | 'already' | 'off' | 'failed'> {
  const mail = env.ALERT_MAIL
  const to = env.ALERT_TO
  if (!mail || !to) return 'off'
  const first = await env.DB.prepare('INSERT OR IGNORE INTO alerts (kind, day, sent_at, detail) VALUES (?1, ?2, ?3, ?4) RETURNING kind')
    .bind(kind, kstDay(now), now, subject)
    .first()
  if (!first) return 'already'
  try {
    const { EmailMessage } = await import('cloudflare:email')
    await mail.send(new EmailMessage(FROM, to, mime({ from: FROM, to, subject, text, now })))
    return 'sent'
  } catch (e) {
    console.error('alert mail failed', e)
    // let a later attempt the same day try again
    await env.DB.prepare('DELETE FROM alerts WHERE kind = ?1 AND day = ?2').bind(kind, kstDay(now)).run()
    return 'failed'
  }
}

// Delivery check from the preview (launch checklist): one test mail per day.
export const sendTest = (env: Bindings, now: number) =>
  sendOnce(env, 'test', now, '[Pollreal] 알림 메일 시험', `Pollreal 알림 메일 시험입니다 (${kstTime(now)} KST).\n가입 문자 하루 상한에 닿으면 이 주소로 같은 형식의 알림이 옵니다.`)

// A sign-up was refused by a daily cap (not a per-number / per-network-hour limit): say which cap and how full it is.
export async function otpCapReached(env: Bindings, country: string, now: number) {
  const n = await env.DB.prepare(
    `SELECT (SELECT COUNT(*) FROM otp_log WHERE outcome = 'sent' AND created_at >= ?1) AS site,
            (SELECT COUNT(*) FROM otp_log WHERE substr(country, 1, 2) = substr(?2, 1, 2) AND outcome = 'sent' AND created_at >= ?1) AS nation,
            (SELECT COUNT(*) FROM otp_log WHERE country = ?2 AND outcome = 'sent' AND created_at >= ?1) AS net`,
  )
    .bind(now - DAY, country)
    .first<{ site: number; nation: number; net: number }>()
  if (!n) return
  const cc = country.slice(0, 2)
  const which =
    n.site >= OTP_CAPS.daily
      ? { kind: 'otp_cap_site', label: '사이트 전체', used: n.site, cap: OTP_CAPS.daily, key: 'PRIVATE_LIMITS otp.daily' }
      : n.nation >= OTP_CAPS.country
        ? { kind: `otp_cap_country_${cc}`, label: `나라 ${cc}`, used: n.nation, cap: OTP_CAPS.country, key: 'PRIVATE_LIMITS otp.country' }
        : n.net >= OTP_CAPS.asn
          ? { kind: `otp_cap_net_${country}`, label: `통신망 ${country}`, used: n.net, cap: OTP_CAPS.asn, key: 'PRIVATE_LIMITS otp.asn' }
          : null
  if (!which) return
  const subject = `[Pollreal] 가입 문자 하루 상한 도달 — ${which.label} ${which.used}/${which.cap}`
  const text = [
    '가입 문자 인증이 하루 상한에 닿아 새 가입이 지금 막히고 있습니다.',
    '',
    `- 걸린 상한: ${which.label} (최근 24시간 ${which.used}건 / 상한 ${which.cap}건)`,
    `- 시각: ${kstTime(now)} KST`,
    '- 막힌 사람은 "잠시 뒤 다시 시도" 안내를 받습니다. 24시간이 지나며 먼저 보낸 순서대로 다시 열립니다.',
    '',
    `상한을 올리려면 Claude Code(Versus 폴더) 세션에 "문자 상한 N건으로 올려"라고 지시하시면 됩니다 (설정 이름 ${which.key}).`,
    '건당 비용: 한국·미국 0.01달러, 일본 0.03달러, 유럽 0.04~0.10달러, 그 밖 최대 0.45달러.',
    '',
    '같은 상한에 대한 알림은 하루 한 번만 보냅니다.',
  ].join('\n')
  return sendOnce(env, which.kind, now, subject, text)
}
