// Legal documents — English (authoritative). DRAFT pending lawyer review (2026-10-29).
// Every statement here describes what the code actually does (src/lib/*, migrations/*); change the code, change the text.
// Rendered at /terms, /privacy, /policy, /ai by views/pages.tsx (DocPage). Korean equivalent: ./ko.ts.
import { BRAND, BUSINESS, CARD_DAILY_LIMIT, CARD_MAX_ATTEMPTS, CARD_MAX_FETCHES, CARD_MAX_SEARCHES, CARD_MODEL, DAILY_COMMENT_LIMIT, DAILY_POLL_LIMIT, DAILY_POST_LIMIT, DEVICE_HASH_KEEP_DAYS, DEVICE_TOKEN_DAYS, INVITE_COOKIE_DAYS, MAX_CANDIDATES, MIN_AGE_BY_COUNTRY, MIN_AGE_DEFAULT, MIN_CANDIDATES, MIN_CELL, OTP_PER_IP_PER_HOUR, OTP_PER_PHONE_PER_HOUR, OTP_TTL_MS, PHONE_FLOW_COOKIE_MIN, REJOIN_BLOCK_DAYS, REPORT_HIDE_THRESHOLD, SESSION_DAYS, SOURCE_COOKIE_HOURS, TEMP_HIDE_DAYS, VOTES_PER_NETWORK_PER_POLL } from '../config'

export type LegalTable = { head: string[]; rows: string[][] }
export type LegalSection = { heading: string; paras?: string[]; bullets?: string[]; table?: LegalTable; after?: string[] }
export type LegalDoc = { title: string; version: string; intro: string[]; sections: LegalSection[] }
export const LEGAL_KEYS = ['terms', 'privacy', 'policy', 'ai'] as const
export type LegalKey = (typeof LEGAL_KEYS)[number]

const B = BRAND
const OP = BUSINESS.name.en
const REP = BUSINESS.ceo.en
const ADDR = BUSINESS.address.en
const MAIL = BUSINESS.contact
const KR_AGE = MIN_AGE_BY_COUNTRY.KR ?? MIN_AGE_DEFAULT
const OTP_MIN = OTP_TTL_MS / 60000

export const VERSION_LINE_EN = 'Version 1.1 — published 4 November 2026, effective 11 November 2026 (Twilio removed as a service provider; version 1.0 of 4 November 2026 applies until then)'
const LANG_NOTE = 'This document is published in English and Korean. The English text is the authoritative version; the Korean text is a translation provided for convenience. If they differ, the English text prevails.'

