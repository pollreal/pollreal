// Product rules: polls, the global edition (design v0.2) and every other number here is a setting the operator can change.
// Abuse thresholds are public defaults; production overrides them from the PRIVATE_LIMITS secret (applyPrivateLimits).

// Service name. One place: titles, header, result images, embeds.
export const BRAND = 'Pollreal' // (2026-10-29): Breal dropped — BeReal trademark risk

// Naver Search Advisor ownership file (2026-11-03): the file name Naver hands out, e.g. 'naver0123abcd….html'.
// Served at /<file> with Naver's fixed body, even while the pre-launch lock is on, and allowed in the locked robots.txt.
export const NAVER_SITE_VERIFICATION_FILE = 'naver0781cc61933f6a59effb428414d02c1a.html'

export const POLL_DURATION_MS = 24 * 60 * 60 * 1000
export const MIN_CANDIDATES = 2
export const MAX_CANDIDATES = 4
export const MAX_MAKER = 40
export const MAX_PRODUCT = 80
export const MAX_QUESTION = 100
export const DAILY_POLL_LIMIT = 5
// A demographic group with fewer votes than this is hidden (anonymity, house rule).
export const MIN_CELL = 5

// Contest gauge (2026-11-01, Stitch v0.3). While a poll is open its split is shown only to members who already voted
// (design v0.1 §4, inherited). true = the live split is public everywhere (page, share image, embed, README badge).
export const INTERIM_PUBLIC = false
// README badges show a split only from this many votes; below it they say "voting" (a 7-vote split looks weak).
export const BADGE_MIN_VOTES = 100
// Open polls refresh their gauge this often for members who can see it (only while the tab is visible).
export const GAUGE_REFRESH_SECONDS = 30
// Rankings (2026-11-02): ranked from this many votes against this many different rivals; votes lose half their
// weight every RANK_HALF_LIFE_DAYS days. Recomputed by the cron once a day.
export const RANK_MIN_VOTES = 30 // operator 2026-11-02 (was 300)
export const RANK_MIN_RIVALS = 3
export const RANK_HALF_LIFE_DAYS = 90
export const SESSION_DAYS = 30
export const REJOIN_BLOCK_DAYS = 30

// Self-reported age gate: Korean numbers 14 (정보통신망법 법정대리인 동의 연령), elsewhere 13 (COPPA-style floor).
export const MIN_AGE_BY_COUNTRY: Record<string, number> = { KR: 14 }
export const MIN_AGE_DEFAULT = 13
export const OLDEST_BIRTH_YEAR = 1920

