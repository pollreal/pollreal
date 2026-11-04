// Deep pass, step 1: open the maker's official pages in a real headless browser (Cloudflare Browser Rendering)
// so pages that build their text with script, or load prices late, can be read. Only the visible text is kept; it is
// handed to the model as data, never as instructions.
import puppeteer from '@cloudflare/puppeteer'
import { CARD_RENDER_MAX_CHARS, CARD_RENDER_TIMEOUT_MS, CARD_RENDER_TOTAL_CHARS } from '../config'
import { hostOf } from './cardgen'

export type RenderedPage = { url: string; text: string }

// Collapse whitespace, drop empty and duplicate lines (menus repeat), cap the length.
export function cleanText(raw: string, max = CARD_RENDER_MAX_CHARS) {
  const seen = new Set<string>()
  const lines: string[] = []
  for (const l of raw.split(/\n+/)) {
    const t = l.replace(/\s+/g, ' ').trim()
    if (t.length < 2 || seen.has(t)) continue
    seen.add(t)
    lines.push(t)
  }
  const out = lines.join('\n')
  return out.length > max ? out.slice(0, max) : out
}

// Same host (www. ignored) — a page that redirects to another site is not the maker's page any more.
const sameHost = (a: string, b: string) => {
  const ha = hostOf(a)
  return !!ha && ha === hostOf(b)
}

export async function renderPages(browserBinding: Fetcher, urls: string[]): Promise<{ pages: RenderedPage[]; ms: number; error?: string }> {
  const t0 = Date.now()
  const pages: RenderedPage[] = []
  let total = 0
  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    browser = await puppeteer.launch(browserBinding)
    for (const url of urls) {
      if (total >= CARD_RENDER_TOTAL_CHARS) break
      const page = await browser.newPage()
      try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: CARD_RENDER_TIMEOUT_MS })
        const finalUrl = page.url()
        if (!sameHost(url, finalUrl)) continue
        const raw = String((await page.evaluate('document.body ? document.body.innerText : ""')) ?? '') // runs in the page
        const text = cleanText(raw, Math.min(CARD_RENDER_MAX_CHARS, CARD_RENDER_TOTAL_CHARS - total))
        if (text.length >= 200) {
          pages.push({ url: finalUrl, text })
          total += text.length
        }
      } catch {
        // one page failing (timeout, blocked) does not stop the others
      } finally {
        await page.close().catch(() => {})
      }
    }
    return { pages, ms: Date.now() - t0 }
  } catch (e) {
    return { pages, ms: Date.now() - t0, error: String(e).slice(0, 160) }
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