// ---------------------------------------------------------------------------------------------------------------------
const terms: LegalDoc = {
  title: 'Terms of Service',
  version: VERSION_LINE_EN,
  intro: [
    `These Terms govern your use of ${B} (the “Service”), a website operated by ${OP}, a sole proprietorship registered in the Republic of Korea and represented by ${REP} (the “Operator”, “we”). By creating an account or using the Service you agree to these Terms and to the Privacy Policy, the Community Rules and the AI Notice, which form part of these Terms.`,
    LANG_NOTE,
  ],
  sections: [
    {
      heading: '1. What the Service is',
      paras: [
        `${B} is a free website. A member puts ${MIN_CANDIDATES} to ${MAX_CANDIDATES} AI services or products side by side as the candidates of a poll. For 24 hours, verified members vote for one candidate. When the poll closes, the result — vote counts and shares, and the shares by gender and age group — stays public permanently as a record and can be found through search engines. Each candidate carries an AI comparison card that summarises the maker’s official information with links to the source. A free board sits next to the polls for discussion. Polls themselves have no comments.`,
        'A result expresses the choices of the members who voted in that poll at that time. It is not the Operator’s opinion, not a measurement of quality or safety, not a ranking endorsed by anyone and not advice. Decide for yourself what to buy or use.',
      ],
    },
    {
      heading: '2. Who may join',
      bullets: [
        'One person, one account. An account is tied to one mobile phone number; the same number cannot open a second account. Landline, internet (VoIP) and virtual numbers are not accepted.',
        `You must be at least ${MIN_AGE_DEFAULT} years old, or at least ${KR_AGE} years old if you join with a phone number from the Republic of Korea. We check this against the birth year you give (self-reported). If we learn that an account belongs to someone under the limit, we erase it.`,
        'You must give your real birth year and gender. Results are grouped by them. They are self-reported and are never presented as verified.',
        'You may not use the Service where doing so is unlawful for you, and you may not transfer, sell or lend your account.',
      ],
    },
    {
      heading: '3. Your account and passkeys',
      paras: [
        'Joining takes four steps: a one-time code sent by SMS to your mobile number, your birth year and gender, your agreement to these Terms and the Privacy Policy, and the creation of a passkey on your device. The passkey is unlocked with your fingerprint, face or screen lock and is used to sign in and to sign every vote you cast.',
        'The biometric check happens on your own device. The Service never receives biometric data. What the Service receives is a cryptographic signature produced by your device; what it stores is the public key of the passkey and technical identifiers described in the Privacy Policy.',
        `You are responsible for the devices and passkeys on your account. You can add a passkey for another device from My page. If you believe a device or passkey on your account has been compromised, contact us at ${MAIL} or leave the Service from My page. A signed-in session lasts up to ${SESSION_DAYS} days; you can sign out at any time from My page. A suspended or terminated account cannot sign in.`,
      ],
    },
    {
      heading: '4. Voting rules',
      bullets: [
        'Only members who have completed sign-up may vote. Reading polls and results needs no account.',
        `Each vote is signed with your passkey at the moment you cast it. One member has one vote per poll, and one device has one vote per poll. At most ${VOTES_PER_NETWORK_PER_POLL} votes per poll are accepted from one network address (for example one shared Wi-Fi); beyond that, switch to mobile data.`,
        'Sign-up and voting are not possible through data-centre or hosting networks, VPNs, Tor, iCloud Private Relay or similar relays. Turn them off for this site.',
        'A vote is final. It cannot be changed or withdrawn, and it stays in the count after you leave the Service — as an anonymous count without any link to you.',
        `The result shows the overall counts and shares, the shares by gender and by age group (a group with fewer than ${MIN_CELL} votes is hidden), and a line called “How these votes were cast”: the number of verified voters, the share of voters who joined within the last 24 hours, votes that arrived through a maker’s campaign link, and attempts blocked at the door. Until a poll closes, only members who have voted in it see the interim result; after it closes everyone does.`,
        'Individual votes are never shown to anyone. You can see your own votes on My page; nobody else can.',
        'Votes are never removed or recounted. Attempts refused at the door — a second vote from the same device, a network over its limit, a blocked network — are not counted and are disclosed on the result as numbers. If a rule-based check detects an unusual pattern, the poll shows an “Under review” notice while the Operator looks at it. The Operator may confirm or clear the notice and may sanction the accounts involved under the Community Rules; the votes themselves are not removed.',
        'A poll cannot be edited or deleted once it is published; the poll and its result remain public as a record. The Operator may hide a poll that breaks the Community Rules or the law; votes already cast are not altered.',
        'Polls have no comments. Discussion takes place on the board.',
      ],
    },
    {
      heading: '5. Polls, posts and your content',
      bullets: [
        `A poll must compare ${MIN_CANDIDATES} to ${MAX_CANDIDATES} real, identifiable products or services, each named with its maker. The optional question must be factual and fit one line. Links, advertising, personal data of other people and unlawful content are not allowed. You may create up to ${DAILY_POLL_LIMIT} polls a day.`,
        `On the board you appear under an anonymous nickname. You may write up to ${DAILY_POST_LIMIT} posts and ${DAILY_COMMENT_LIMIT} comments a day and may delete your own posts and comments. The board rules are in the Community Rules.`,
        'You keep ownership of what you write. You grant the Operator a non-exclusive, worldwide, royalty-free licence to host, store, reproduce, display, distribute and adapt the format of your polls, posts and comments as part of the Service, including in result images, embed widgets, search listings and social-media previews. For polls this licence continues after you leave, because polls and their results stay public as records; posts and comments remain on the board unless you delete them before leaving.',
        'You confirm that you have the right to post what you post and that it does not infringe anyone’s rights. Content written by members is shown as written and is not translated by the Service.',
      ],
    },
    {
      heading: '6. Makers and campaign links',
      bullets: [
        'A member who works for the maker of a product may claim it by verifying an email address at the maker’s official domain, as found on the AI comparison card. Addresses at free email providers are not accepted. We keep the domain and a one-way hash of the address, not the address itself.',
        'A verified maker receives a campaign link for every poll that includes the product. Votes cast after arriving through that link are counted like any other vote and are disclosed on the result as maker-campaign votes, by maker. They are neither removed nor weighted.',
        'Makers may not offer money, goods or any other reward for votes, use several accounts or phone numbers, or ask others to vote through VPNs or automation. The Operator may revoke a claim and hide campaign links on breach.',
      ],
    },
    {
      heading: '7. Prohibited conduct',
      bullets: [
        'Manipulating votes: using more than one account, phone numbers you do not control, automated tools, VPNs, proxies, data-centre or relay networks, or tampering with the device token or browser signals; buying, selling or rewarding votes.',
        'Posting unlawful content, including non-consensual intimate images, sexual exploitation material, defamation, threats, harassment, hate speech, or content that infringes privacy, copyright or trademarks.',
        'Posting personal data of other people, advertising, spam, links in polls, or impersonating a maker, another person or the Operator.',
        'Interfering with the Service: attacking its security, bypassing its limits, scraping it at a scale that burdens it, or using it to send unsolicited messages.',
      ],
    },
    {
      heading: '8. Reports and moderation',
      paras: [
        'Every poll, post and comment has a Report button for signed-in members. Reports of non-consensual intimate images or sexual exploitation material hide the content at once, before the Operator reviews it. Reports of defamation or privacy violation made by the person concerned about a post or comment lead to a temporary measure of up to ' +
          `${TEMP_HIDE_DAYS} days, shown on the board and to the author, as provided by Article 44-2 of the Korean Act on Promotion of Information and Communications Network Utilization and Information Protection. Other reports hide a post or comment, or put an “Under review” notice on a poll, once ${REPORT_HIDE_THRESHOLD} different members have reported it, until the Operator decides.`,
        'Breaches of these Terms or the Community Rules are handled in steps — warning, temporary suspension, termination — with immediate termination for serious breaches such as vote manipulation or unlawful content. You can appeal any measure by email. Details, timings and the appeal procedure are in the Community Rules.',
      ],
    },
    {
      heading: '9. AI comparison cards',
      paras: [
        'The AI comparison card on each candidate is generated by an AI model from the maker’s official pages and is labelled “AI summary — check the source”. It may be incomplete, outdated or wrong, or may describe the wrong product. It is not an endorsement by the Operator or by the maker, and the maker is not responsible for it. Prices, plans and specifications change; check the linked source before relying on it. The card is not used to count or rank votes. How the cards are made, and how to report a wrong card, is described in the AI Notice.',
      ],
    },
    {
      heading: '10. Third-party services',
      paras: [
        'The Service runs on Cloudflare’s network, sends verification codes through Google (Firebase Authentication), sends maker-verification emails through Resend and generates AI comparison cards through Anthropic’s API. What each of them receives is set out in the Privacy Policy. Your mobile carrier may charge you for receiving SMS messages in some countries. Share buttons open X or Threads only when you click them.',
      ],
    },
    {
      heading: '11. A free service, provided as is',
      paras: [
        'The Service is free and currently carries no advertising. We may change, suspend or discontinue the Service or any part of it. Where practicable we give notice on the site. The Service is provided “as is” and “as available”; to the extent permitted by law we give no warranty that it will be uninterrupted, error-free or fit for a particular purpose, and we do not guarantee that results, cards or member content are accurate.',
      ],
    },
    {
      heading: '12. Liability',
      paras: [
        'To the extent permitted by the law that applies to you, the Operator is not liable for indirect or consequential loss, for loss of profit or data, for content written by members, for errors in AI comparison cards, for decisions you take on the basis of a result or a card, or for third-party services the Service depends on.',
        'Nothing in these Terms excludes or limits liability for intent or gross negligence, for death or personal injury caused by negligence, or any liability that cannot be excluded or limited under the law that applies to you, including consumer-protection law.',
      ],
    },
    {
      heading: '13. Ending the relationship',
      bullets: [
        `You may leave at any time from My page. Your account data is erased as described in the Privacy Policy; your votes remain only as anonymous counts; your polls stay public without an author; your posts and comments stay under their anonymous nickname unless you deleted them first. The same phone number cannot join again for ${REJOIN_BLOCK_DAYS} days.`,
        'We may warn you, suspend your account or terminate it for breaches of these Terms or the Community Rules, with immediate termination for serious breaches. A restricted account is told so at sign-in; you can ask for the reasons and appeal by email.',
        'Sections 4 (finality and public record of votes), 5 (licence for polls), 12 and 15 survive the end of your membership.',
      ],
    },
    {
      heading: '14. Changes to these Terms',
      paras: [
        'We may change these Terms. We publish the new version on this page with its effective date at least 7 days before it takes effect, or at least 30 days before if the change is unfavourable to members. If you continue to use the Service after the effective date, the new Terms apply to you; if you do not agree, leave the Service before that date.',
      ],
    },
    {
      heading: '15. Governing law and disputes',
      paras: [
        'These Terms are governed by the laws of the Republic of Korea. Disputes are brought before the competent court in Seoul, Republic of Korea, as far as the law allows. If you are a consumer, the mandatory consumer-protection rules of the country where you live continue to protect you, and nothing in this section takes away a right to bring proceedings in your own country that the law of that country gives you and that cannot be waived.',
      ],
    },
    {
      heading: '16. Contact',
      paras: [`${OP} (sole proprietorship, Republic of Korea) · Representative: ${REP} · ${ADDR} · Email: ${MAIL}`],
    },
  ],
}