// ---- categories: AI services first, software & dev tools (2026-11-04, developers first), big purchases (2026-11-04, high-involvement products), products ----
// Labels per language live in i18n (cat); `en` is also what the AI card prompt receives.
export type CategoryGroup = 'ai' | 'software' | 'premium' | 'product'
export const CATEGORY_GROUPS: readonly CategoryGroup[] = ['ai', 'software', 'premium', 'product']
export type Category = { slug: string; group: CategoryGroup; en: string }
export const CATEGORIES: readonly Category[] = [
  { slug: 'ai-assistants', group: 'ai', en: 'Chatbots & assistants' },
  { slug: 'ai-coding', group: 'ai', en: 'Coding' },
  { slug: 'ai-image', group: 'ai', en: 'Image generation' },
  { slug: 'ai-video', group: 'ai', en: 'Video generation' },
  { slug: 'ai-audio', group: 'ai', en: 'Voice & music' },
  { slug: 'ai-writing', group: 'ai', en: 'Writing & productivity' },
  { slug: 'ai-search', group: 'ai', en: 'Search & research' },
  { slug: 'ai-agents', group: 'ai', en: 'Agents & automation' },
  { slug: 'ai-models', group: 'ai', en: 'Models & APIs' },
  { slug: 'ai-opensource', group: 'ai', en: 'Open source & dev tools' },
  { slug: 'ai-apps', group: 'ai', en: 'AI apps & devices' },
  { slug: 'ai-translation', group: 'ai', en: 'Translation' },
  { slug: 'ai-meeting', group: 'ai', en: 'Meetings & transcription' },
  { slug: 'ai-design', group: 'ai', en: 'Design & presentations' },
  { slug: 'ai-learning', group: 'ai', en: 'Learning & tutoring' },
  { slug: 'ai-companion', group: 'ai', en: 'Companions & characters' },
  { slug: 'ai-marketing', group: 'ai', en: 'Marketing & sales' },
  { slug: 'ai-data', group: 'ai', en: 'Data & analytics' },
  { slug: 'ai-3d', group: 'ai', en: '3D & avatars' },
  { slug: 'sw-editor', group: 'software', en: 'Code editors & IDEs' },
  { slug: 'sw-cloud', group: 'software', en: 'Cloud & hosting' },
  { slug: 'sw-database', group: 'software', en: 'Databases' },
  { slug: 'sw-framework', group: 'software', en: 'Frameworks & libraries' },
  { slug: 'sw-language', group: 'software', en: 'Programming languages' },
  { slug: 'sw-devops', group: 'software', en: 'CI/CD & DevOps' },
  { slug: 'sw-terminal', group: 'software', en: 'Terminals & shells' },
  { slug: 'sw-browser', group: 'software', en: 'Web browsers' },
  { slug: 'sw-os', group: 'software', en: 'Operating systems' },
  { slug: 'sw-notes', group: 'software', en: 'Notes & docs' },
  { slug: 'sw-project', group: 'software', en: 'Project management' },
  { slug: 'sw-chat', group: 'software', en: 'Messaging & team chat' },
  { slug: 'sw-security', group: 'software', en: 'Password managers & security' },
  { slug: 'sw-design', group: 'software', en: 'Design tools' },
  { slug: 'sw-streaming', group: 'software', en: 'Streaming services' },
  { slug: 'sw-storage', group: 'software', en: 'Cloud storage & backup' },
  { slug: 'car', group: 'premium', en: 'Car & accessories' },
  { slug: 'motorcycle', group: 'premium', en: 'Motorcycles & scooters' },
  { slug: 'apartment', group: 'premium', en: 'Apartment brands' },
  { slug: 'watch', group: 'premium', en: 'Luxury watches' },
  { slug: 'luxury', group: 'premium', en: 'Luxury fashion & bags' },
  { slug: 'jewelry', group: 'premium', en: 'Jewelry' },
  { slug: 'mattress', group: 'premium', en: 'Mattresses & beds' },
  { slug: 'massage-chair', group: 'premium', en: 'Massage chairs' },
  { slug: 'water-purifier', group: 'premium', en: 'Water purifiers' },
  { slug: 'golf', group: 'premium', en: 'Golf clubs & gear' },
  { slug: 'instrument', group: 'premium', en: 'Musical instruments' },
  { slug: 'airline', group: 'premium', en: 'Airlines' },
  { slug: 'hotel', group: 'premium', en: 'Hotels & resorts' },
  { slug: 'pc', group: 'product', en: 'PCs & laptops' },
  { slug: 'peripheral', group: 'product', en: 'Keyboards, mice & accessories' },
  { slug: 'monitor', group: 'product', en: 'Monitors' },
  { slug: 'storage', group: 'product', en: 'SSDs & storage' },
  { slug: 'network', group: 'product', en: 'Routers & networking' },
  { slug: 'printer', group: 'product', en: 'Printers & 3D printers' },
  { slug: 'phone', group: 'product', en: 'Phones & tablets' },
  { slug: 'wearable', group: 'product', en: 'Smartwatches & wearables' },
  { slug: 'camera', group: 'product', en: 'Cameras & drones' },
  { slug: 'audio', group: 'product', en: 'Earphones, headphones & speakers' },
  { slug: 'gaming', group: 'product', en: 'Consoles & gaming gear' },
  { slug: 'tv', group: 'product', en: 'TVs & projectors' },
  { slug: 'appliance', group: 'product', en: 'Home appliances' },
  { slug: 'kitchen', group: 'product', en: 'Kitchen appliances' },
  { slug: 'smarthome', group: 'product', en: 'Smart home' },
  { slug: 'cleaning', group: 'product', en: 'Vacuums & cleaning' },
  { slug: 'air', group: 'product', en: 'Air purifiers & climate' },
  { slug: 'furniture', group: 'product', en: 'Furniture & desks' },
  { slug: 'baby', group: 'product', en: 'Baby' },
  { slug: 'pet', group: 'product', en: 'Pets' },
  { slug: 'fashion', group: 'product', en: 'Fashion' },
  { slug: 'beauty', group: 'product', en: 'Beauty' },
  { slug: 'personal-care', group: 'product', en: 'Personal care' },
  { slug: 'fitness', group: 'product', en: 'Sports & fitness' },
  { slug: 'outdoor', group: 'product', en: 'Outdoor & camping' },
  { slug: 'mobility', group: 'product', en: 'Bikes & e-scooters' },
  { slug: 'toys', group: 'product', en: 'Toys & hobbies' },
  { slug: 'travel', group: 'product', en: 'Bags & travel' },
  { slug: 'food', group: 'product', en: 'Food' },
  { slug: 'coffee', group: 'product', en: 'Coffee & drinks' },
  { slug: 'etc', group: 'product', en: 'Other' },
]
export const categoryOf = (slug: string) => CATEGORIES.find((c) => c.slug === slug)
export const isCategory = (slug: string) => CATEGORIES.some((c) => c.slug === slug)
export const isAiCategory = (slug: string) => categoryOf(slug)?.group === 'ai'

