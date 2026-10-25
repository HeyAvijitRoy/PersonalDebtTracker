## 2026-10-25 - Payoff Plan, navigation, and custom utilization KPIs

- Split the unlocked app into Accounts, Payoff Plan, and Progress. Moved existing
  import/export controls into Settings & data; kept legacy section links working.
- Added Avalanche/Snowball comparisons for a shared monthly budget or a target
  payoff duration, optional planned baseline payments, interest and total cost,
  payoff order, projected graph, and accessible monthly table.
- Uses cent-based monthly calculations with explicit fixed-APR/no-new-purchase
  assumptions. Rejects mixed/unknown APR and deferred-interest portfolios. Deadline
  mode labels each strategy's independently estimated budget.
- Kept the transfer optimizer available in a collapsed accordion with a recorded
  promotion badge, without inferring transfer eligibility.
- Every saved utilization threshold now creates an overall payment-target KPI.
  Per-account targets remain available. Save targets has a normal button height.
- Planning is read-only, in-memory, and cleared on logout. Browser coverage checks
  safe text rendering, no financial writes, navigation, private-state clearing,
  target persistence, and dark/mobile layouts. Passed 68 unit tests and four
  synthetic browser suites. No production debug output added. Cache v17.
- Release checks also caught an action-menu refresh race: open menus now survive
  background card rendering and informational toasts do not intercept clicks.
  Fixed the existing pie utilization label's missing limit argument and added
  browser regression coverage for pie rendering and menu preservation.

## 2026-10-25 - Passphrase form metadata and Rocket Loader exclusion

- Corrected the misspelled data-cf-async attribute to Cloudflare's documented
  data-cfasync="false" on theme/config/application scripts, before src. Marked
  the module script crossorigin="anonymous" explicitly.
- Added hidden autocomplete=username fields to both passphrase forms using the
  signed-in account email or UID. Values remain in the DOM only and clear on
  sign-out/session changes. Existing password autocomplete attributes are intact.
- Left the existing browser-provided passphrase visibility control unchanged.
  No duplicate eye control or debug output was added. Cache v16.
- Verified 61 unit checks, build/syntax checks and three browser suites, including
  script metadata, form username context and session cleanup. Cloudflare edge
  caching/transform behavior still requires the user's browser refresh to verify.

## 2026-10-25 - Favicon, visible update reminders, and quiet production output

- Added a blue/indigo card-and-paydown icon as SVG, multi-resolution ICO and Apple
  touch PNG; aligned the PWA icon and included assets in Pages, local serving and
  offline caching. Explicit favicon links eliminate the missing favicon request.
- Cards needing current issuer inputs now have an amber border, Needs an update
  badge, highlighted observation date/reason and Update now button. Provisional
  balances also need verification; pending sync uses a distinct blue badge.
  The Needs an update filter uses the same condition as the card styling.
- Removed application console prints. Errors remain in the UI, including failed
  import counts. Switched to the supported persistentLocalCache multi-tab API to
  avoid the deprecated persistence initializer warning. No logger overrides.
- Verified icons load with correct MIME types and ICO sizes 16/32/48; 61 unit
  checks and three browser suites passed, including stale-to-current styling and
  existing offline/conflict/history flows. Visually reviewed the icon and dark
  stale card. Cache v15. No account records or production rules were changed.

## 2026-10-25 - Correct browser REST authentication compatibility

- Console evidence identified production 403s on BeginTransaction. Replaced that
  RPC with the Firebase web SDK's optimistic model: authenticated reads, document
  update-time/existence preconditions and one atomic Commit. Read-only documents
  are verified in the commit; contention replays all reads before retrying.
- Existing encrypted draft IDs, revision checks, paired history and owner rules
  are unchanged. No admin credential or broader permission was introduced.
- Browser fixtures now deny explicit transactions, reproducing the production
  authentication boundary missed by the emulator. Checked 61 unit tests, 12 rule
  tests including real concurrent updates, and all three browser suites. Cache v14.
- Permission messages distinguish denied requests from proof that rules are the
  cause. The other pasted console items are nonblocking warnings or extensions.

## 2026-10-25 - Recover pending saves without the live SDK stream

- Added owner-authenticated HTTPS transactions for account/history writes, with
  atomic commits, bounded contention retry, replay detection and session guards.
  Existing encrypted outbox drafts are replayed without migration or discarding.
- Confirmed server views update immediately and retain only encrypted envelopes
  in the offline snapshot. In-flight older refreshes cannot replace a new commit.
- HTTPS cleanup preserves terminal-purge rules. Permission failures retain the
  draft and identify the rules deployment step instead of implying successful sync.