// ---------------------------------------------------------------------------------------------------------------------
const privacy: LegalDoc = {
  title: 'Privacy Policy',
  version: VERSION_LINE_EN,
  intro: [
    `This Privacy Policy explains what personal data ${B} collects, why, for how long, who receives it and what rights you have. It is also the Operator’s privacy policy (개인정보처리방침) under Article 30 of the Personal Information Protection Act of the Republic of Korea and is written for readers in every country the Service is available in.`,
    LANG_NOTE,
  ],
  sections: [
    {
      heading: '1. Who is responsible',
      paras: [
        `Controller and operator: ${OP}, a sole proprietorship registered in the Republic of Korea. Representative and privacy officer (개인정보 보호책임자): ${REP}. Address: ${ADDR}. Email for all privacy matters: ${MAIL}.`,
      ],
    },
    {
      heading: '2. What we do not collect',
      paras: [
        'We collect the minimum the Service needs. We do not ask for your name, postal address, email address (except a work email if you choose to verify yourself as a maker), identity documents, photographs or payment details. We do not collect face or fingerprint data: the passkey check happens on your device and only a cryptographic signature reaches us. We do not store passwords. We do not store your phone number — only a keyed one-way hash of it. We run no advertising, no advertising profiles, no third-party analytics and sell no data.',
      ],
    },
    {
      heading: '3. What we collect, why and for how long',
      table: {
        head: ['Data', 'When', 'Purpose', 'How it is stored and for how long'],
        rows: [
          [
            'Mobile phone number and its country',
            'When you request a sign-up or sign-in code',
            'One account per person; sending the one-time code; checking that the number is a mobile line; rate limits',
            `The number is sent to Google, which delivers the code and screens the request for SMS fraud (see section 5). We keep the number itself only until you confirm the code (at most ${OTP_MIN} minutes; the sign-up step then stays open ${PHONE_FLOW_COOKIE_MIN} more minutes without the number). Afterwards we keep only a keyed one-way hash (HMAC) of the number and its country code. The hash stays while the account exists and ${REJOIN_BLOCK_DAYS} days after you leave (to block immediate re-registration), then it is erased.`,
          ],
          [
            'Birth year and gender (self-reported)',
            'Sign-up',
            'Grouping results by age group and gender; age check',
            'With your account until you leave. Each vote you cast carries your age group and gender as they were at that moment; that copy stays in the anonymous vote record.',
          ],
          [
            'Passkey credential data',
            'When you create a passkey',
            'Signing in; signing every vote',
            'Credential ID, public key, signature counter, authenticator model identifier (AAGUID), transport types, a backed-up flag, creation and last-use times. Deleted when you leave. No biometric data: your fingerprint or face is checked by your device and never sent to us.',
          ],
          [
            'Session token',
            'Sign-in',
            'Keeping you signed in',
            `Cookie “vs_sid” for ${SESSION_DAYS} days; the server keeps only a hash of the token. Deleted at sign-out, expiry or when you leave.`,
          ],
          ['Sign-up step cookie', 'During the phone step', 'Carrying you through the sign-up steps', `Cookie “vs_flow”, ${PHONE_FLOW_COOKIE_MIN} minutes.`],
          [
            'Device token',
            'When you first open a poll',
            'One vote per device per poll',
            `Cookie “vs_dt” (about ${Math.round(DEVICE_TOKEN_DAYS / 30)} months) and a copy in your browser’s local storage (“pollreal_dt”). On each vote only a keyed hash of the token bound to that poll is stored; those hashes are erased ${DEVICE_HASH_KEEP_DAYS} days after the vote.`,
          ],
          [
            'Device fingerprint signals',
            'When you vote',
            'One vote per device per poll; detecting manipulation',
            `Your network address (IPv4 address or IPv6 /64), browser user agent, screen size and pixel ratio, time zone, browser languages, CPU count, device memory and touch points are combined into a keyed hash bound to that poll. The signals themselves are not stored. The hash is erased after ${DEVICE_HASH_KEEP_DAYS} days.`,
          ],
          [
            'Network information',
            'Every sign-up and vote request',
            `Refusing data centres, VPNs, Tor and relays; at most ${VOTES_PER_NETWORK_PER_POLL} votes per poll from one network`,
            `IP address, network number (ASN), network organisation and country as provided by Cloudflare for the request. We store only a keyed hash of the network bound to the poll (erased after ${DEVICE_HASH_KEEP_DAYS} days) and, in the code-request log, a hash of the IP address. Refused attempts are stored as counts per poll and reason, without any member link.`,
          ],
          [
            'Code-request log',
            'Every request for an SMS code',
            `Rate limits (${OTP_PER_PHONE_PER_HOUR} codes per number and ${OTP_PER_IP_PER_HOUR} per network address an hour; daily caps per site, country and network provider); cost control; abuse prevention`,
            `Hash of the number, hash of the IP address, country and network number, outcome, time. Erased after ${DEVICE_HASH_KEEP_DAYS} days.`,
          ],
          [
            'Votes',
            'When you vote',
            'Counting; the result and its “How these votes were cast” line; integrity',
            `Poll, candidate, time, age group, gender, whether you joined within the last 24 hours, how you arrived (direct, share, embed, maker campaign, invite), a maker-claim reference and the device and network hashes (${DEVICE_HASH_KEEP_DAYS} days). Linked to your account until you leave; afterwards kept indefinitely without any link to you, as an anonymous count. Your own votes are shown to you on My page and to nobody else.`,
          ],
          ['Polls you create', 'When you publish a poll', 'Running the poll and its public result', 'Maker and product names, category, question, language, time. Linked to your account until you leave; the poll and its result remain public permanently.'],
          [
            'Posts and comments',
            'When you write on the board',
            'The board',
            'Text, the anonymous nickname you had when writing, time. Kept until you delete them or they are removed. After you leave they remain under that nickname without any link to you.',
          ],
          ['Reports you file', 'When you report content', 'Moderation; legal duties (temporary measures, removal of unlawful content)', 'Target, reason, your description, time, a reference to your account. Kept as a record of how the report was handled.'],
          [
            'Maker verification',
            'Only when you claim a product as its maker',
            'Verifying that you work for the maker',
            'Your work email address is sent to Resend to deliver the verification link (see section 5). We store the email domain, a keyed hash of the address, the claim status and times. The hash is erased and the claim revoked when you leave.',
          ],
          [
            'Invite attribution',
            'When you arrive through an invite link or join through one',
            'Measuring how the Service spreads; detecting clusters of fake accounts',
            `Cookie “vs_inv” for ${INVITE_COOKIE_DAYS} days; an “invited by” reference on your account; the inviter sees only a count. No reward is attached. The reference is removed when either of you leaves.`,
          ],
          [
            'Share and embed attribution',
            'When you arrive through a share link or an embedded widget',
            'Counting which channel brought voters',
            `Cookie “vs_src” for ${SOURCE_COOKIE_HOURS} hours, bound to one poll. A vote stores only the channel name. Share clicks, arrivals and embed loads are counted per poll and day without any personal data.`,
          ],
          [
            'Bot check',
            'Phone step of sign-up; creating a poll',
            'Telling humans from automated programs',
            'Cloudflare Turnstile runs in your browser, may set its own cookies and processes device and network signals under Cloudflare’s privacy policy. We receive only pass or fail.',
          ],
          ['Server logs', 'Every request', 'Security, error diagnosis, abuse prevention', 'Cloudflare keeps request logs (IP address, URL, user agent, time) under its own retention. We see aggregated analytics and error logs.'],
          ['Account settings', 'Sign-up and use', 'Running your account', 'Interface language, anonymous nickname, invite code, an internal random user handle for passkeys. Erased when you leave.'],
          ['Aggregate statistics', 'Daily', 'Measuring the Service', 'Counts only — sign-ups, votes, polls, shares, costs. No personal data. Kept indefinitely.'],
        ],
      },
    },
    {
      heading: '4. Legal bases',
      paras: ['For readers under the GDPR or the UK GDPR, and in the terms of Korean law, we rely on the following bases:'],
      bullets: [
        'Performance of our contract with you (GDPR Article 6(1)(b); Korean PIPA Article 15(1)4): account, sign-in, voting, polls, board, maker verification, invites.',
        'Our legitimate interests (GDPR Article 6(1)(f); PIPA Article 15(1)6): keeping votes honest and the Service secure — device tokens, fingerprint hashes, network checks, the code-request log, rate limits, rule-based anomaly review — and measuring how the Service spreads. These values are hashed, bound to one poll where possible and kept for short periods, so that the interference with your privacy stays minimal.',
        'Legal obligations (GDPR Article 6(1)(c); PIPA Article 15(1)2): handling reports, temporary measures and removal of unlawful content under Korean law, and responding to lawful requests from authorities.',
        'Consent (GDPR Article 6(1)(a); PIPA Article 15(1)1) where the law requires it. You give it at sign-up by ticking the box; you withdraw it by leaving the Service. We set no cookies that would need separate consent.',
      ],
    },
    {
      heading: '5. Who receives your data, and transfers abroad',
      paras: [
        'We use the following service providers (processors). All of them are established in the United States, so your data leaves your country, and — for users in Korea — leaves Korea. Under Korean law this is an entrustment of processing and storage necessary to perform our contract with you, disclosed here under Article 28-8(1)3 of the PIPA; for users in the EU and the UK the transfers rest on the providers’ standard contractual clauses or an equivalent mechanism. You may refuse these transfers by not using the Service; the Service cannot be provided without them.',
      ],
      table: {
        head: ['Recipient', 'Country', 'When and how', 'Data', 'Purpose', 'Retention'],
        rows: [
          [
            'Cloudflare, Inc.',
            'United States (global network; requests are served at the location nearest to you)',
            'Continuously, as you use the site',
            'All request data (IP address, cookies, pages requested) and the database contents listed in section 3',
            'Hosting (Workers, D1 database), bot check (Turnstile), security, request logs',
            'Database contents: the periods in section 3. Logs: under Cloudflare’s retention',
          ],
          ['Google LLC (Firebase Authentication / Identity Platform)', 'United States', 'When you request a code', 'Mobile phone number, interface language; a reCAPTCHA check on the sign-up page', 'Sending and checking the one-time code; scoring the request for SMS fraud (reCAPTCHA SMS defense)', 'The account record Google creates for the number is deleted as soon as the code is confirmed. Google keeps its own delivery and security records under its terms'],
          ['Resend, Inc.', 'United States', 'Only when you ask for maker verification', 'Work email address, product name', 'Delivering the verification email', 'Under Resend’s terms'],
          ['Anthropic, PBC', 'United States', 'When an AI comparison card is generated', 'Maker name, product name, category — no personal data', 'Generating the AI comparison card', 'Under Anthropic’s API terms; no personal data is sent'],
        ],
      },
      after: [
        'We disclose personal data to third parties only when the law requires it (for example a court order or a lawful request from a competent authority), to protect the rights and safety of members or the public, or — with prior notice to you — if the Service is transferred to another operator. We do not sell personal data and do not share it for advertising.',
      ],
    },
    {
      heading: '6. Children',
      paras: [
        `The Service is not for children. We refuse sign-up below ${MIN_AGE_DEFAULT} years of age, and below ${KR_AGE} years for phone numbers from the Republic of Korea, based on the birth year given. If you believe a child has joined, tell us at ${MAIL} and we will erase the account.`,
      ],
    },
    {
      heading: '7. Your rights',
      bullets: [
        'Access: My page shows your profile data, passkeys, invites, maker claims, polls, votes and posts. For a full copy of your data, or for a machine-readable copy where the law gives you that right, write to us.',
        'Correction: your birth year and gender cannot be edited on the site; write to us and we will correct them.',
        'Erasure: leave the Service from My page (“Leave”). Section 8 describes exactly what is erased and what remains. You may also delete your own posts and comments at any time.',
        'Restriction and objection: you may object to processing based on our legitimate interests, and ask us to restrict processing, by writing to us. Note that the integrity measures in section 3 apply to every vote and cannot be switched off for one member.',
        'Withdrawal of consent: by leaving the Service.',
        'Complaints: in Korea you may contact the Personal Information Infringement Report Center (privacy.kisa.or.kr, 118), the Personal Information Dispute Mediation Committee (kopico.go.kr, 1833-6972), the Supreme Prosecutors’ Office (1301) or the National Police Agency (ecrm.police.go.kr, 182). In the EU or the UK you may complain to your data-protection authority.',
      ],
      after: [
        `Because we hold no name or email address for you, we may ask you to prove that you control the account — for example by acting from your signed-in account — before we answer a request. We answer within 10 days, or within the time the law that applies to you allows. Write to ${MAIL}.`,
      ],
    },
    {
      heading: '8. What happens when you leave',
      bullets: [
        'Erased at once: birth year, gender, nickname, country, language, invite code, passkey user handle, all passkeys, all sessions, the hash of your maker-verification email (your claims are revoked), and the “invited by” links in both directions.',
        `Kept ${REJOIN_BLOCK_DAYS} days, then erased: the hash of your phone number, so that the same number cannot open a new account during that time.`,
        'Kept without any link to you: your votes (as anonymous counts with age group, gender, arrival channel and time), your polls and their results (public, without an author), your posts and comments (under their anonymous nickname, until deleted), and your reports (as handling records).',
        `Erased on their normal schedule: device and network hashes and the code-request log (${DEVICE_HASH_KEEP_DAYS} days), expired sign-up steps and passkey challenges (minutes).`,
        'Daily statistics already computed are not recalculated.',
      ],
    },
    {
      heading: '9. Security',
      bullets: [
        'All traffic is encrypted in transit (HTTPS). Cookies are HttpOnly, Secure and SameSite; the site sends a strict Content Security Policy and checks the origin of every form and API request.',
        'Phone numbers, device values, email addresses and session tokens are stored only as keyed one-way hashes; the key is held outside the code and the database. No passwords exist. Device hashes are bound to one poll so that one poll’s voters cannot be linked to another’s.',
        'Access to production data is limited to the Operator through the hosting provider’s authenticated tools. We log administrative access as the hosting provider allows.',
        'If a breach affects your personal data, we will notify you and the competent authorities as the law requires.',
      ],
    },
    {
      heading: '10. Cookies and browser storage',
      table: {
        head: ['Name', 'Kind', 'Purpose', 'Lifetime'],
        rows: [
          ['vs_sid', 'Cookie (HttpOnly)', 'Signed-in session', `${SESSION_DAYS} days`],
          ['vs_flow', 'Cookie (HttpOnly)', 'Sign-up steps after the phone number', `${PHONE_FLOW_COOKIE_MIN} minutes`],
          ['vs_dt', 'Cookie (HttpOnly)', 'Device token — one vote per device per poll', `${DEVICE_TOKEN_DAYS} days`],
          ['pollreal_dt', 'Browser local storage', 'Copy of the device token (both are checked)', 'Until you clear site data'],
          ['vs_src', 'Cookie (HttpOnly)', 'Which link brought you to a poll (share, embed, maker campaign)', `${SOURCE_COOKIE_HOURS} hours`],
          ['vs_inv', 'Cookie (HttpOnly)', 'Invite attribution', `${INVITE_COOKIE_DAYS} days`],
          ['Cloudflare Turnstile', 'Third-party cookies and signals', 'Bot check on the phone step and poll creation', 'Under Cloudflare’s policy'],
        ],
      },
      after: ['All of these are necessary for the Service to work as described. We use no analytics, advertising or social-media tracking cookies. Fonts are served from our own site; no third-party font service sees your visit.'],
    },
    {
      heading: '11. Automated processing',
      paras: [
        'The Service applies automatic rules to keep votes honest: one vote per member, one vote per device and per-network limits per poll, refusal of data-centre, VPN, Tor and relay networks, rate limits on codes, and a rule-based check that puts an “Under review” notice on a poll when a burst of one-sided votes from brand-new members is detected. These rules do not profile you and make no decision about you beyond accepting or refusing a particular attempt; the review itself is done by a person. No AI model is used to count votes, rank candidates, moderate content or decide about accounts (see the AI Notice). You may contact us if you believe a rule was applied to you wrongly.',
      ],
    },
    {
      heading: '12. Changes to this policy',
      paras: [
        'We publish changes on this page with the new version number and effective date at least 7 days before they take effect, or at least 30 days before for changes that materially affect your rights. Earlier versions are available on request.',
      ],
    },
    {
      heading: '13. Contact',
      paras: [`${OP} · Representative and privacy officer: ${REP} · ${ADDR} · ${MAIL}`],
    },
  ],
}

