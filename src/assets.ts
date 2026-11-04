import { GAUGE_REFRESH_SECONDS } from './config'
// Served at /assets/app.css. Mobile-first; no third-party fonts or scripts.
// Look = the Google Stitch design "Pollreal Verified AI Voting Platform" (2026-10-29), generated from a Blackstone-tone design brief and
// carried over here token by token (its Tailwind config): white page, black text, slate greys #515256 / #d5d8df / #f4f5f7,
// warm taupe #e7d8c9 as the secondary surface, ONE accent = Blackstone copper #a95228 (hover #8f441f), error red #b80000;
// one gothic (sans-serif) family everywhere — Inter for Latin and Cyrillic (standing in for Blackstone's "Guardian Sans"),
// the system gothic for Korean, Japanese, Chinese and Devanagari (Malgun Gothic, Apple SD Gothic Neo …). Stitch's serif
// headlines were dropped (operator 2026-10-29): a serif face has no
// Korean glyphs, so titles would mix serif Latin with gothic Hangul. 1 px rules, 2 px corners, uppercase tracked labels,
// no shadows or gradients. No black fills (account rule). Inter is self-hosted from /fonts/ (scripts/copy-fonts.mjs).
// Stitch's invented figures and slogans ("18,429 verified ballots today", "99.98% cryptographic fidelity" …) are NOT used.
export const APP_CSS = `@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-cyrillic-ext-wght-normal.woff2) format("woff2-variations");unicode-range:U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F}
@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-cyrillic-wght-normal.woff2) format("woff2-variations");unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-ext-wght-normal.woff2) format("woff2-variations");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:"Inter Variable";font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-wght-normal.woff2) format("woff2-variations");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
:root{--acc:#a95228;--acc-h:#8f441f;--acc-d:#783918;--err:#b80000;--bg:#fff;--subtle:#f4f5f7;--taupe:#e7d8c9;--ink:#000;--sub:#515256;--line:#d5d8df;--rest:#525357;--sans:"Inter Variable",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","Apple SD Gothic Neo","Malgun Gothic","Hiragino Sans","Yu Gothic UI","PingFang SC","Microsoft YaHei","Noto Sans","Noto Sans KR","Noto Sans JP","Noto Sans SC","Noto Sans Devanagari",sans-serif}
*{box-sizing:border-box}
body{margin:0;font:400 15px/24px var(--sans);color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased}
a{color:var(--ink);text-underline-offset:4px;text-decoration-thickness:1px}
a:hover{color:var(--acc)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.wrap{max-width:1200px;margin:0 auto;padding:0 24px}
main{max-width:880px;margin:0 auto;padding:40px 24px 0}
main.wide{max-width:1200px}
h1,h2,h3{font-family:var(--sans);font-weight:600;color:var(--ink)}
h1{font-size:44px;line-height:52px;letter-spacing:-.025em;margin:0 0 16px}
h2{font-size:26px;line-height:34px;letter-spacing:-.015em;margin:48px 0 16px}
h3{font-size:20px;line-height:28px;margin:0 0 8px}
.label,.cat,.eyebrow,h3.group{font:600 11px/14px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sub)}
.devbar{background:var(--taupe);color:var(--ink);font-size:13px;text-align:center;padding:4px}
header.top{background:var(--bg);border-bottom:1px solid var(--line)}
header.top .bar{display:flex;justify-content:space-between;align-items:center;gap:16px;min-height:64px;flex-wrap:wrap}
header.top .logo{font:700 19px/28px var(--sans);text-transform:uppercase;letter-spacing:.08em;text-decoration:none;color:var(--ink)}
header.top .logo:hover{color:var(--acc)}
header.top nav{display:flex;align-items:center;flex-wrap:wrap;gap:4px 28px}
header.top nav>a,.langs summary{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:var(--sub)}
header.top nav>a:hover,.langs summary:hover{color:var(--acc)}
.langs{position:relative;padding-left:28px;border-left:1px solid var(--line)}
.langs summary{cursor:pointer;list-style:none;padding:2px 0}
.langs summary::-webkit-details-marker{display:none}
.langs summary::after{content:" ▾";font-size:10px}
.langs ul{position:absolute;right:0;z-index:5;list-style:none;margin:10px 0 0;padding:6px 0;background:var(--bg);border:1px solid var(--line);min-width:160px}
.langs li a{display:block;padding:6px 16px;text-decoration:none;font-size:14px;color:var(--ink)}
.langs li a[aria-current]{color:var(--acc);font-weight:600}
.langs li a:hover{background:var(--subtle)}
.hero{padding:40px 0 48px;border-bottom:1px solid var(--line)}
.hero h1{font-size:56px;line-height:64px;letter-spacing:-.03em;max-width:900px;margin:0 0 24px}
.hero h1 .em{display:block}
.inapp{background:var(--taupe);border-bottom:1px solid var(--line)}
.inapp .wrap{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 24px;padding-top:16px;padding-bottom:16px}
.inapp p{margin:0;font-weight:600;color:var(--ink)}
.inapp .note{font-weight:400}
.hero .hero-tag{color:var(--acc);margin:0 0 16px;font-weight:700}
.hero p{font-size:18px;line-height:28px;color:var(--sub);max-width:760px;margin:0 0 32px}
.hero .hero-actions{margin:0}
.btn,button{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--acc);color:#fff;border:1px solid var(--acc);border-radius:2px;padding:12px 32px;font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;text-decoration:none;cursor:pointer;transition:background-color .15s,border-color .15s}
.btn:hover,button:hover{background:var(--acc-h);border-color:var(--acc-h);color:#fff}
.btn:active,button:active{background:var(--acc-d)}
.btn.ghost,button.ghost{background:var(--bg);color:var(--ink);border:1px solid var(--rest)}
.btn.ghost:hover,button.ghost:hover{background:var(--subtle);color:var(--ink);border-color:var(--rest)}
button[disabled],button[disabled]:hover{background:var(--subtle);border-color:var(--line);color:var(--sub);cursor:not-allowed}
.hero-actions{display:flex;gap:16px;flex-wrap:wrap}
.search{display:flex;gap:0;margin:32px 0;max-width:900px}
.search input{flex:1;height:56px;border-right:0}
.search button{height:56px}
.cats{padding:0 0 32px;border-bottom:1px solid var(--line)}
.catrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px 24px;margin:0 0 16px}
.catrow h3.group{margin:0;width:128px;flex-shrink:0}
.catrow .chips{flex:1 1 0;min-width:240px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:0}
.chips a{display:inline-block;padding:6px 14px;background:var(--subtle);border:1px solid var(--line);border-radius:2px;text-decoration:none;font-size:13px;line-height:20px;color:var(--sub);transition:border-color .15s,color .15s}
.chips a:hover{border-color:var(--acc);color:var(--acc)}
.chips a.on{border-color:var(--acc);color:var(--acc);background:var(--bg);font-weight:600}
.rank-nav{margin:0 0 40px;padding:20px 0 4px;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.rank-nav>.chips{margin:0 0 16px}
.rank-top{margin:0 0 40px}
.rank-top h2{margin:0 0 16px}
.ledger{display:grid;grid-template-columns:1fr;gap:16px 64px}
.ledger h2,.home-board h2{margin:56px 0 8px;padding-bottom:16px;border-bottom:1px solid var(--ink)}
.polls{list-style:none;padding:0;margin:0}
.polls li{border-bottom:1px solid var(--line)}
.polls li a{display:block;padding:24px 12px;margin:0 -12px;text-decoration:none;color:inherit;transition:background-color .15s}
.polls li a:hover{background:var(--subtle)}
.polls .row1{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px}
.polls .tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.polls .cat{display:inline-block;padding:2px 8px;background:var(--subtle);border:1px solid var(--line)}
.polls strong{display:block;font:600 19px/27px var(--sans);letter-spacing:-.01em;margin-bottom:8px}
.polls li a:hover strong{color:var(--acc)}
.polls .meta .n{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
.badge{display:inline-block;font:600 11px/14px var(--sans);letter-spacing:.08em;text-transform:uppercase;background:var(--bg);color:var(--sub);border:1px solid var(--line);padding:2px 8px}
.badge.win{background:var(--taupe);color:var(--acc);border-color:rgba(169,82,40,.2)}
.meta{font-size:12px;line-height:16px;color:var(--sub)}
.empty,.muted{color:var(--sub)}
.live{color:var(--acc);font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.live::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);margin-right:8px;vertical-align:0}
.done{color:var(--sub);font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
input,select,textarea{font:400 15px/24px var(--sans);padding:11px 14px;border:1px solid var(--line);border-radius:2px;width:100%;background:var(--bg);color:var(--ink)}
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 1px var(--acc)}
input[type=radio],input[type=checkbox]{width:auto;accent-color:var(--acc)}
.stack{display:flex;flex-direction:column;gap:20px}
.stack>label{display:flex;flex-direction:column;gap:6px;font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.stack>label>input,.stack>label>select,.stack>label>textarea{text-transform:none;letter-spacing:0;font:400 15px/24px var(--sans);color:var(--ink)}
.stack>button,.stack>.btn{align-self:flex-start}
fieldset{border:1px solid var(--line);border-radius:0;display:flex;flex-direction:column;gap:10px;background:var(--bg);padding:16px 20px 20px;margin:0}
legend{font:600 18px/26px var(--sans);color:var(--ink);padding:0 6px}
label.row{display:block;margin:4px 0;text-transform:none;letter-spacing:0;font:400 15px/24px var(--sans);color:var(--ink)}
.errors{background:var(--subtle);color:var(--err);border-left:2px solid var(--err);padding:12px 16px 12px 32px;margin:16px 0}
.warn{background:var(--subtle);color:var(--ink);border-left:2px solid var(--err);padding:12px 16px;margin:12px 0}
.flash{background:var(--subtle);color:var(--ink);border-left:2px solid var(--acc);padding:12px 16px;margin:12px 0}
.question{font:400 19px/28px var(--sans);color:var(--sub);margin:0 0 24px}
.crumb{margin:0 0 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.crumb a{font:600 11px/14px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--sub);text-decoration:none}
.crumb a:hover{color:var(--acc)}
.poll h1{font-size:44px;line-height:52px}
.statusbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;border:1px solid var(--line);background:var(--subtle);padding:20px 24px;margin:0 0 32px}
.statusbar .sign{font-size:13px;line-height:20px;color:var(--sub);padding-left:24px;border-left:1px solid var(--line)}
.candidates{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:32px}
.candidates>li{border:1px solid var(--line);background:var(--bg);transition:border-color .15s}
.candidates>li:hover{border-color:var(--acc)}
.c-head{padding:24px 32px;border-bottom:1px solid var(--line)}
.c-head .eyebrow{color:var(--acc);display:block;margin-bottom:4px}
.c-head h3{font-size:30px;line-height:38px;letter-spacing:-.02em;margin:0}
.c-body{padding:24px 32px 28px}
.c-foot{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:12px;margin-top:24px}
.interest{font-size:13px;line-height:20px;background:var(--taupe);color:var(--acc-d);padding:8px 12px;margin:0 0 16px}
.card{border:1px solid var(--line);padding:24px;margin:0;background:var(--subtle)}
.card.pending{border-style:dashed}
.card .ai{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--ink)}
.card .ai::before{content:"";display:inline-block;width:6px;height:6px;background:var(--acc);margin-right:8px;vertical-align:2px}
.card-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:0 0 16px;padding-bottom:16px;border-bottom:1px solid var(--line)}
.card-head .official{font-size:13px;white-space:nowrap;color:var(--acc)}
.card-head .official::after{content:" ↗"}
.with-logo{display:inline-flex;align-items:center;gap:10px}
h3.with-logo{display:flex}
.mlogo{width:20px;height:20px;flex-shrink:0;object-fit:contain;border-radius:4px;background:#fff;border:1px solid var(--line)}
h3 .mlogo{width:28px;height:28px;border-radius:6px}
.mlogo.letter{display:inline-flex;align-items:center;justify-content:center;background:var(--taupe);color:var(--acc-d);font:700 11px/1 var(--sans);border-color:transparent}
h3 .mlogo.letter{font-size:14px}
details.card{padding:16px 24px}
details.card[open]{padding:24px}
details.card>summary{cursor:pointer;list-style:none}
details.card>summary::-webkit-details-marker{display:none}
details.card:not([open])>summary.card-head{margin:0;padding-bottom:0;border-bottom:0}
.card-tools{display:flex;align-items:center;gap:16px}
.card .toggle{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub);white-space:nowrap}
.card .toggle::after{content:" ▾"}
details.card[open] .toggle::after{content:" ▴"}
details.card>summary:hover .toggle{color:var(--acc)}
details.card .less,details.card[open] .more{display:none}
details.card[open] .less{display:inline}
.ptitle{font:600 18px/26px var(--sans);margin:0 0 8px}
.specs{display:grid;grid-template-columns:minmax(120px,max-content) 1fr;margin:0;font-size:15px;line-height:24px}
.specs dt{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub);padding:12px 24px 12px 0;border-bottom:1px solid var(--line)}
.specs dd{margin:0;padding:10px 0;border-bottom:1px solid var(--line);font-variant-numeric:tabular-nums}
.notes{font-size:14px;line-height:22px;padding-left:18px;margin:16px 0 0}
.sources{font-size:13px;line-height:20px;color:var(--sub);margin:16px 0 0;padding-top:16px;border-top:1px solid var(--line)}
.sources a{color:var(--acc)}
.card .note{margin:8px 0 0}
.small{font-size:12px;padding:4px 8px;display:inline-block}
.results{border:1px solid var(--line);border-left:4px solid var(--acc);background:var(--subtle);padding:32px 40px;margin:0 0 48px}
.results h2{margin:0 0 8px;font:600 11px/14px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--acc)}
.verdict{font:600 30px/38px var(--sans);letter-spacing:-.02em;margin:0 0 4px;color:var(--ink)}
.results>.meta{margin:0 0 24px}
.tables{display:grid;grid-template-columns:minmax(0,1fr);align-items:start;gap:24px 32px;margin:32px 0 8px}
.groups{border-collapse:collapse;width:100%;min-width:0;table-layout:fixed;font-size:15px;background:var(--bg);border:1px solid var(--line)}
.groups thead th{word-break:keep-all;overflow-wrap:normal;hyphens:none}
.groups caption{text-align:left;font:600 18px/26px var(--sans);color:var(--ink);padding:0 0 10px;border-bottom:2px solid var(--ink);margin-bottom:12px;caption-side:top}
.groups th,.groups td{border-bottom:1px solid var(--line);padding:12px 10px;text-align:right;font-variant-numeric:tabular-nums}
.groups th[scope=row]{text-align:left;font-weight:500}
.groups thead th{font:500 11px/15px var(--sans);letter-spacing:.03em;text-transform:uppercase;color:var(--sub)}
.groups thead th:first-child{text-align:left}
.groups td.top{color:var(--acc);font-weight:600}
.groups td.muted{text-align:left;font-style:italic;font-size:13px}
.note{font-size:13px;line-height:20px;color:var(--sub)}
.gauge{background:var(--bg);border:1px solid var(--line);padding:24px;margin:0 0 8px}
.g-head{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:8px 16px;margin-bottom:12px}
.g-cand{display:flex;flex-direction:column;min-width:0}
.gauge.duel .g-cand:last-child{align-items:flex-end;text-align:right}
.g-name{display:flex;flex-wrap:wrap;align-items:center;gap:6px;font:600 16px/22px var(--sans);color:var(--ink)}
.gauge.duel .g-cand:last-child .g-name{justify-content:flex-end}
.g-tag{font:600 10px/14px var(--sans);letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;border-radius:2px}
.g-tag.you{background:var(--taupe);color:var(--ink)}
.g-tag.lead{border:1px solid var(--acc);color:var(--acc)}
.g-pct{font:600 38px/44px var(--sans);letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--ink)}
.g-cand.lead .g-pct{color:var(--acc)}
.g-votes{font-size:13px;line-height:18px;color:var(--sub);font-variant-numeric:tabular-nums}
.g-track{position:relative;display:flex;height:44px;border:1px solid var(--line);background:var(--subtle);overflow:hidden}
.g-seg{display:flex;align-items:center;flex:none;height:100%;min-width:0;transition:width .8s cubic-bezier(.2,.7,.2,1)}
.g-seg+.g-seg{border-left:2px solid var(--bg)}
.g-seg.lead{background:var(--acc)}.g-seg.rest{background:#525357}.g-seg.rest2{background:#8c8e94}.g-seg.rest3{background:#b4b6bc}
.g-in{padding:0 12px;color:#fff;font:600 12px/16px var(--sans);white-space:nowrap;font-variant-numeric:tabular-nums}
.gauge.duel .g-seg:last-child{justify-content:flex-end}
.gauge.duel .g-track::after{content:"";position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed rgba(255,255,255,.75)}
.g-marks{position:relative;height:22px}
.g-you{position:absolute;top:5px;transform:translateX(-50%);background:var(--acc);color:#fff;font:600 10px/14px var(--sans);letter-spacing:.06em;text-transform:uppercase;padding:1px 6px;white-space:nowrap;transition:left .8s cubic-bezier(.2,.7,.2,1)}
.g-you::before{content:"";position:absolute;left:50%;top:-4px;margin-left:-4px;border:4px solid transparent;border-top:0;border-bottom-color:var(--acc)}
.g-scale{position:relative;height:18px;border-top:1px solid var(--line);font-size:11px;line-height:16px;color:var(--sub);font-variant-numeric:tabular-nums}
.g-scale span{position:absolute;top:3px;transform:translateX(-50%)}
.g-scale span:nth-child(1){left:0;transform:none}.g-scale span:nth-child(2){left:25%}.g-scale span:nth-child(3){left:50%}.g-scale span:nth-child(4){left:75%}.g-scale span:nth-child(5){left:100%;transform:translateX(-100%)}
.g-scale .mid{font-weight:600;color:var(--ink)}
.lede{font-size:18px;line-height:28px;color:var(--sub);max-width:760px;margin:0 0 32px}
.rank-grid{display:grid;grid-template-columns:1fr;gap:24px;margin:0 0 48px}
.rank-card{border:1px solid var(--line);background:var(--bg);display:flex;flex-direction:column}
.rank-card header{display:flex;justify-content:space-between;align-items:baseline;padding:16px 20px;border-bottom:1px solid var(--line)}
.rank-card header .n{font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums}
.rank-card.muted{background:var(--subtle)}
.rank-card footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 20px;border-top:1px solid var(--line);margin-top:auto;font-size:13px}
.rank-card footer a{font:600 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;text-decoration:none}
.rank-mini{list-style:none;margin:0;padding:8px 20px}
.rank-mini li{display:grid;grid-template-columns:32px minmax(0,1fr) 64px 38%;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}
.rank-mini li:last-child{border-bottom:0}
.rank-mini .rk,.rank-table .rk{font:600 13px/18px var(--sans);color:var(--sub);font-variant-numeric:tabular-nums}
.rank-mini .nm{font-weight:600;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rank-mini .sc{font:600 18px/24px var(--sans);text-align:right;font-variant-numeric:tabular-nums}
.rank-queue{list-style:none;margin:0;padding:8px 20px}
.rank-queue li{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.rank-queue li:last-child{border-bottom:0}
.rank-queue .pg,.rank-wait .pg{color:var(--sub);font-variant-numeric:tabular-nums;white-space:nowrap}
.fp{position:relative;display:block;height:16px}
.fp-base{position:absolute;top:0;bottom:0;border-left:1px dashed var(--line)}
.fp-line{position:absolute;top:7px;height:2px;background:#8c8e94}
.fp-dot{position:absolute;top:3px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--rest)}
.fp-dot.top{background:var(--acc)}
.rank-layout{display:grid;grid-template-columns:1fr;gap:32px;margin-top:24px}
.rank-table-wrap{border:1px solid var(--line);overflow-x:auto}
.rank-table{width:100%;border-collapse:collapse;font-size:14px}
.rank-table th{font:600 11px/14px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub);text-align:left;padding:12px;border-bottom:1px solid var(--ink);vertical-align:bottom;white-space:nowrap}
.rank-table td{padding:12px;border-bottom:1px solid var(--line);vertical-align:middle}
.rank-table tr:hover td{background:var(--subtle)}
.rank-table tr.first td:first-child{box-shadow:inset 3px 0 0 var(--acc)}
.rank-table .r{text-align:right;font-variant-numeric:tabular-nums}
.rank-table .sc{font:600 20px/26px var(--sans)}
.rank-table .nm a{font-weight:600;text-decoration:none}
.rank-table .rec,.rank-wait .rec{color:var(--sub);white-space:nowrap;font-size:13px}
.rank-table .fp-col{min-width:220px;width:34%}
.rank-table th.fp-col{position:relative;padding-bottom:28px}
.rank-table .ticks{position:absolute;left:12px;right:12px;bottom:8px;height:14px}
.rank-table .ticks span{position:absolute;transform:translateX(-50%);font-weight:500;letter-spacing:0;font-variant-numeric:tabular-nums}
.rank-table .fp-nums{display:block;font-size:11px;color:var(--sub);font-variant-numeric:tabular-nums}
.rank-table-wrap>.note{margin:0;padding:12px;border-top:1px solid var(--line)}
.rank-wait{margin-top:32px}
.rank-wait ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--ink)}
.rank-wait li{display:grid;grid-template-columns:minmax(0,1fr) auto 120px auto;gap:16px;align-items:center;padding:12px 0;border-bottom:1px solid var(--line);font-size:14px}
.rank-wait .nm{font-weight:600}
.rank-wait .bar{display:block;height:6px;background:var(--subtle);border:1px solid var(--line)}
.rank-wait .bar span{display:block;height:100%;background:var(--taupe)}
.rank-how{background:var(--taupe);border:1px solid var(--line);padding:20px 24px;align-self:start}
.rank-how h2{font:600 11px/14px var(--sans);letter-spacing:.08em;text-transform:uppercase;color:var(--ink);margin:0 0 12px}
.rank-how p{font-size:14px;line-height:22px;margin:0 0 10px}
@media (min-width:1024px){.rank-grid{grid-template-columns:1fr 1fr}.rank-layout{grid-template-columns:minmax(0,1fr) 300px}}
@media (max-width:720px){.rank-mini li{grid-template-columns:28px minmax(0,1fr) 56px}.rank-mini .fp{grid-column:2/4}.rank-wait li{grid-template-columns:1fr}.rank-table .rec,.rank-table th:last-child{display:none}}
.results+.side{margin-top:-32px}
.side{background:var(--taupe);border:1px solid var(--line);padding:20px 24px;margin:0 0 48px}
.side-line{font:600 18px/26px var(--sans);color:var(--ink);margin:0 0 12px}
.side.behind .side-line::before{content:"↘ ";color:var(--err)}
.side.lead .side-line::before{content:"↗ ";color:var(--acc)}
.side .actions{flex-wrap:wrap;gap:8px;margin:0 0 8px}
.side .note{margin:0}
.badges{list-style:none;padding:0;margin:8px 0 0}
.badges li{display:grid;grid-template-columns:140px minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line);font-size:13px}
.badges code{font-size:12px;line-height:18px;overflow-wrap:anywhere;color:var(--sub)}
@media (max-width:720px){.gauge{padding:16px}.g-pct{font-size:28px;line-height:34px}.g-name{font-size:14px;line-height:20px}.g-track{height:36px}.side{padding:16px}.side-line{font-size:16px;line-height:24px}.badges li{grid-template-columns:1fr}}
.botcheck{margin:8px 0;min-height:65px}
.voteform{margin:0 0 16px}
.voteform .status{font-weight:600}
.plain{padding-left:18px}
.danger{margin-top:48px;border-top:1px solid var(--line)}
.foot{margin:96px 0 0;border-top:1px solid var(--line);background:var(--bg)}
.foot .trust{font-size:15px;line-height:24px;color:var(--ink);max-width:760px;margin:0;padding:40px 0 28px;border-bottom:1px solid var(--line)}
.foot .links{display:flex;flex-wrap:wrap;gap:8px 32px;margin:0;padding:24px 0 48px}
.foot .links a{font-size:13px;color:var(--sub);text-decoration:none}
.foot .links a:hover{color:var(--acc)}
h2 .more{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;margin-left:12px;color:var(--acc);text-decoration:none}
label.row input{margin-right:6px}
.posts{list-style:none;padding:0;margin:0;border-top:1px solid var(--line)}
.posts li{border-bottom:1px solid var(--line)}
.posts li a{display:block;padding:20px 12px;margin:0 -12px;text-decoration:none;color:inherit;transition:background-color .15s}
.posts li a:hover{background:var(--subtle)}
.posts strong{font:600 18px/26px var(--sans)}
.posts li a:hover strong{color:var(--acc)}
.posts .count{color:var(--acc);font-size:13px;font-variant-numeric:tabular-nums}
.posts .meta{display:block;margin-top:6px}
.pager{display:flex;gap:24px;justify-content:center;margin:24px 0}
.body{white-space:pre-wrap;word-break:break-word;margin:16px 0;font-size:16px;line-height:26px}
.comments{margin-top:40px;padding-top:8px;border-top:2px solid var(--ink)}
.comments ul{list-style:none;padding:0}
.comments li{padding:16px 0;border-bottom:1px solid var(--line)}
.comments .body{margin:6px 0;font-size:15px;line-height:24px}
.actions{font-size:13px;color:var(--sub);display:flex;gap:12px;align-items:center;margin:8px 0}
form.inline{display:inline}
button.link{background:none;border:0;color:var(--sub);padding:0;font:400 13px/20px var(--sans);letter-spacing:0;text-transform:none;text-decoration:underline}
button.link:hover{background:none;color:var(--acc)}
.status{min-height:1.2em;margin:6px 0}
.share{margin-top:48px;border-top:1px solid var(--line);padding-top:8px}
.share .actions{flex-wrap:wrap;gap:12px}
.share details{margin-top:16px}
.share summary{cursor:pointer;font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.share summary:hover{color:var(--acc)}
textarea.code{width:100%;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;margin:8px 0}
code{font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--subtle);border:1px solid var(--line);padding:2px 6px;word-break:break-all}
.composition{margin-top:24px;border-top:1px solid var(--line);padding-top:16px}
.composition strong{color:var(--ink);font-weight:600}
.campaign{margin:24px 0;padding:16px 20px;border:1px solid var(--line);border-left:2px solid var(--acc);background:var(--subtle)}
.maker{margin:16px 0 0}
.legal .version{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub);margin:0 0 24px}
.legal h2{font-size:22px;line-height:30px;margin:40px 0 12px}
.legal p,.legal li{font-size:15px;line-height:24px}
.legal ul{padding-left:20px;margin:0 0 16px}
.legal li{margin:0 0 8px}
.legal table{border-collapse:collapse;width:100%;font-size:14px;line-height:20px;margin:16px 0;background:var(--bg);border:1px solid var(--line)}
.legal th,.legal td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}
.legal th:last-child,.legal td:last-child{border-right:0}
.legal thead th{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub)}
.legal .docnav{display:flex;flex-wrap:wrap;gap:8px 24px;margin:56px 0 0;padding-top:24px;border-top:1px solid var(--line)}
.legal .docnav a{font:500 12px/16px var(--sans);letter-spacing:.06em;text-transform:uppercase;color:var(--sub);text-decoration:none}
.legal .docnav a:hover{color:var(--acc)}
@media (max-width:720px){.legal table{display:block;overflow-x:auto}}
@media (max-width:640px){.results{padding:24px 16px}.groups{font-size:14px}.groups th,.groups td{padding:10px 5px}.groups thead th{font-size:10px;letter-spacing:0}}
@media (min-width:1024px){.wrap{padding:0 48px}main.wide{padding-left:48px;padding-right:48px}.ledger{grid-template-columns:1fr 1fr}.tables{grid-template-columns:repeat(2,minmax(0,1fr))}.hero{padding:64px 0 56px}}
@media (max-width:720px){h1,.poll h1{font-size:30px;line-height:38px}.hero h1{font-size:36px;line-height:44px}h2{font-size:22px;line-height:30px}.c-head,.c-body{padding-left:20px;padding-right:20px}.c-head h3{font-size:26px;line-height:34px}.results{padding:24px 20px}.verdict{font-size:24px;line-height:32px}.statusbar .sign{padding-left:0;border-left:0}.search input{border-right:1px solid var(--line)}.search{flex-direction:column;gap:8px}.langs{padding-left:0;border-left:0}.specs{grid-template-columns:1fr}.specs dt{padding-bottom:0;border-bottom:0}}`

