// Passkeys (WebAuthn): created once at sign-up, used to sign in and to sign every vote. User verification
// (fingerprint, face or screen lock) is required each time; the biometric itself never leaves the device.
// Attestation is not requested: synced passkeys (iCloud Keychain, Google Password Manager) do not provide it.
import {
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { isoBase64URL } from '@simplewebauthn/server/helpers'
import { BRAND, CHALLENGE_TTL_MS } from '../config'

export type Purpose = 'register' | 'login' | 'vote' | 'add'
export type Rp = { id: string; origin: string }

export type PasskeyRow = { id: string; member_id: string; public_key: string; counter: number; transports: string | null }

async function storeChallenge(db: D1Database, challenge: string, purpose: Purpose, subject: string | null, data: unknown, now: number) {
  await db
    .prepare('INSERT INTO challenges (id, purpose, subject, data, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)')
    .bind(challenge, purpose, subject, data === undefined ? null : JSON.stringify(data), now + CHALLENGE_TTL_MS)
    .run()
}

// The challenge travels inside clientDataJSON; it is deleted on first use (no replay).
export function challengeOf(response: { response?: { clientDataJSON?: string } }): string | null {
  try {
    const json = JSON.parse(new TextDecoder().decode(isoBase64URL.toBuffer(response.response?.clientDataJSON ?? '')))
    return typeof json.challenge === 'string' && json.challenge.length <= 128 ? json.challenge : null
  } catch {
    return null
  }
}

export async function consumeChallenge(db: D1Database, challenge: string, purpose: Purpose, now: number) {
  return db
    .prepare('DELETE FROM challenges WHERE id = ?1 AND purpose = ?2 AND expires_at > ?3 RETURNING subject, data')
    .bind(challenge, purpose, now)
    .first<{ subject: string | null; data: string | null }>()
}

export const purgeChallenges = (db: D1Database, now: number) => db.prepare('DELETE FROM challenges WHERE expires_at <= ?1').bind(now).run()

export async function registrationOptions(
  db: D1Database,
  rp: Rp,
  o: { userHandle: string; userName: string; exclude: { id: string; transports: string | null }[]; purpose: 'register' | 'add'; subject: string },
  now: number,
) {
  const options = await generateRegistrationOptions({
    rpName: BRAND,
    rpID: rp.id,
    userName: o.userName,
    userDisplayName: o.userName,
    userID: isoBase64URL.toBuffer(o.userHandle),
    attestationType: 'none',
    excludeCredentials: o.exclude.map((x) => ({ id: x.id, transports: x.transports ? JSON.parse(x.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    supportedAlgorithmIDs: [-7, -257],
  })
  await storeChallenge(db, options.challenge, o.purpose, o.subject, undefined, now)
  return options
}

export type NewPasskey = { id: string; publicKey: string; counter: number; transports: string | null; aaguid: string; backedUp: boolean }

export async function verifyRegistration(rp: Rp, response: RegistrationResponseJSON, challenge: string): Promise<NewPasskey | null> {
  try {
    const v = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      requireUserVerification: true,
    })
    if (!v.verified) return null
    const { credential, aaguid, credentialBackedUp } = v.registrationInfo
    return {
      id: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports?.length ? JSON.stringify(credential.transports) : null,
      aaguid,
      backedUp: credentialBackedUp,
    }
  } catch (e) {
    console.warn('passkey registration rejected', String(e))
    return null
  }
}

export async function authenticationOptions(
  db: D1Database,
  rp: Rp,
  o: { allow: { id: string; transports: string | null }[]; purpose: 'login' | 'vote'; subject: string | null; data?: unknown },
  now: number,
) {
  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'required',
    allowCredentials: o.allow.map((x) => ({ id: x.id, transports: x.transports ? JSON.parse(x.transports) : undefined })),
  })
  await storeChallenge(db, options.challenge, o.purpose, o.subject, o.data, now)
  return options
}

export async function verifyAuthentication(rp: Rp, response: AuthenticationResponseJSON, challenge: string, key: PasskeyRow): Promise<{ counter: number } | null> {
  try {
    const v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: rp.origin,
      expectedRPID: rp.id,
      credential: {
        id: key.id,
        publicKey: isoBase64URL.toBuffer(key.public_key),
        counter: key.counter,
        transports: key.transports ? JSON.parse(key.transports) : undefined,
      },
      requireUserVerification: true,
    })
    return v.verified && v.authenticationInfo.userVerified ? { counter: v.authenticationInfo.newCounter } : null
  } catch (e) {
    console.warn('passkey assertion rejected', String(e))
    return null
  }
}

export const passkeyById = (db: D1Database, id: string) =>
  db.prepare('SELECT id, member_id, public_key, counter, transports FROM passkeys WHERE id = ?1').bind(id).first<PasskeyRow>()

export const passkeysOf = async (db: D1Database, memberId: string) =>
  (await db.prepare('SELECT id, transports FROM passkeys WHERE member_id = ?1').bind(memberId).all<{ id: string; transports: string | null }>()).results ?? []

export const insertPasskey = (db: D1Database, memberId: string, k: NewPasskey, now: number) =>
  db
    .prepare('INSERT INTO passkeys (id, member_id, public_key, counter, transports, aaguid, backed_up, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)')
    .bind(k.id, memberId, k.publicKey, k.counter, k.transports, k.aaguid, k.backedUp ? 1 : 0, now)

export const touchPasskey = (db: D1Database, id: string, counter: number, now: number) =>
  db.prepare('UPDATE passkeys SET counter = ?2, last_used_at = ?3 WHERE id = ?1').bind(id, counter, now).run()

export const randomHandle = () => isoBase64URL.fromBuffer(crypto.getRandomValues(new Uint8Array(16)))