// ---------------------------------------------------------------------------------------------------------------------
const policy: LegalDoc = {
  title: 'Community Rules',
  version: VERSION_LINE_EN,
  intro: [
    `These rules say how ${B} is run: what you may post, what can be reported, what happens to reported content, what is never removed, how accounts are sanctioned and how to appeal. They form part of the Terms of Service.`,
    LANG_NOTE,
  ],
  sections: [
    {
      heading: '1. Polls',
      bullets: [
        `A poll compares ${MIN_CANDIDATES} to ${MAX_CANDIDATES} real, identifiable products or services, each named with its maker (for example “OpenAI — ChatGPT”). Candidates that are not products or services — people, groups, opinions, events — are not allowed.`,
        'The optional question is one factual line about the choice (for example “Best for writing code in a large repository?”). No links, no advertising, no slogans, no personal data of other people, no insults.',
        `Up to ${DAILY_POLL_LIMIT} polls a day per member. Duplicate polls are allowed; each runs on its own.`,
        'Polls cannot be edited or deleted after publication. A poll that breaks these rules may be hidden by the Operator; its votes are not altered.',
      ],
    },
    {
      heading: '2. The board',
      bullets: [
        'The board is for talking about AI tools, products and poll results. Authors appear under an anonymous nickname.',
        'Not allowed: personal data or photographs of other people, non-consensual intimate images or sexual exploitation material, defamation, threats, harassment, hate speech, unlawful content, advertising, spam, repeated identical posts, and content that infringes copyright or trademarks.',
        `Up to ${DAILY_POST_LIMIT} posts and ${DAILY_COMMENT_LIMIT} comments a day per member. You may delete your own posts and comments.`,
      ],
    },
    {
      heading: '3. Honest voting',
      paras: ['Any attempt to cast or obtain more than one vote per person per poll is manipulation. This includes:'],
      bullets: [
        'using more than one account or phone numbers you do not control;',
        'voting through VPNs, proxies, data-centre, Tor or relay networks, or tampering with the device token or browser signals;',
        'automation of any kind;',
        'offering or accepting money, goods, discounts or any reward for votes, or organising votes while hiding that you are the maker.',
      ],
      after: [
        'Attempts caught at the door are refused and shown on the result as counts. Patterns detected later put an “Under review” notice on the poll until the Operator has looked at it. If manipulation is confirmed, the notice stays on the result and the accounts involved are sanctioned under section 7. Votes themselves are never removed or recounted (see section 6).',
      ],
    },
    {
      heading: '4. Makers',
      bullets: [
        'If you work for the maker of a product, claim it with an email address at the maker’s official domain. You then receive campaign links; votes through them are disclosed on the result as maker-campaign votes and are counted like any other vote.',
        'Makers may ask their customers and followers to vote openly through the campaign link. They may not offer rewards for votes, hide their identity, use several accounts, or dispute a result because of its outcome.',
        'False claims, or breaches of section 3 by a maker, lead to revocation of the claim and sanctions on the accounts involved.',
      ],
    },
    {
      heading: '5. Reporting',
      paras: ['Every poll, post and comment has a Report button, available to signed-in members at any time. Each member can report a given item once. What happens next depends on the reason:'],
      table: {
        head: ['Reason', 'Immediate effect', 'Then'],
        rows: [
          ['Non-consensual intimate images / sexual exploitation material', 'The content is hidden at once, on the first report.', 'The Operator reviews it. Unlawful material is removed permanently and the account terminated. Required by Article 22-5(1) of the Korean Telecommunications Business Act.'],
          [
            'Defamation or privacy violation, reported by the person concerned (posts and comments)',
            `Temporary measure: the post or comment is hidden for up to ${TEMP_HIDE_DAYS} days. The measure is shown on the board and to the author. A description of the right concerned is required.`,
            'The author may object and the reporter may add information by email. The Operator decides within the period whether the content is removed or restored. Procedure under Article 44-2 of the Korean Act on Promotion of Information and Communications Network Utilization and Information Protection.',
          ],
          ['Defamation or privacy violation on a poll', 'The report is recorded.', 'Polls contain only maker and product names and a question, so the Operator reviews before hiding.'],
          [
            'Illegal content, suspected vote manipulation, advertising or spam, abuse or hate, other',
            `The report is recorded. Once ${REPORT_HIDE_THRESHOLD} different members report the same post or comment, it is hidden until the Operator decides; a poll instead shows an “Under review” notice.`,
            'The Operator reviews and removes, restores or sanctions. Reports are also used to spot manipulation patterns.',
          ],
        ],
      },
      after: [`You can also report by email to ${MAIL}, including the link to the item. Knowingly false reports are a breach of these rules.`],
    },
    {
      heading: '6. What is removed, and what never is',
      bullets: [
        'Removed or hidden when they break these rules or the law: posts, comments, polls, campaign links and maker claims.',
        'Never removed, altered or recounted: votes. A vote that was accepted stays in the count, even if the voter is later sanctioned or leaves, even if the poll is hidden. What we do instead is disclose: attempts blocked at the door, maker-campaign votes and the share of brand-new members are shown on every result, and confirmed manipulation is marked on the result.',
        'Never shown: who voted for what. Only aggregated results are published, and a gender or age group with fewer than ' + `${MIN_CELL} votes is hidden.`,
      ],
    },
    {
      heading: '7. Account sanctions',
      table: {
        head: ['Step', 'When', 'What it means'],
        rows: [
          ['Warning', 'First minor breach (for example a post that had to be removed)', 'The content is removed and the breach is recorded. The warning, with its reason, is shown on your My page (and by email if you have written to us).'],
          ['Temporary suspension', 'Repeated breaches, or a single serious one', 'Sign-in is refused for 7 to 30 days; the sign-in screen states the date and time the suspension ends. The suspension ends automatically at that time — nothing needs to be requested — and the notice with its reason is on your My page.'],
          ['Termination', 'Vote manipulation, unlawful content, false maker claims, or a further breach after suspension', `The account is closed and its data erased as when a member leaves; the sign-in screen then shows the same message as after leaving. The phone number cannot join again for at least ${REJOIN_BLOCK_DAYS} days — there is no permanent ban. Polls and votes stay as records. A closed account can no longer be notified through the Service.`],
        ],
      },
      after: [
        'Serious breaches lead directly to termination. Content that is unlawful is removed regardless of the step.',
        'Every warning and suspension is shown on your My page; while you have notices you have not seen, the “My page” link shows their number.',
      ],
    },
    {
      heading: '8. Appeals',
      paras: [
        `Write to ${MAIL} with your anonymous nickname and the link to the content or the measure you are appealing. Because we hold no name or email address for members, we may ask you to confirm from your signed-in account. We aim to answer within 7 days. During a temporary measure the author may ask for the content to be restored; the Operator decides before the measure ends.`,
      ],
    },
    {
      heading: '9. How the Operator acts',
      bullets: [
        'Polls created by the Operator to start the site are labelled “Seed poll by the operator”.',
        'No candidate, maker or advertiser can pay for placement, for a result or for the removal of a vote. If advertising is ever introduced, it will be marked as such and kept separate from results.',
        'Decisions on reports, “Under review” notices and sanctions are made by a person. Automatic rules only refuse individual attempts at the door and raise notices; see the AI Notice for what AI is and is not used for.',
        'We hand over data to authorities only on a lawful request, and we tell the member concerned where the law allows.',
      ],
    },
    {
      heading: '10. Contact',
      paras: [`${OP} · ${MAIL}`],
    },
  ],
}

