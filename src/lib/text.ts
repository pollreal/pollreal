export const clean = (s: string | undefined | null) => (s ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()

export const hasLink = (s: string) => /https?:\/\/|www\.|\.(com|net|kr|co|io)\b\//i.test(s)

// Brand alias table (2026-11-02): the same maker or product written in another language or form maps to one
// key, so '로지텍 MX Keys' and 'Logitech MX Keys' share one AI card and one ranking row. Targets are the compact
// English form the key already uses (so existing English keys do not change). Makers match whole names; product words
// match whole space-separated words ('그램' maps, '프로그램' does not).
export const MAKER_ALIASES: Record<string, string> = {
  삼성: 'samsung', 삼성전자: 'samsung', samsungelectronics: 'samsung',
  엘지: 'lg', lg전자: 'lg', 엘지전자: 'lg', lgelectronics: 'lg',
  애플: 'apple', 구글: 'google', 마이크로소프트: 'microsoft', ms: 'microsoft', 메타: 'meta', 아마존: 'amazon',
  로지텍: 'logitech', 소니: 'sony', 다이슨: 'dyson', 샤오미: 'xiaomi', 레노버: 'lenovo', 에이수스: 'asus', 아수스: 'asus',
  델: 'dell', 에이치피: 'hp', 보스: 'bose', 젠하이저: 'sennheiser', 키크론: 'keychron', 로보락: 'roborock',
  아이로봇: 'irobot', 에코백스: 'ecovacs', 엔비디아: 'nvidia', 인텔: 'intel', 퀄컴: 'qualcomm',
  오픈ai: 'openai', 오픈에이아이: 'openai', 앤트로픽: 'anthropic', 앤스로픽: 'anthropic', 퍼플렉시티: 'perplexity',
  미드저니: 'midjourney', 깃허브: 'github', 노션: 'notion', 캔바: 'canva', 어도비: 'adobe', 딥시크: 'deepseek',
  미스트랄: 'mistralai', mistral: 'mistralai', 일레븐랩스: 'elevenlabs', 런웨이: 'runway', 수노: 'suno', 젠스파크: 'genspark',
  googledeepmind: 'google', deepmind: 'google', metaai: 'meta', microsoftcorporation: 'microsoft', appleinc: 'apple',
}
export const PRODUCT_WORD_ALIASES: Record<string, string> = {
  챗gpt: 'chatgpt', 챗지피티: 'chatgpt', 클로드: 'claude', 제미나이: 'gemini', 제미니: 'gemini', 코파일럿: 'copilot',
  갤럭시: 'galaxy', 아이폰: 'iphone', 아이패드: 'ipad', 맥북: 'macbook', 에어팟: 'airpods', 그램: 'gram',
  퍼플렉시티: 'perplexity', 미드저니: 'midjourney', 커서: 'cursor', 그록: 'grok', 라마: 'llama',
}

// Same product written differently ("Logitech MX-Keys" / "logitech mx keys" /) -> same key -> shared
// AI card and ranking row.
export function normKey(maker: string, product: string): string {
  const f = (x: string) => x.normalize('NFKC').toLowerCase().replace(/[\s\-_.·,()/[\]]+/g, '')
  const m = f(maker)
  const words = product
    .normalize('NFKC')
    .toLowerCase()
    .split(/\s+/)
    .map((w) => PRODUCT_WORD_ALIASES[w] ?? w)
    .join(' ')
  return `${MAKER_ALIASES[m] ?? m}|${f(words)}`
}

// URL slug "a-vs-b" from product names; Korean letters stay as they are.
export function slugOf(products: string[]): string {
  const part = (p: string) =>
    p
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
  let s = products.map(part).filter(Boolean).join('-vs-')
  if (s.length > 80) s = Array.from(s).slice(0, 80).join('').replace(/-+$/, '') // by code point: never split a character
  return s || 'poll'
}

// "Perplexity Perplexity" -> "Perplexity": the maker is left out when the product name already starts with it.
export const candidateName = (c: { maker: string; product: string }) =>
  c.product.toLowerCase().startsWith(c.maker.toLowerCase()) ? c.product : `${c.maker} ${c.product}`

export const pollTitle = (cands: { maker: string; product: string }[]) => cands.map(candidateName).join(' vs ')