export const GENDERS = ['M', 'F'] as const
export const AGE_BANDS = ['10', '20', '30', '40', '50', '60'] as const

// Free board and reports (house rule; 정보통신망법 제44조의2, 전기통신사업법 제22조의5).
export const MAX_POST_TITLE = 60
export const MAX_POST_BODY = 5000
export const MAX_COMMENT = 1000
export const DAILY_POST_LIMIT = 10
export const DAILY_COMMENT_LIMIT = 60
export const BOARD_PAGE_SIZE = 20
export const TEMP_HIDE_DAYS = 30
export const REPORT_HIDE_THRESHOLD = 3

export const REPORT_REASON_KEYS = ['illegal_filming', 'rights', 'illegal', 'manipulation', 'spam', 'abuse', 'other'] as const
export type ReportReason = (typeof REPORT_REASON_KEYS)[number]
export const isReportReason = (k: string): k is ReportReason => (REPORT_REASON_KEYS as readonly string[]).includes(k)

// ---- sign-up: phone number once + passkey ----
export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_MAX_ATTEMPTS = 5 // wrong codes per request
export const OTP_PER_PHONE_PER_HOUR = 3
export const OTP_PER_IP_PER_HOUR = 5
// Daily SMS caps (whole site / per country / per network provider). The values below are public development defaults;
// production reads its own numbers from the PRIVATE_LIMITS secret (see applyPrivateLimits) so they cannot be gamed.
export const OTP_CAPS = { daily: 50, country: 200, asn: 60 }
// Numbering-plan types accepted before any paid lookup (libphonenumber metadata). Korea's 070 internet numbers are VOIP.
export const ACCEPTED_NUMBER_TYPES = ['MOBILE', 'FIXED_LINE_OR_MOBILE', 'PERSONAL_NUMBER']
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const PHONE_FLOW_COOKIE_MIN = 30

// ---- one vote per device per poll ----
export const DEVICE_TOKEN_DAYS = 400 // browsers cap cookie lifetimes around 400 days
export const VOTES_PER_NETWORK_PER_POLL = 10 // one IPv4 address / IPv6 /64 — shared Wi-Fi beyond this switches to mobile data
export const DEVICE_HASH_KEEP_DAYS = 30

// ---- network check: no data centres, VPNs, Tor or relays at sign-up and voting ----
// Autonomous systems of cloud/hosting/VPN/relay providers. A short public example list; production loads the full,
// maintained list from the PRIVATE_LIMITS secret. Suggestions for the public list are welcome (FAIRNESS.md).
export const BLOCKED_ASNS = new Set<number>([
  16509, // Amazon AWS
  396982, // Google Cloud
  8075, // Microsoft Azure
  14061, // DigitalOcean
  24940, // Hetzner
])
export const BLOCKED_ORG = /\b(hosting|vps|data ?cent(er|re)s?|datacenter|colo(cation)?|vpn|proxy|cloud)\b/i