// ---------------------------------------------------------------------------------------------------------------------
const ai: LegalDoc = {
  title: 'AI Notice',
  version: VERSION_LINE_EN,
  intro: [
    `${B} uses generative artificial intelligence for one feature: the AI comparison card shown on each poll candidate. This notice is given in advance under Article 31 of the Korean Framework Act on Artificial Intelligence and explains what the AI does, what it does not do, and how to report a wrong card.`,
    LANG_NOTE,
  ],
  sections: [
    {
      heading: '1. What the AI comparison card is',
      paras: [
        'When a poll is created, each candidate — a maker name and a product or service name — gets a card that summarises the maker’s official information: a product title, 2 to 10 short factual specifications, up to 3 notes, links to the pages used, and the official page when one was found. Each card is labelled “AI comparison card” and “AI summary — check the source”, shows the date it was checked, and says “Official source not confirmed” when no page on the maker’s own domain could be used.',
      ],
    },
    {
      heading: '2. How the card is made',
      bullets: [
        `Model: Claude (${CARD_MODEL}) by Anthropic, used through its API.`,
        `Inputs: only the maker name, the product name and the poll category. No personal data and nothing about who created the poll or who votes is sent.`,
        `Method: the model searches the web (at most ${CARD_MAX_SEARCHES} searches, with marketplaces, price-comparison sites, app stores, blogs, communities and video sites excluded) for the maker’s own page, reads it (at most ${CARD_MAX_FETCHES} pages) and submits the card through a fixed form.`,
        'Checks before storage: our server verifies that every link in the card points to a page the model actually opened or saw in search results, that a source is marked official only when it is on the maker’s own domain, that marketplaces are never counted as official, and that lengths and counts stay within limits. A card that fails these checks is not stored.',
        `Attempts and sharing: at most ${CARD_MAX_ATTEMPTS} attempts per product; at most ${CARD_DAILY_LIMIT} cards a day site-wide. One card is made per product and shared by every poll that includes that product. The card is written in English with a Korean translation made at the same time; pages in other languages show the English card.`,
      ],
    },
    {
      heading: '3. Limits — check the source',
      bullets: [
        'The card may be incomplete, outdated or wrong, may miss the exact edition or plan, or may describe a different product with a similar name. Prices, plans and specifications change after the card is made.',
        'The card is not a recommendation, not an endorsement by the Operator or the maker, and not part of the vote. Members vote for whatever reasons they have; the card only helps them look things up.',
        'The maker of the AI model that writes the cards — currently Anthropic, the maker of Claude — and that maker’s competitors may appear as candidates in polls. Cards are factual summaries of official pages and never influence how votes are counted, ranked or displayed; a card about Claude is made and checked under exactly the same rules as any other card.',
        'Always open the linked official page before relying on a figure.',
      ],
    },
    {
      heading: '4. What AI is not used for',
      bullets: [
        'Counting votes, computing shares or ranking candidates — these are plain arithmetic on the vote records.',
        'Deciding whether a vote is accepted — those rules are fixed thresholds (one per member, one per device, network limits, blocked network lists).',
        'Reviewing anomalies — the “Under review” notice is raised by a fixed rule (a one-sided burst of votes from brand-new members); a person decides what follows.',
        'Moderating content or deciding about accounts — reports and sanctions are handled by a person.',
        'Writing or translating members’ content — polls, posts and comments appear exactly as written.',
      ],
      after: [
        'Interface texts in languages other than English and Korean were translated with the help of AI and are awaiting review by native speakers. Legal documents are published in English and Korean only.',
      ],
    },
    {
      heading: '5. Data sent to the AI provider',
      paras: [
        'The maker name, product name and category are sent to Anthropic’s API, which processes them under Anthropic’s API terms. No personal data of any member leaves the Service for this purpose. The resulting card, its sources, the model name and the cost of the call are stored by the Service.',
      ],
    },
    {
      heading: '6. Reporting a wrong card',
      paras: [
        `Use the Report button on the poll (reason “Other”) and describe what is wrong — or write to ${MAIL} with the link. The Operator re-checks the card against the official page and regenerates, corrects or removes it. Makers can additionally claim their product (see the Community Rules) and tell us directly.`,
      ],
    },
    {
      heading: '7. Contact',
      paras: [`${OP} · ${MAIL}`],
    },
  ],
}

export const LEGAL: Record<LegalKey, LegalDoc> = { terms, privacy, policy, ai }