- Verified 58 unit checks, 11 emulator rule checks, and three browser suites,
  including real REST transactions, idempotent replay, denied/unpaired writes,
  no-listener saves, permission retry, offline confirmed balances, and prior flows.
  No production rules or user financial records were accessed or changed. Cache v13.

## 2026-10-25 - Sticky navigation and modal account entry

- Made the header sticky with an opaque theme-aware background and measured
  anchor offsets, so section navigation accounts for header wrapping.
- Moved Add Account into a native modal with inline errors, Cancel/Escape,
  focus management, scrollable fields and always-visible submission controls.
  All add shortcuts open the same dialog; closing or signing out clears drafts.
- Moved sort/display controls under My Accounts and grouped them with filters
  in a labelled bordered panel and an internal separator. Styled every Actions
  operation as a bordered button, with a distinct delete treatment.
- Verified 55 unit checks and all three browser suites, including modal
  validation/cancellation, private draft clearing, sticky positioning, visible
  modal controls and narrow layouts. Reviewed dark mobile screenshots. Cache v12.
  Local branch only; no push or deployment.

## 2026-10-25 - Account controls and dark-mode usability

- Made Update balance and View history the visible card actions. Grouped planning,
  payment/transfer records, observation confirmation and lifecycle actions under
  an accessible Actions disclosure; all existing capabilities remain available.
- Added confirmation dialogs for archive/unarchive, issuer-status changes and
  deletion, with Cancel focused first and unchanged Undo/history behavior.
  Account names are inserted as text, and session changes cancel pending actions.
- Padded and centered day inputs with consistent dark-mode colors; spaced checkbox
  labels and aligned wrapped text across filters, inline editing and dialogs.
- Verified 55 unit checks and three browser suites, including cancellation,
  issuer-status preservation of debt, keyboard controls and dark/mobile styling.
  Visually reviewed dark mobile cards, Actions and planning references. Cache v11.
  Local branch only; no push or deployment.

## 2026-10-25 - Recover account loading after unlock

- Extended authenticated HTTPS fallback to account and history reads; added an
  account refresh/error panel and owner-scoped encrypted offline snapshots.
- Fixed history queries to filter the encrypted envelope version before
  descending document ordering; verified REST cursor behavior with the emulator.
- Verified 55 unit checks, 10 emulator rule checks and three browser suites.
  Service-worker cache v10. Local only; real signed-in retry remains to verify.

# Project Status — Personal Debt Tracker

A dated, reverse-chronological log of changes. **Newest entries go on top.**
For the forward-looking roadmap, see [`project-plan.md`](project-plan.md).

Legend: ✅ shipped to `main` (live) · 🚧 on a branch, not yet merged ·
🐛 bug fix · 🔒 security · 📝 docs

---

## 2026-10-25

### Passphrase startup recovery - feature branch (local only)

- After a confirmed SDK metadata timeout, added an authenticated HTTPS fallback
  and proxy-compatible long polling. The fallback retains Firebase owner rules
  and caches only salt/encrypted verifier, never passphrases, keys, or ID tokens.
- Verified direct fallback with stalled SDK/cache reads in the startup browser
  suite and real signed-out SDK initialization. Service-worker cache is now v9.

- Returning users can load an existing cached salt/verifier without waiting on
  a stalled server request. Server-only confirmation is required for new setup.
- Added a bounded metadata wait, a visible loading/error state, and Retry, plus
  session guards and a transaction that prevents overwriting existing settings.
- Updated the local server to recognize new runtime modules without a restart;
  cached assets now use v8. No passphrases, keys, or live account data were changed.
- Verified stalled-load/retry/cached-unlock browser paths and setup race/session
  regressions. Real signed-out SDK startup was checked separately.

### Account tracking stages 2-7 - `feature/account-tracking-progress` (local only)

- Implemented encrypted snapshot/history transactions, revision conflicts,
  an encrypted offline outbox, and owner-only immutable-history rules.
- Added calculated available-credit entry, dated observations/corrections,
  freshness filters, archive/issuer status, Undo and bounded permanent purge.
- Added complete JSON history backup/restore, stable-identity deduplication,
  safe snapshot/history CSV exports, and user-scoped UI preferences.
- Added manual statement/promotion reminders, optional payment records, atomic
  linked transfers, provisional adjustments, and explicit interest scenarios.
- Added the Progress page with comparable balance KPIs, observation graphs,
  accessible tables, comparison bars, utilization/limit views, and milestones.
- Verified with synthetic browser and local Firestore emulator checks; real
  Google sign-in, live rules, real-account sync, and hosting remain rollout checks.
- Deployment remains unperformed; see `docs/tracking-release.md`.

## 2026-10-24

### Account tracking foundation - `feature/account-tracking-progress` (local only)

