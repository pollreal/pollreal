const enc = new TextEncoder()
const dec = new TextDecoder()

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)))
}

// Short public ids (poll / candidate / member). Not secrets.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
export function randomId(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let s = ''
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length]
  return s
}

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4))
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0))
}

// Session tokens: 256 random bits; only their SHA-256 is stored.
export function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let r = 0
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return r === 0
}

// Signed, short-lived payloads carried in a cookie (social identity waiting for identity verification).
export async function signPayload(secret: string, obj: unknown): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(obj)))
  return `${body}.${await hmacHex(secret, `payload:${body}`)}`
}

export async function verifyPayload<T>(secret: string, token: string | undefined): Promise<T | null> {
  if (!token) return null
  const i = token.lastIndexOf('.')
  if (i <= 0) return null
  const body = token.slice(0, i)
  const sig = token.slice(i + 1)
  if (!safeEqual(sig, await hmacHex(secret, `payload:${body}`))) return null
  try {
    return JSON.parse(dec.decode(fromB64url(body))) as T
  } catch {
    return null
  }
}
