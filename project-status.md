# Project Status — Personal Debt Tracker

A dated, reverse-chronological log of changes. **Newest entries go on top.**
For the forward-looking roadmap, see [`project-plan.md`](project-plan.md).

Legend: ✅ shipped to `main` (live) · 🚧 on a branch, not yet merged ·
🐛 bug fix · 🔒 security · 📝 docs

---

## 2026-07-25

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
