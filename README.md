# Pollreal — a poll no AI can vote in

**One person, one vote — Pure poll. Obsessively verified.**

[pollreal.com](https://pollreal.com) is a free comparison poll: someone asks "which one should I buy?", lists 2–4
options, and verified humans vote for 24 hours. The result stays public, with an age and gender breakdown and a
plain account of how the votes were cast.

The whole point is that every vote comes from one real person. Bots, AI agents, vote farms and one person with ten
accounts should not be able to move a result. We cannot make that airtight alone, so **Pollreal is built in the
open**: you read the code, find the holes, and send fixes. The maintainer reviews what you send and ships it to
pollreal.com.

- Live site: https://pollreal.com
- Live polls and results as data: https://github.com/pollreal/polls
- Ideas and questions: [Discussions](https://github.com/pollreal/polls/discussions)

## How a vote is protected

1. **One phone number, one account.** Mobile numbers only, checked against the numbering plan; internet and virtual
   numbers are refused, and Google's SMS defense scores each sign-up. The number itself is kept only until the code
   is confirmed — after that only a keyed hash remains (`src/lib/phone.ts`).
2. **Every vote is signed with a passkey.** Fingerprint, face or screen lock at the moment of every vote; the challenge
   is single-use and bound to member, poll and candidate (`src/lib/passkey.ts`).
3. **One vote per device per poll.** A signed device token, a per-poll device fingerprint and a cap per network. All
   values are keyed hashes that include the poll id, so they never link a person across polls, and they are erased
   after 30 days (`src/lib/device.ts`).
4. **No data centres, VPNs, Tor or relays** at sign-up and voting (`src/lib/device.ts`, `src/config.ts`).
5. **Disclosure, not deletion.** Every result shows how its votes were cast: new-member share, attempts blocked at
   the door by reason, and an "under review" notice when a one-sided burst of brand-new members appears
   (`src/lib/anomaly.ts`). Votes are never silently removed.

Honest limit: someone with many real SIM cards, real phones and residential networks can still get through. The aim
is to make every fake vote expensive, and to show the traces when it happens. We never call it "impossible".

**Thresholds.** The rules are all here. The exact production numbers for SMS caps, the anomaly rule and the full
blocked-network list are not: the code ships public defaults, and production overrides them from a private setting
(`applyPrivateLimits` in `src/config.ts`). Knowing the logic should help you improve it, not tune an attack to sit
just under the line.

## Run it locally (no accounts needed)

Requires Node.js 20 or later.

```
npm install
npm run db:migrate:local     # local SQLite under .wrangler/
npm run seed                 # sample members, polls, votes and posts — local only
npm run dev                  # http://localhost:8787
```

Open **http://localhost:8787** (not 127.0.0.1): passkeys need a domain name, and `localhost` counts as one.
Development mode needs no keys at all: the SMS code is shown on the page instead of being sent, the bot check uses
Cloudflare's always-pass test keys, and headers such as `x-dev-asn` simulate a visitor's network. To try it as a
member: Sign in → "Continue with your phone number" (any valid mobile number, e.g. US (201) 555-0123) → the code shown
on the page → birth year and gender → **Create passkey** → vote.

Optional keys for local use go in `.dev.vars` (copy `.dev.vars.example`; never commit it). Without them, AI cards and
real SMS are simply off. Note: `npm run dev` binds Cloudflare Browser Rendering remotely for the AI card deep pass; if
Wrangler asks you to log in and you do not need cards, remove the `[browser]` block from your local `wrangler.toml`.

## Checks

```
npm run typecheck      # tsc --noEmit
npm test               # unit tests (vitest)
npm run smoke          # end-to-end against the running dev server with a software passkey — wipes the local DB
```

Pull requests run the type check and unit tests automatically. Please run the smoke test locally for anything that
touches sign-up, voting or results.

## Stack and layout

Cloudflare Workers + [Hono](https://hono.dev) server rendering + D1 (SQLite). No client framework; one small
first-party script. Nine interface languages.

- `src/index.tsx` — routes, JSON API, cron
- `src/config.ts` — product rules and public default thresholds
- `src/lib/` — `phone`, `passkey`, `device`, `anomaly`, `aggregate`, `ranking`, `cardgen` (AI comparison cards), `og`
  (share images), `board`, `metrics`, …
- `src/views/` — pages · `src/i18n.ts` + `src/locales/` — interface text · `src/legal/` — terms and policies
- `migrations/` — D1 schema, applied in order · `test/` — unit tests · `scripts/smoke.mjs` — end-to-end test

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Good first areas: ways to tell a real phone line from a virtual one, sharper
bot and relay detection, the anomaly rule, accessibility, and translations (eight of the nine languages were machine
translated and want native readers).

Found a way to cast fake votes? Please report it privately first — see [SECURITY.md](SECURITY.md).

## License

[GNU AGPL-3.0](LICENSE). You may run, study, change and share this code. If you run a modified version as a service,
you must offer its source to its users under the same license.

The name "Pollreal" and its logo are not covered by the code license.
