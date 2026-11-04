// Bot check (step 7): Cloudflare Turnstile on sign-up, voting and poll creation.
// The widget (their script, the only third-party script on the site) puts a one-time token in the form as
// `cf-turnstile-response`; the server checks it with Siteverify before doing anything. Tokens are single-use and valid
// for 300 s. Production without keys refuses (fail closed, like HMAC_PEPPER); development without keys uses
// Cloudflare's always-pass test keys so the whole flow still runs.
import { TURNSTILE_TEST_SECRET, TURNSTILE_TEST_SITE_KEY, TURNSTILE_TIMEOUT_MS, TURNSTILE_VERIFY_URL } from '../config'
import { type Bindings, isDev } from '../env'

export type BotAction = 'phone' | 'new_poll'

export type BotKeys = { siteKey: string; secret: string; test: boolean }

export const TOKEN_FIELD = 'cf-turnstile-response'
const PROBE_TOKEN = 'preview-check-dummy-token'

export function botKeys(env: Bindings): BotKeys | null {
  // Trimmed: a secret pasted with a trailing newline passes form-encoded Siteverify but fails the JSON one (2026-11-02).
  const secret = env.TURNSTILE_SECRET_KEY?.trim()
  if (env.TURNSTILE_SITE_KEY && secret) return { siteKey: env.TURNSTILE_SITE_KEY.trim(), secret, test: false }
  // Development: test site key; a test secret in .dev.vars (e.g. the always-fail one) still applies.
  if (isDev(env)) return { siteKey: TURNSTILE_TEST_SITE_KEY, secret: secret || TURNSTILE_TEST_SECRET, test: true }
  return null
}

export type BotResult = { ok: true } | { ok: false; reason: 'not_configured' | 'missing' | 'rejected' | 'spent' | 'unavailable'; codes?: string[] }

type Siteverify = { success?: boolean; hostname?: string; action?: string; 'error-codes'?: string[] }

export async function verifyBot(
  env: Bindings,
  form: Record<string, unknown>,
  o: { action: BotAction; ip?: string | null; host: string; fetcher?: typeof fetch },
): Promise<BotResult> {
  const keys = botKeys(env)
  if (!keys) return { ok: false, reason: 'not_configured' }
  const token = typeof form[TOKEN_FIELD] === 'string' ? form[TOKEN_FIELD] : ''
  if (!token || token.length > 2048) return { ok: false, reason: 'missing' }
  const doFetch = o.fetcher ?? fetch
  const body = new URLSearchParams({ secret: keys.secret, response: token, idempotency_key: crypto.randomUUID() })
  if (o.ip) body.set('remoteip', o.ip)
  // One retry on a network or server error; the idempotency key makes the retry safe.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let data: Siteverify
    try {
      const res = await doFetch(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body,
        signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
      })
      if (res.status >= 500) throw new Error(`siteverify ${res.status}`)
      data = (await res.json()) as Siteverify
    } catch (e) {
      if (attempt === 2) {
        console.warn('turnstile: siteverify unavailable', String(e))
        return { ok: false, reason: 'unavailable' }
      }
      continue
    }
    if (!data.success) {
      const codes = data['error-codes'] ?? []
      if (codes.includes('internal-error')) {
        if (attempt === 1) continue
        return { ok: false, reason: 'unavailable' }
      }
      // A used or expired token: usually a double submit whose first request already went through.
      if (codes.includes('timeout-or-duplicate')) return { ok: false, reason: 'spent' }
      if (form[TOKEN_FIELD] !== PROBE_TOKEN) console.warn('turnstile: rejected', o.action, JSON.stringify(codes))
      return { ok: false, reason: 'rejected', codes }
    }
    // Test keys answer with sample values; real keys must match the form's action and our own host.
    if (!keys.test && (data.action !== o.action || data.hostname !== o.host)) {
      console.warn('turnstile: mismatch', JSON.stringify({ want: [o.action, o.host], got: [data.action, data.hostname] }))
      return { ok: false, reason: 'rejected' }
    }
    return { ok: true }
  }
  return { ok: false, reason: 'unavailable' }
}

// Launch probe: the same Siteverify call the forms make, with a dummy token. A valid secret answers
// "invalid-input-response"; a wrong one "invalid-input-secret".
export async function probeSecret(env: Bindings): Promise<string> {
  const keys = botKeys(env)
  if (!keys || keys.test) return 'no secret'
  const r = await verifyBot(env, { [TOKEN_FIELD]: PROBE_TOKEN }, { action: 'phone', host: '' })
  if (r.ok) return 'unexpected: accepted'
  const codes = r.codes ?? []
  return codes.includes('invalid-input-secret') ? 'SECRET REJECTED' : codes.includes('invalid-input-response') ? 'ok' : `unexpected: ${r.reason} ${codes.join(',')}`
}