// ---- viral structures ----
export const SOURCE_COOKIE_HOURS = 24
export const INVITE_COOKIE_DAYS = 30
export const SOURCES = ['direct', 'share', 'embed', 'maker', 'invite'] as const
// Maker verification: anyone can get an address at these, so a product "hosted" there can never be claimed by email.
export const FREE_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'yahoo.com', 'yahoo.co.jp', 'icloud.com', 'me.com',
  'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me', 'tutanota.com', 'zoho.com', 'gmx.com', 'gmx.de', 'web.de', 'mail.com',
  'yandex.com', 'yandex.ru', 'mail.ru', 'qq.com', '163.com', '126.com', 'naver.com', 'daum.net', 'hanmail.net', 'kakao.com', 'nate.com',
])
export const CLAIMS_PER_MEMBER_PER_DAY = 5
export const CLAIM_RESEND_MS = 10 * 60 * 1000
export type Source = (typeof SOURCES)[number]

// ---- anomaly review (business plan §7.5) — the same-device rule became a hard limit ----
// The surge rule flags one-sided bursts of brand-new members; maker-campaign votes are disclosed instead of flagged.
export const ANOMALY = {
  windowMinutes: 30,
  surgeVotes: 20, // at least this many votes in the window
  newMemberHours: 48, // "new" = signed up less than this before voting
  surgeNewShare: 0.6, // at least this share of the window's votes from new members
  surgeTopShare: 0.85, // at least this share of the window's votes for one candidate
  baselineVotes: 15, // with this many earlier votes, the window must swing ...
  swingPoints: 0.35, // ... this much above that candidate's earlier share
  surgeWithoutBaseline: 80, // without a baseline only a very large one-sided burst counts
}
export const ANOMALY_NOTE = 'surge'

// Production overrides for the abuse thresholds above (open development, 2026-11-05): the code is public, the live
// numbers are not. PRIVATE_LIMITS is a JSON secret: { otp: {daily,country,asn}, anomaly: {...}, blockedAsns: [...] }.
let appliedLimits: string | null = null
export function applyPrivateLimits(raw: string | undefined) {
  if (!raw || raw === appliedLimits) return
  try {
    const j = JSON.parse(raw) as { otp?: Partial<typeof OTP_CAPS>; anomaly?: Partial<typeof ANOMALY>; blockedAsns?: number[] }
    if (j.otp) Object.assign(OTP_CAPS, j.otp)
    if (j.anomaly) Object.assign(ANOMALY, j.anomaly)
    if (Array.isArray(j.blockedAsns)) for (const a of j.blockedAsns) BLOCKED_ASNS.add(a)
    appliedLimits = raw
  } catch {
    console.warn('PRIVATE_LIMITS is not valid JSON — public defaults in use')
  }
}