- Committed the agreed implementation plan separately before implementation.
- Added integer-cent calculations for available-credit estimates, utilization
  targets, and balance changes, plus versioned account readers and legacy fixtures.
- Extracted bounded AES-GCM account serialization while retaining existing keys,
  envelopes, and legacy account values. Future calculated-account metadata stays
  inside ciphertext; the new entry forms and history writes are not enabled yet.
- Added session guards so stale asynchronous reads cannot restore account data
  after sign-out or replace a newer snapshot. Clear unlocked account views on
  authentication changes and reject malformed numeric input at save/import.
- Added dependency-free Node tests and CI checks; restricted service-worker caching
  and public deployment artifacts to application assets.
- Verified with unit/crypto/session tests, syntax checks, source checks, and local
  HTTP module delivery. No authenticated browser, live Firebase rules, or cloud
  deployment verification has been performed for this stage.

## 2026-07-25

### 🚧 🔒 PR-review hardening: encrypted-only, stricter rules — branch `lock-mode`
Addressed code-review feedback and dropped legacy support entirely (the switch
is to a fresh Firebase project, so there is no plaintext data to migrate):
- **Removed all legacy plaintext handling** — deleted `migrateLegacyDocs` and
  the migration call; `decryptFields` no longer falls back to plaintext.
- **`decryptFields` is strict:** requires a non-null key and an exact
  `{ v:1, iv:string, data:string }` shape, otherwise throws (surfaced by the
  read loop) instead of silently coercing to plaintext defaults.
- **`firestore.rules` tightened:**
  - `isValidCard` now `hasOnly(['v','iv','data'])` + `v == 1` + typed,
    size-bounded `iv`/`data` (no extra fields, no legacy branch).
  - `isValidMeta` now validates `v`, restricts keys, and validates the
    `verifier` map down to its `iv`/`data` subfields (typed + size-bounded).
  - `/meta/{docId}` locked down to just `/meta/crypto`.
  - Removed the permissive `allow read, write` on the user container doc — it's
    unused and now denied by default.
- Docs (README / plan) updated to describe encrypted-only (no migration).
- Verified locally: encrypt/decrypt round-trips; legacy-shaped and malformed
  docs are rejected; no boot errors.

### ✅ Phase 4 signed off + README refreshed — branch `lock-mode`
- Lock Mode (E2EE) **manually tested against live Firebase** — full flow passed
  (passphrase setup, add/edit/delete, sign out, unlock, and legacy→ciphertext
  migration verified in the console). Phase 4 marked ready to merge.
- `README.md` rewritten to reflect the current app: Lock Mode / E2EE, dark mode,
  Payoff Schedule Simulator, CSV + JSON import, search, quick nudges, yearly
  interest tile + overall utilization bar, compiled Tailwind (no CDN),
  network-first service worker, version-controlled `firestore.rules`, updated
  data model (encrypted envelope + `meta/crypto`), a "Switching Firebase
  Projects" guide, and a refreshed roadmap.
- `project-plan.md` Phase 4 status updated to "tested, ready to merge."
- **At merge:** deploy `firestore.rules` to the Firebase project so the
  server-side lockdown goes live with the code.

