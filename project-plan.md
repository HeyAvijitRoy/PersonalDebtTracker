# Project Plan — Personal Debt Tracker

A privacy-first, client-side credit-card debt planner: track balances, see the
true interest burn, get FICO utilization "nudge" hints, plan 0% balance
transfers, and simulate payoff — with all data end-to-end encrypted in the
browser.

This document is the **forward-looking roadmap**. For a dated log of what has
already shipped, see [`project-status.md`](project-status.md).

**Guiding principles**

- **Privacy first.** No bank linking, no tracking, no ads. Sensitive data is
  encrypted client-side; the backend only ever stores ciphertext.
- **Client-side only.** All financial math runs in the browser. No server code
  beyond Firebase (Auth + Firestore).
- **Credit-card focused.** Utilization, FICO optics, and balance transfers are
  the differentiators — the product stays narrow and does them well rather than
  becoming a generic "all debts" tracker (fixed-term loans have less to
  optimize; credit cards are the high-interest, high-risk case).
- **No misleading precision.** We deliberately omit features that would imply
  data we don't have (e.g. live minimum payments / due dates) since no
  transactions are pulled in.

---

## Phase status at a glance

| Phase | Theme | Status |
|------|-------|--------|
| 0 | Foundation (core app) | ✅ Done |
| 1 | UX & accessibility overhaul | ✅ Done |
| 2 | Planning tools & robustness | ✅ Done |
| 3 | Production hardening | ✅ Done |
| 4 | Lock Mode (E2EE) + security rules | 🚧 In review (`lock-mode` branch) |
| 5 | Trust & onboarding (guest mode, App Check) | ⏳ Planned |
| 6 | Data-model depth (payoff timeline, multi-currency) | ⏳ Planned |
| 7 | Distribution, SEO & rebrand | ⏳ Planned |
| 8 | Engineering quality (tests, CI, types) | ⏳ Planned |

---

## ✅ Phase 0 — Foundation (shipped)

Core single-page app: Google auth + Firestore sync (offline-first via
IndexedDB), add/inline-edit/delete accounts, utilization bar/donut, risk
badges, FICO threshold nudges, three payoff strategies (Avalanche, Snowball,
Most Expensive), and the Balance-Transfer Optimizer. Deployed to GitHub Pages
via Actions with keys injected at build time.

## ✅ Phase 1 — UX & accessibility overhaul (shipped)

Dark mode with persisted theme (no flash), accessible modal (Escape/backdrop
close, focus trap + return), `aria-live` announcements, loading skeleton,
inline field-level validation, scrollspy nav, responsive layout pass, XSS fix
(escaping user-controlled strings), and removal of dead code.

## ✅ Phase 2 — Planning tools & robustness (shipped)

Overall utilization bar, "Yearly Interest (Est.)" KPI tile, Payoff Schedule
Simulator (month-by-month, avalanche/snowball), CSV **and** JSON import,
account search/filter, quick ±$50 balance nudges, mobile add-account FAB,
clickable empty-state CTAs, and persisted sort/view preferences.

## ✅ Phase 3 — Production hardening (shipped)

- Service worker switched to **network-first** (no more stale/broken cached
  shells trapping returning visitors).
- Replaced the Tailwind Play CDN with a **compiled static `styles.css`** —
  robust behind Cloudflare Rocket Loader, no runtime cost, no prod warning.
- Missing PWA files (`manifest.webmanifest`, `sw.js`, `icon.svg`) added.

## 🚧 Phase 4 — Lock Mode (client-side E2EE) — *in review*

Branch: `lock-mode` (built and locally verified; awaiting maintainer testing
against live Firebase before merge to `main`).

- AES-GCM-256 with a key derived from a user passphrase via PBKDF2
  (SHA-256, 210k iterations); key held in memory only, cleared on
  sign-out/refresh (unlock once per session).
- Per-user `meta/crypto` doc stores a non-secret salt + an encrypted verifier
  token to detect wrong passphrases cleanly.
- Encrypt/decrypt only at the Firestore boundary; in-memory data stays
  plaintext so all existing features are untouched.
- Encrypt-everything-by-default with **safe, idempotent migration** of legacy
  plaintext docs.
- Version-controlled [`firestore.rules`](firestore.rules) (owner-only access,
  shape validation for both card forms + the meta doc).

**Remaining before merge**

- [ ] Maintainer end-to-end test on live Firebase (setup → add/edit → sign out
      → unlock → confirm migration to ciphertext in the console).
- [ ] Deploy `firestore.rules` to the Firebase project.
- [ ] Update README security-rules / data-model sections to reflect E2EE.

---

## ⏳ Phase 5 — Trust & onboarding

- **Guest / local-only mode.** Let visitors use the app with `localStorage`
  before signing in, then offer "sign in to sync." Removes the single biggest
  adoption barrier (a Google wall before any value is shown). *Highest-leverage
  growth change.*
- **Passphrase resilience.** Encourage a JSON backup at setup; consider an
  optional recovery-code flow (still zero-knowledge) so a forgotten passphrase
  isn't automatically total data loss.
- **Firebase App Check** (reCAPTCHA v3) to protect write endpoints from abuse.

## ⏳ Phase 6 — Data-model depth

- **Payoff timeline / amortization view** — extend the simulator into a
  month-by-month chart with total interest and per-card payoff dates.
- **Multi-currency** support (display + formatting).
- **Optional minimum-payment field** — only if framed carefully as a
  user-entered planning input, not a tracked live value (see principles).
- **Snapshots / progress trend** — optional opt-in history of total balance
  over time for motivation (encrypted like everything else).

## ⏳ Phase 7 — Distribution, SEO & rebrand

- **Rebrand to a credit-card-specific name/positioning** (utilization + payoff
  optics as the hook).
- **SEO content** ("avalanche vs snowball calculator", utilization guides) with
  the tool embedded as the CTA.
- Submit to relevant communities and awesome-lists; Product Hunt / Show HN with
  the privacy + open-source angle.
- PWA polish (real maskable icons, richer offline UX).

## ⏳ Phase 8 — Engineering quality

- **Automated tests** for the pure financial math (`computeTotals`,
  `computeFicoHints`, `planBalanceTransfer`, `simulatePayoff`,
  `rankByInterestPer100`) — high value, currently untested.
- **CI gates** (lint / test / typecheck) before the Pages deploy.
- **Types** via TypeScript or JSDoc, at least at the Firestore data boundary.
- Consider splitting the ~1.9k-line `app.js` into modules
  (auth / crypto / firestore / calc / render).

---

## Explicitly out of scope (for now)

- **Live minimum payments & due dates** — would imply transaction data we don't
  have; misleading without a bank connection.
- **Bank account linking / Plaid** — conflicts with the privacy-first stance.
- **Monetization / ads** — the project is intentionally free and ad-free.
