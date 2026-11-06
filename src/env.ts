import type { Lang } from './i18n'

export type Bindings = {
  DB: D1Database
  BROWSER?: Fetcher // Cloudflare Browser Rendering — card deep pass
  APP_ENV: string
  HMAC_PEPPER?: string
  SITE_URL?: string
  // Versus-only workspace key for the AI cards. Local: app/.dev.vars, production: `wrangler secret put`.
  ANTHROPIC_API_KEY?: string
  // Bot check (step 7). Site key is public (wrangler.toml var); the secret only via `wrangler secret put` / app/.dev.vars.
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  // SMS codes: 'firebase' = Google Identity Platform with FIREBASE_API_KEY — the only sender since 2026-11-04
  // (Twilio removed). Without it production refuses sign-up; development uses a mock sender.
  SMS_PROVIDER?: string
  FIREBASE_API_KEY?: string
  // Maker verification email. Without them production refuses claims; development shows the link on screen.
  RESEND_API_KEY?: string
  // Maker claim + campaign links: off unless "1" (operator 2026-11-04 — the button is removed; `npm run dev` turns it on for tests)
  MAKER_CLAIMS?: string
  EMAIL_FROM?: string
  // Pre-launch gate (house rule): while PRELAUNCH = "1" the public sees only a holding page; the operator and the maintainer
  // open the real site through /preview/<PREVIEW_KEY> (secret), which sets a 30-day cookie. Removed at launch.
  PRELAUNCH?: string
  PREVIEW_KEY?: string
  // Operator alert mail (operator 2026-11-04): Cloudflare Email Routing binding + its verified destination (wrangler.toml)
  ALERT_MAIL?: SendEmail
  ALERT_TO?: string
  // Open development (2026-11-05): production-only values kept out of the public code.
  PRIVATE_LIMITS?: string // JSON — abuse thresholds and the full blocked-network list (src/config.ts applyPrivateLimits)
  OPERATOR?: string // JSON — { rep: {en,ko}, address: {en,ko} } shown in the legal documents
  // Operator key-check probe (/ops/key-check): one cheap real call per external key, statuses only, never values.
  OPS_KEY?: string
}

export type Member = {
  id: string
  provider: string
  birth_year: number
  gender: 'M' | 'F'
  nickname: string | null
  status: string
  suspended_until: number | null // ms epoch while status = 'suspended'; the suspension ends there on its own
  created_at: number
  phone_country: string | null
  lang: string
  invite_code: string | null
}

export type Variables = { member: Member | null; lang: Lang }

export type AppEnv = { Bindings: Bindings; Variables: Variables }

export const isDev = (env: Bindings) => env.APP_ENV === 'development'

const DEV_PEPPER = 'dev-only-pepper--not-a-secret--never-used-in-production'

// Key for every stored hash (phone number, device values, signed cookies). Production refuses to run without it.
export function pepperOf(env: Bindings): string {
  if (env.HMAC_PEPPER && env.HMAC_PEPPER.length >= 32) return env.HMAC_PEPPER
  if (isDev(env)) return DEV_PEPPER
  throw new Error('HMAC_PEPPER is not configured')
}