### 🚧 🔒 Firestore security rules + project docs — branch `lock-mode`
- Added version-controlled [`firestore.rules`](firestore.rules): owner-only
  access (`request.auth.uid == userId`) across each user's subtree, with shape
  validation that accepts **both** the encrypted card envelope `{ v, iv, data }`
  and legacy plaintext `{ name, balance, apr, creditLimit }` (so migration
  can't be locked out), plus validation for the `meta/crypto` doc. Everything
  outside the per-user subtree is denied by default.
- Added [`project-plan.md`](project-plan.md) (phased roadmap) and this status
  log.
- **Action still required:** deploy `firestore.rules` to the Firebase project
  (Console → Firestore → Rules → paste → Publish).

### 🚧 🐛 Sign-out left data on screen until refresh — branch `lock-mode`
- Sign-out cleared the visible card DOM but never unsubscribed the Firestore
  listener or switched screens itself. The still-active listener then hit a
  post-sign-out permission error whose handler re-showed the app — so data
  lingered until a manual refresh.
- Fix: unsubscribe the snapshot listener first; clear `window.__latestCards`,
  `editingId`, `cryptoKey`, `currentCryptoMeta`; reset `firstSnapshotReceived`;
  immediately show the sign-in screen; and guard the snapshot error handler with
  `if (!userId) return` so teardown-time errors can't resurrect the view.
- Verified locally: sign-out returns straight to login with data cleared.

### 🚧 JSON import (parity with JSON export) — branch `lock-mode`
- Import previously accepted CSV only despite offering JSON export. The single
  **Import** button now accepts `.csv` and `.json`, detecting format by
  extension/MIME/leading character and routing to the right parser.
- JSON accepts the Export JSON shape (array of
  `{ name, balance, apr, creditLimit }`); every row runs the same validation as
  CSV/manual entry, and imported rows are encrypted like any other write.
- Verified locally: CSV and JSON of identical data parse to identical rows;
  invalid/wrong-shape/bad-row cases report clean errors.

### 🚧 🔒 Lock Mode — client-side end-to-end encryption — branch `lock-mode`
- Card data is now encrypted **in the browser** before reaching Firestore, so
  stored data is ciphertext only — unreadable even by the project owner without
  the user's passphrase (zero-knowledge).
- **Crypto:** AES-GCM-256; key derived from a passphrase via PBKDF2
  (SHA-256, 210k iterations). Key lives in memory only, cleared on
  sign-out/refresh (unlock once per session). Each card doc is
  `{ v, iv, data }` with a unique IV per write.
- **Meta:** per-user `meta/crypto` doc stores the non-secret salt + an encrypted
  verifier token so wrong passphrases are detected cleanly.
- **UX:** first-time users create a passphrase (with an unrecoverable-if-lost
  warning); returning users unlock after Google sign-in.
- **Architecture:** encrypt/decrypt only at the Firestore boundary; in-memory
  cards stay plaintext, so rendering, search, sort, simulator, optimizer, and
  FICO hints are unchanged. All writes encrypt (add, inline edit, quick nudge,
  undo delete, CSV/JSON import).
- **Migration:** legacy plaintext docs are read as-is and re-encrypted in place
  on load — idempotent and resumable; the read path handles both forms.
- Footer copy updated to reflect real E2EE.
- Verified locally: encryption round-trips exactly (incl. special chars &
  decimals), wrong passphrase rejected, legacy passthrough works, lock screens
  render in light/dark, no console errors. **Not yet tested against live
  Firebase or merged to `main`.**

### ✅ 🐛 🔒 Production hotfixes — `main` (live)
- **Broken styling on the live site:** Cloudflare Rocket Loader was reordering
  scripts and breaking the Tailwind Play CDN's runtime style generation (page
  rendered unstyled). Fixed by **precompiling Tailwind into a static
  `styles.css`** (~26 KB, purged) and dropping the CDN `<script>` — a stylesheet
  can't be touched by Rocket Loader and has no runtime JIT to break. Also
  removed the "not for production" warning and runtime compile cost. Added
  `tailwind.config.js` + `src/input.css` for rebuilds. Gated `.modal-overlay`'s
  `display:flex` behind `:not(.hidden)` (a latent conflict the static CSS
  exposed).
  - Rebuild command:
    `npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o styles.css --minify`
- **Service worker cache poisoning:** the SW was cache-first, so a stale/broken
  shell could trap returning visitors on an old version. Switched to
  **network-first** for same-origin GETs (falls back to cache only offline),
  made `env.js` bypass the cache, and bumped the cache name so old caches purge
  on next load (self-healing). *(Intermediate attempt — per-script
  `data-cf-async="false"` — was insufficient, since Rocket Loader alters the
  page lifecycle globally; superseded by the compiled-CSS fix above.)*

### ✅ Feature & UX expansion — merged to `main` (PR #1)
Merged the large v2 work into `main`:
- **Dark mode** (persisted, no flash), **accessible modal** (Escape/backdrop
  close, focus trap + return), `aria-live` toasts, **loading skeleton**,
  **inline field validation**, **scrollspy** nav, responsive polish.
- **New tools:** overall utilization bar, "Yearly Interest (Est.)" KPI tile,
  **Payoff Schedule Simulator**, **CSV import**, account **search/filter**,
  quick **±$50 nudges**, mobile **add-account FAB**, clickable empty-state CTAs,
  persisted sort/view prefs.
- **Bug fixes:** `.bg-white` event-delegation selector renamed to `.debt-card`
  (dark-mode input styling had collided with it, breaking Escape/save); risk /
  "Editing" badges moved to their own line so long names don't clip them;
  `#no-cards-message` moved outside `#card-list` so it survives re-renders;
  account grid capped at 2 columns with hover-reveal edit/delete buttons; KPI
  tile breakpoint moved `lg`→`xl` so large amounts don't clip.

### ✅ 🔒 XSS fix + PWA files — `main`
- Escaped user-controlled strings (account names, etc.) before interpolating
  into `innerHTML`, closing a stored-XSS gap.
- Added the previously-missing `manifest.webmanifest`, `sw.js`, and `icon.svg`
  so the PWA (install + offline app-shell) actually works as the README claimed.

---

## How to update this log

Add a new dated block at the **top** (most recent first). For each change note:
what changed, why, the branch/deploy target, and how it was verified. Convert
relative dates to absolute (YYYY-MM-DD).