// ---- AI comparison cards ----
export const CARD_MODEL = 'claude-haiku-5-5'
export const CARD_MAX_SEARCHES = 3
export const CARD_HINT_MAX_SEARCHES = 1 // with an operator-supplied official page: fallback only, if that page cannot be read
export const CARD_MAX_FETCHES = 3
export const CARD_FETCH_MAX_TOKENS = 15000
export const CARD_MAX_ATTEMPTS = 2
// Deep pass: cards that still lack key facts after the first pass. Runs in the cron (15-minute limit), not after
// a page request (30 seconds). Browser = Cloudflare Browser Rendering, 10 hours/month included in Workers Paid.
export const CARD_MIN_SPECS = 6 // fewer confirmed specs than this sends a card to the deep pass
export const CARD_DEEP_MODEL = 'claude-haiku-5-5'
export const CARD_DEEP_MAX_SEARCHES = 4
export const CARD_DEEP_MAX_FETCHES = 4
export const CARD_DEEP_MAX_ATTEMPTS = 2
export const CARD_DEEP_PER_RUN = 8 // deep cards per cron run, one after another (~40 s each, cron limit 15 min)
export const CARD_DEEP_LOCK_MS = 10 * 60 * 1000
export const CARD_RENDER_MAX_PAGES = 3
export const CARD_RENDER_TIMEOUT_MS = 25_000
export const CARD_RENDER_MAX_CHARS = 24_000 // per page (about 6,000 tokens)
export const CARD_RENDER_TOTAL_CHARS = 60_000
export const CARD_LOCK_MS = 3 * 60 * 1000
export const CARD_RETRY_DELAY_MS = 2 * 60 * 1000
export const CARD_DAILY_LIMIT = 200 // cards generated in any 24 hours, whole site
export const CARD_DAILY_BUDGET_USD = 5 // stop generating for the rest of the 24 hours past this
export const CARD_CONCURRENCY = 3
// Booked in the spend log when an attempt starts and replaced by the real cost when it ends, so an attempt cut off
// mid-call (Workers ends waitUntil work ~30 s after the response) still counts toward the 24-hour guard.
export const CARD_ATTEMPT_RESERVE_USD = 0.05
// Haiku 5.5 list prices (claude-api reference 2026-10-06; web search pricing page 2026-10-29): USD per million tokens
// for prompts up to 100K tokens (above that 0.50 / 2.50), web search USD 10 per 1,000 searches, web fetch tokens only.
export const CARD_PRICE = { input: 0.1, output: 0.5, inputLong: 0.5, outputLong: 2.5, longPrompt: 100_000, search: 0.01 }
// Not the maker's own site: marketplaces, price comparison, communities, video, app stores.
// Excluded from search and never counted as an official source (house rule — official facts only).
export const NON_OFFICIAL_DOMAINS = [
  'coupang.com',
  '11st.co.kr',
  'gmarket.co.kr',
  'auction.co.kr',
  'danawa.com',
  'enuri.com',
  'ssg.com',
  'lotteon.com',
  'tmon.co.kr',
  'wemakeprice.com',
  'shopping.naver.com',
  'smartstore.naver.com',
  'brand.naver.com',
  'blog.naver.com',
  'cafe.naver.com',
  'tistory.com',
  'aliexpress.com',
  'temu.com',
  'amazon.com',
  'ebay.com',
  'youtube.com',
  'namu.wiki',
  'reddit.com',
  'medium.com',
  'producthunt.com',
  'g2.com',
  'capterra.com',
  'theresanaiforthat.com',
  'futurepedia.io',
]

// ---- bot check (Cloudflare Turnstile — checked 2026-10-29) on the phone step and poll creation ----
// Voting itself is signed with the voter's passkey instead (design v0.2 §2.3).
export const TURNSTILE_TEST_SITE_KEY = '1x00000000000000000000AA'
export const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA'
export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export const TURNSTILE_TIMEOUT_MS = 5000

// ---- metrics ledger (step 8, business plan §6.2) ----
// Verification cost per code sent: Google Identity Platform SMS, USD 0.01 for Korea/US, 0.03–0.10 for most of Europe and
// Japan, up to 0.45 elsewhere; first 10 a day free (Google price table 2026-11-02; Twilio removed 2026-11-04).
// 20 KRW is the planning estimate until invoices exist (was 130 KRW with Twilio).
export const IDV_UNIT_KRW = 20
export const METRICS_BACKFILL_DAYS = 35
export const METRICS_DAY_GRACE_MS = 10 * 60 * 1000

// Operator shown in the legal documents (src/legal).
export const BUSINESS = {
  name: { en: 'Dr.Seoul', ko: '닥터서울' },
  // Representative and address are filled in at render time from the OPERATOR secret (not kept in the public code).
  ceo: { en: '{{OPERATOR_REP_EN}}', ko: '{{OPERATOR_REP_KO}}' },
  address: { en: '{{OPERATOR_ADDRESS_EN}}', ko: '{{OPERATOR_ADDRESS_KO}}' },
  contact: 'hello@pollreal.com',
}
