// Copies the self-hosted web font (Stitch design, one gothic family: Inter; Korean and other scripts use the
// system gothic) from the npm package into public/fonts/, which Cloudflare serves as static files ([assets] in wrangler.toml).
// Self-hosted on purpose: loading Google Fonts from visitors' browsers sends their IP address to Google (EU risk).
// Run after `npm install` when a font package is updated:  node scripts/copy-fonts.mjs
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'public', 'fonts')
mkdirSync(out, { recursive: true })

const SUBSETS = ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext']
const files = SUBSETS.map((s) => ['inter', `inter-${s}-wght-normal.woff2`])
for (const [pkg, file] of files) copyFileSync(join(root, 'node_modules', '@fontsource-variable', pkg, 'files', file), join(out, file))
// SIL Open Font License: the licence travels with the font files.
copyFileSync(join(root, 'node_modules', '@fontsource-variable', 'inter', 'LICENSE'), join(out, 'LICENSE-Inter.txt'))
console.log(`copied ${files.length} font files to ${out}`)
