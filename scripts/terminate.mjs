#!/usr/bin/env node
// Terminate a member (community rules §7) — the same statements as leaving (src/lib/withdraw.ts, shared with the app).
// No permanent ban: the phone hash blocks re-joining for REJOIN_BLOCK_DAYS, then the cron releases it.
// A terminated member can no longer read notices (they are erased with the account) — tell them by e-mail if needed.
//
// Usage:  node scripts/terminate.mjs <member_id> [--local | --remote --yes] [--dry-run]
//   --local     local dev database (default)
//   --remote    production — refused without --yes (a dry run only reads)
//   --dry-run   show the member and the SQL; change nothing
import { execSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMemberId, withdrawSqlText } from '../src/lib/withdraw.ts'

const APP = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (m) => {
  console.error(`terminate: ${m}`)
  process.exit(1)
}
const argv = process.argv.slice(2)
const KNOWN = new Set(['--local', '--remote', '--yes', '--dry-run'])
const unknown = argv.filter((a) => a.startsWith('--') && !KNOWN.has(a))
if (unknown.length) fail(`unknown option(s): ${unknown.join(' ')}`)
const id = argv.find((a) => !a.startsWith('--'))
if (!id) fail('usage: node scripts/terminate.mjs <member_id> [--local | --remote --yes] [--dry-run]')
if (!isMemberId(id)) fail(`"${id}" is not a member id (12 characters, public-id alphabet)`)
const remote = argv.includes('--remote')
if (remote && argv.includes('--local')) fail('choose --local or --remote, not both')
const dryRun = argv.includes('--dry-run')
if (remote && !dryRun && !argv.includes('--yes')) fail('--remote changes PRODUCTION: add --yes to confirm (or --dry-run to look first)')

const wrangler = (args) =>
  execSync(`npx wrangler d1 execute versus-db ${remote ? '--remote' : '--local'} ${args}`, { cwd: APP, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const rows = (out) => JSON.parse(out.slice(out.indexOf('['))).flatMap((r) => r.results ?? [])

let member
try {
  member = rows(
    wrangler(
      `--json --command "SELECT id, status, (SELECT COUNT(*) FROM votes WHERE member_id = '${id}') AS votes, (SELECT COUNT(*) FROM polls WHERE member_id = '${id}') AS polls, (SELECT COUNT(*) FROM posts WHERE member_id = '${id}') AS posts FROM members WHERE id = '${id}'"`,
    ),
  )[0]
} catch (e) {
  fail(`cannot read the ${remote ? 'remote' : 'local'} database: ${String(e.stderr ?? e.message).trim().split('\n').slice(-3).join(' | ')}`)
}
if (!member) fail(`no member ${id} in the ${remote ? 'remote' : 'local'} database`)
if (member.status === 'withdrawn') fail(`member ${id} has already left or been terminated`)
console.log(`member ${id}: status ${member.status}; votes ${member.votes} and polls ${member.polls}, posts ${member.posts} stay without an author`)

const sql = withdrawSqlText(id, Date.now())
if (dryRun) {
  console.log(`\n-- dry run (${remote ? 'remote' : 'local'}), nothing changed:\n${sql}`)
  process.exit(0)
}
const file = join(mkdtempSync(join(tmpdir(), 'pollreal-terminate-')), 'terminate.sql')
writeFileSync(file, `${sql}\n`, 'utf8')
try {
  wrangler(`--file "${file}"`)
} catch (e) {
  fail(`terminate failed (D1 runs the file as one batch, so nothing partial should remain): ${String(e.stderr ?? e.message).trim().split('\n').slice(-5).join(' | ')}`)
}
const after = rows(wrangler(`--json --command "SELECT status FROM members WHERE id = '${id}'"`))[0]
console.log(`member ${id} is now ${after?.status} in ${remote ? 'REMOTE (production)' : 'local'} versus-db`)