// Cache-busting version for /assets/app.css (FNV-1a of the stylesheet) — the file is cached for a day.
export const CSS_VERSION = (() => {
  let h = 0x811c9dc5
  for (let i = 0; i < APP_CSS.length; i++) h = Math.imul(h ^ APP_CSS.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
})()

// Page script (passkeys, device-token mirror, share/copy) — the site's own and only first-party script.
export const APP_JS = String.raw`(() => {
  'use strict'
  // Pollreal page script: passkeys (sign-up, sign-in, every vote), one-vote-per-device token mirror, share/copy buttons.
  // No third-party code. Messages come from data-msg-* attributes in the page language.
  const L = document.documentElement.lang === 'ko' ? 'ko' : 'en'
  const DT_KEY = 'pollreal_dt'
  const b64u = (buf) => {
    const bytes = new Uint8Array(buf)
    let s = ''
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
  const fromB64u = (str) => {
    const s = str.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(s + '==='.slice((s.length + 3) % 4))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out.buffer
  }
  const post = async (url, body) => {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}), credentials: 'same-origin' })
      let data = {}
      try {
        data = await r.json()
      } catch (e) {}
      return { ok: r.ok, data }
    } catch (e) {
      return { ok: false, data: {} }
    }
  }
  const store = {
    get: (k) => {
      try {
        return localStorage.getItem(k)
      } catch (e) {
        return null
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v)
      } catch (e) {}
    },
  }
  const supported = () => !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create)
  const say = (root, text, bad) => {
    const el = root && root.querySelector('[data-status]')
    if (!el) return
    el.textContent = text || ''
    el.classList.toggle('warn', !!bad)
  }
  const creation = (o) =>
    Object.assign({}, o, {
      challenge: fromB64u(o.challenge),
      user: Object.assign({}, o.user, { id: fromB64u(o.user.id) }),
      excludeCredentials: (o.excludeCredentials || []).map((c) => Object.assign({}, c, { id: fromB64u(c.id) })),
    })
  const request = (o) =>
    Object.assign({}, o, {
      challenge: fromB64u(o.challenge),
      allowCredentials: (o.allowCredentials || []).map((c) => Object.assign({}, c, { id: fromB64u(c.id) })),
    })
  const ext = (cred) => (cred.getClientExtensionResults ? cred.getClientExtensionResults() : {})
  const regJSON = (cred) => ({
    id: cred.id,
    rawId: b64u(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: ext(cred),
    response: {
      clientDataJSON: b64u(cred.response.clientDataJSON),
      attestationObject: b64u(cred.response.attestationObject),
      transports: cred.response.getTransports ? cred.response.getTransports() : [],
    },
  })
  const authJSON = (cred) => ({
    id: cred.id,
    rawId: b64u(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: ext(cred),
    response: {
      clientDataJSON: b64u(cred.response.clientDataJSON),
      authenticatorData: b64u(cred.response.authenticatorData),
      signature: b64u(cred.response.signature),
      userHandle: cred.response.userHandle ? b64u(cred.response.userHandle) : undefined,
    },
  })

  // Browser signals for the per-poll device fingerprint (hashed on the server, never stored as such).
  const signals = () => {
    const s = []
    try {
      s.push(screen.width + 'x' + screen.height, window.devicePixelRatio, Intl.DateTimeFormat().resolvedOptions().timeZone)
      s.push((navigator.languages || []).join(','), navigator.hardwareConcurrency || '', navigator.deviceMemory || '', navigator.maxTouchPoints || 0)
    } catch (e) {}
    try {
      const gl = document.createElement('canvas').getContext('webgl')
      if (gl) {
        const d = gl.getExtension('WEBGL_debug_renderer_info')
        s.push(d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
      }
    } catch (e) {}
    return s.join('|').slice(0, 600)
  }

  async function createPasskey(root, kind) {
    if (!supported()) return say(root, root.dataset.msgUnsupported, true)
    say(root, root.dataset.msgWorking)
    const o = await post('/api/passkey/' + kind + '/options', { lang: L })
    if (!o.ok) return say(root, o.data.error || root.dataset.msgCancelled, true)
    let cred
    try {
      cred = await navigator.credentials.create({ publicKey: creation(o.data.options) })
    } catch (e) {
      return say(root, root.dataset.msgCancelled, true)
    }
    const v = await post('/api/passkey/' + kind + '/verify', { lang: L, credential: regJSON(cred) })
    if (!v.ok || !v.data.redirect) return say(root, v.data.error || root.dataset.msgCancelled, true)
    location.href = v.data.redirect
  }

  async function signIn(root) {
    if (!supported()) return say(root, root.dataset.msgUnsupported, true)
    say(root, root.dataset.msgWorking)
    const o = await post('/api/passkey/login/options', { lang: L })
    if (!o.ok) return say(root, o.data.error || root.dataset.msgCancelled, true)
    let cred
    try {
      cred = await navigator.credentials.get({ publicKey: request(o.data.options) })
    } catch (e) {
      return say(root, root.dataset.msgCancelled, true)
    }
    const v = await post('/api/passkey/login/verify', { lang: L, credential: authJSON(cred), next: root.dataset.next || '/' })
    if (!v.ok || !v.data.redirect) return say(root, v.data.error || root.dataset.msgCancelled, true)
    location.href = v.data.redirect
  }

  async function vote(root, candidate, buttons) {
    if (!supported()) return say(root, root.dataset.msgUnsupported, true)
    buttons.forEach((b) => (b.disabled = true))
    const again = (text) => {
      say(root, text, true)
      buttons.forEach((b) => (b.disabled = false))
    }
    say(root, root.dataset.msgPrompt)
    const poll = root.dataset.poll
    const o = await post('/api/vote/options', { lang: L, poll, candidate })
    if (!o.ok) return o.data.redirect ? (location.href = o.data.redirect) : again(o.data.error || root.dataset.msgCancelled)
    let cred
    try {
      cred = await navigator.credentials.get({ publicKey: request(o.data.options) })
    } catch (e) {
      return again(root.dataset.msgCancelled)
    }
    const v = await post('/api/vote', { lang: L, poll, candidate, credential: authJSON(cred), mirror: store.get(DT_KEY), signals: signals() })
    if (v.data.redirect) return (location.href = v.data.redirect)
    again(v.data.error || root.dataset.msgCancelled)
  }

  const copy = async (btn) => {
    const text = btn.dataset.copy
    try {
      await navigator.clipboard.writeText(text)
    } catch (e) {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      try {
        document.execCommand('copy')
      } catch (e2) {}
      ta.remove()
    }
    const before = btn.textContent
    btn.textContent = btn.dataset.copied || before
    setTimeout(() => (btn.textContent = before), 1500)
  }

  // One submit per form: a double tap sent the sign-in code twice and the second check failed (2026-11-02).
  // Disabled after the form data is taken, so the pressed button's own value still goes; re-enabled on Back.
  document.addEventListener('submit', (ev) => {
    if (ev.defaultPrevented) return
    const f = ev.target
    if (f.dataset.sent) return ev.preventDefault()
    f.dataset.sent = '1'
    setTimeout(() => f.querySelectorAll('button').forEach((b) => (b.disabled = true)), 0)
  })
  window.addEventListener('pageshow', (ev) => {
    if (!ev.persisted) return
    document.querySelectorAll('form[data-sent], form[data-checking]').forEach((f) => {
      delete f.dataset.sent
      delete f.dataset.checking
      const tok = f.querySelector('input[name="recaptcha"]')
      if (tok) tok.value = '' // a Google token is single-use
      f.querySelectorAll('button').forEach((b) => (b.disabled = false))
    })
  })

  const ready = () => {
    // In-app browser on a page that needs a passkey: KakaoTalk opens the phone's real browser by itself.
    const ext = document.querySelector('.inapp[data-auto]')
    if (ext) location.href = ext.dataset.auto
    const reg = document.querySelector('[data-passkey-register-section]')
    if (reg) {
      const b = reg.querySelector('[data-passkey-register]')
      b.disabled = false
      b.addEventListener('click', () => createPasskey(reg, 'register'))
    }
    const add = document.querySelector('[data-passkey-add-section]')
    if (add) {
      const b = add.querySelector('[data-passkey-add]')
      b.disabled = false
      b.addEventListener('click', () => createPasskey(add, 'add'))
    }
    const login = document.querySelector('.passkey-login')
    if (login) {
      const b = login.querySelector('[data-passkey-login]')
      b.disabled = false
      b.addEventListener('click', () => signIn(login))
    }
    // Firebase phone auth: the phone form needs Google's invisible reCAPTCHA token before it is sent.
    const rf = document.querySelector('form[data-recaptcha]')
    if (rf) {
      let widget = null
      const tokenInput = rf.querySelector('input[name="recaptcha"]')
      rf.addEventListener('submit', (ev) => {
        if (tokenInput.value) return
        ev.preventDefault()
        // A second tap while Google's check runs must not send the form twice (the second send replaced the code page).
        if (rf.dataset.checking) return
        rf.dataset.checking = '1'
        rf.querySelectorAll('button').forEach((b) => (b.disabled = true))
        const failed = () => {
          delete rf.dataset.checking
          rf.querySelectorAll('button').forEach((b) => (b.disabled = false))
        }
        // reCAPTCHA Enterprise (SMS defense): a scored token for the action Google expects.
        if (rf.dataset.rcmode === 'enterprise') {
          const ent = (tries) => {
            const e = window.grecaptcha && window.grecaptcha.enterprise
            if (!e || !e.execute) {
              if (tries > 100) return failed()
              return setTimeout(() => ent(tries + 1), 100)
            }
            e.ready(() =>
              e.execute(rf.dataset.recaptcha, { action: 'sendVerificationCode' }).then(
                (tok) => {
                  if (tokenInput.value) return
                  tokenInput.value = tok
                  rf.submit()
                },
                failed,
              ),
            )
          }
          return ent(0)
        }
        const go = (tries) => {
          const g = window.grecaptcha
          if (!g || !g.render) {
            if (tries > 100) return
            return setTimeout(() => go(tries + 1), 100)
          }
          if (widget === null)
            widget = g.render(rf.querySelector('.recaptcha'), {
              sitekey: rf.dataset.recaptcha,
              size: 'invisible',
              callback: (tok) => {
                if (tokenInput.value) return
                tokenInput.value = tok
                rf.submit()
              },
              'error-callback': () => {
                delete rf.dataset.checking
                rf.querySelectorAll('button').forEach((b) => (b.disabled = false))
              },
            })
          g.execute(widget)
        }
        go(0)
      })
    }
    const root = document.getElementById('vote')
    if (root) {
      // Keep the device token in browser storage too: clearing only cookies does not make a second vote possible.
      if (root.dataset.dt && !store.get(DT_KEY)) store.set(DT_KEY, root.dataset.dt)
      const buttons = Array.prototype.slice.call(document.querySelectorAll('[data-vote]'))
      buttons.forEach((b) => {
        b.disabled = false
        b.addEventListener('click', () => vote(root, b.dataset.vote, buttons))
      })
    }
    document.querySelectorAll('[data-copy]').forEach((b) => {
      if (b.dataset.webshare) return
      b.addEventListener('click', () => copy(b))
    })
    // "Rally votes": the phone's share sheet when there is one, otherwise copy the message and link.
    document.querySelectorAll('[data-webshare]').forEach((b) =>
      b.addEventListener('click', () => {
        if (navigator.share) navigator.share({ text: b.dataset.text, url: b.dataset.webshare }).catch(() => {})
        else copy(b)
      }),
    )
    document.querySelectorAll('[data-share-poll]').forEach((share) =>
      share.querySelectorAll('[data-share-click]').forEach((el) =>
        el.addEventListener('click', () => {
          try {
            fetch('/api/share', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ poll: share.dataset.sharePoll }), keepalive: true, credentials: 'same-origin' })
          } catch (e) {}
        }),
      ),
    )
    // Live contest gauge: while the poll is open, refresh the split for members who can see it; the boundary slides.
    const g = document.querySelector('[data-gauge]')
    if (g && g.dataset.gauge) {
      const tick = async () => {
        if (document.hidden) return
        try {
          const r = await fetch('/api/tally/' + g.dataset.gauge + '?lang=' + (g.dataset.lang || 'en'), { credentials: 'same-origin' })
          if (!r.ok) return
          const d = await r.json()
          const duel = d.segs.length === 2
          d.segs.forEach((x) => {
            const seg = g.querySelector('[data-seg="' + x.id + '"]')
            if (seg) {
              seg.style.width = (d.n ? x.pct : 100 / d.segs.length) + '%'
              seg.className = 'g-seg ' + x.tone
              const inner = seg.querySelector('.g-in')
              if (inner) inner.textContent = d.n && x.pct >= 9 ? x.pct + '%' : ''
            }
            const cand = g.querySelector('[data-cand="' + x.id + '"]')
            if (cand) {
              cand.classList.toggle('lead', x.lead)
              const pct = cand.querySelector('[data-pct]')
              if (pct) pct.textContent = x.pct + '%'
              const votes = cand.querySelector('[data-votes]')
              if (votes) votes.textContent = x.votes
            }
            const you = g.querySelector('[data-you="' + x.id + '"]')
            if (you) you.style.left = x.from + x.pct / 2 + '%'
          })
          if (!d.open) clearInterval(timer)
          g.classList.toggle('duel', duel)
        } catch (e) {}
      }
      const timer = setInterval(tick, ${GAUGE_REFRESH_SECONDS * 1000})
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready)
  else ready()
})()
`

export const APP_JS_VERSION = (() => {
  let h = 0x811c9dc5
  for (let i = 0; i < APP_JS.length; i++) h = Math.imul(h ^ APP_JS.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
})()
