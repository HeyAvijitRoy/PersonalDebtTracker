# Personal Debt Tracker

Track credit-card balances, see the true monthly (and yearly) interest burn, get
FICO "threshold nudge" hints, simulate payoff timelines, and plan 0% balance
transfers — in a clean, mobile-first web app where your data is **end-to-end
encrypted in the browser** before it ever reaches Firestore.

> A lightweight, privacy-first planner to manage credit cards, visualize
> utilization, and optimize payoff. No bank linking, no tracking, no ads.

<p>
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-Auth%20|%20Firestore-ffca28?logo=firebase&logoColor=000&labelColor=fff" />
  <img alt="Tailwind" src="https://img.shields.io/badge/TailwindCSS-compiled-38bdf8?logo=tailwindcss&logoColor=fff" />
  <img alt="E2EE" src="https://img.shields.io/badge/Encryption-AES--GCM%20(client--side)-4c1?logo=letsencrypt&logoColor=fff" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-offline%20first-5a0fc8?logo=googlechrome&logoColor=fff" />
  <img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub%20Pages-Actions%20deploy-222?logo=github&logoColor=fff" />
</p>

[![Live demo](https://img.shields.io/badge/demo-pdt.avijitroy.com-blue)](https://pdt.avijitroy.com/)

> ⚠️ **Disclaimer**: For educational purposes. Not financial advice.

---

## ✨ Features

### 🔒 Privacy & security
* **Lock Mode — client-side end-to-end encryption.** Card data is encrypted in
  your browser with an AES-GCM key derived from your passphrase (PBKDF2). Only
  ciphertext is ever stored in Firestore — unreadable even by the project owner
  without your passphrase.
* **Zero-knowledge, per-session unlock.** The key lives in memory only and is
  cleared on sign-out/refresh; the passphrase is never sent anywhere. No bank
  linking, no tracking, no ads.

### 💳 Accounts
* **Google sign-in + Firestore sync** (offline-first via IndexedDB).
* **Inline edit** in place (row expands to full-width inputs; *Enter* to save,
  *Esc* to cancel) with field-level validation.
* **Quick ±$50 balance nudges** on each card for fast payment updates.
* **Search / filter** accounts by name; **undo delete** (8-second toast).
* **Sort** by Name / APR / Balance / Utilization / Interest per $100
  (preference persisted).

### 📊 Insight & visuals
* **KPI tiles:** Total Debt, Total Credit, Monthly Interest, and a prominent
  **Yearly Interest (Est.)** figure, plus an **overall utilization bar**.
* **Per-card utilization** as **bar or donut** (toggle), risk badges
  (Healthy / Watch / Medium / High), and **0% APR** chips.
* **FICO "threshold nudges":** cheapest dollars to drop under 30% / 50% / 80%
  utilization, per-card and overall.

### 🧮 Planning tools
* **Payoff strategies:** Debt Avalanche (highest APR), Debt Snowball (lowest
  balance), and Most Expensive (interest per $100).
* **Payoff Schedule Simulator:** enter a monthly budget + strategy to get an
  estimated debt-free date, total interest paid, and payoff order.
* **Balance-Transfer Optimizer:** pick a 0% target card, optionally cap its
  utilization, and get a move list with monthly + intro-period net savings vs.
  fees.

### 🧰 Quality of life
* **Dark mode** (persisted, no flash of wrong theme).
* **Import** CSV **and** JSON; **Export** CSV / JSON.
* **PWA:** installable, offline-friendly (network-first service worker; Firestore
  queues writes offline and syncs when back online).
* **Accessibility:** keyboard support, focus rings, ARIA labels, `aria-live`
  announcements, accessible modal (focus trap + Escape/backdrop close), and
  redundant text labels alongside color-coded chips.
* **Mobile-first** responsive layout with a floating add-account button.

---

## 🧱 Tech Stack

* **Frontend:** HTML + vanilla JS (ES modules) + **compiled TailwindCSS**
  (static `styles.css`, no runtime CDN).
* **Encryption:** Web Crypto API — AES-GCM-256 + PBKDF2 (SHA-256).
* **State/Sync:** Firebase Auth + Firestore (with IndexedDB persistence).
* **PWA:** service worker (network-first) + web manifest.
* **CI/CD:** GitHub Actions → GitHub Pages (served via Cloudflare at
  `pdt.avijitroy.com`).
* **Secrets:** injected at build time via Actions — no keys committed.

---

## 📦 Data Model

```
artifacts/{projectId}/users/{uid}/cards/{cardId}
```

**Encrypted (Lock Mode — default):**

```json
{ "v": 1, "iv": "<base64>", "data": "<base64-ciphertext>" }
```

Legacy plaintext docs (`{ name, balance, apr, creditLimit }`) from before Lock
Mode are read as-is and re-encrypted in place on load (idempotent, resumable).

**Per-user crypto metadata:**

```
artifacts/{projectId}/users/{uid}/meta/crypto
```

```json
{ "v": 1, "salt": "<base64>", "verifier": { "iv": "<base64>", "data": "<base64>" } }
```

* The `salt` (non-secret) derives the key via PBKDF2; the `verifier` is an
  encrypted known token used to detect a wrong passphrase on unlock.
* Decrypted card fields (`name`, `balance`, `apr`, `creditLimit`) exist **only
  in memory**; all derived metrics (utilization, interest, per-$100 cost) are
  computed client-side.

---

## 🔐 Lock Mode (client-side E2EE)

**Goal:** data is encrypted in the browser before hitting Firestore, so even
project admins / server backups cannot read card details.

* **Key derivation:** AES-GCM-256 key from your passphrase + a per-user random
  salt via PBKDF2 (SHA-256, 210k iterations).
* **Session model:** unlock once per session; key held in memory, cleared on
  sign-out/refresh.
* **First run:** set a passphrase (with an unrecoverable-if-lost warning).
  **Returning:** enter your passphrase to unlock.
* **Encrypt-everything-by-default**, with safe migration of any legacy plaintext.

**Threat model**

* ✅ Protects against server-side reads (console, backups) and cross-user access.
* ❌ Does **not** protect a device compromised while unlocked.
* ⚠️ **No recovery** if the passphrase is lost — export a JSON backup as your
  safety net.

---

## 🛠️ Getting Started (Local)

1. **Firebase Console**
   * Create a web app and enable the **Google** auth provider.
   * Auth → **Authorized domains**: add `localhost` and `127.0.0.1`.
   * Firestore → publish the rules from [`firestore.rules`](firestore.rules).

2. **Create `env.js` locally** *(ignored by git)*:

   ```js
   // env.js (local only; NOT committed)
   window.__FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "your-project.firebaseapp.com",
     projectId: "your-project",
     storageBucket: "your-project.firebasestorage.app",
     messagingSenderId: "…",
     appId: "…",
     measurementId: "G-…"
   };
   ```

3. **Serve over HTTP** (not `file://`, so ES modules + the service worker work):

   ```bash
   npx serve .
   # or
   python -m http.server 5173
   ```

### Rebuilding the CSS

Tailwind is **precompiled** to a static `styles.css` (committed to the repo).
Rebuild it whenever you change markup or class names in `index.html` / `app.js`:

```bash
npx tailwindcss@3.4.17 -c tailwind.config.js -i src/input.css -o styles.css --minify
```

The content scanner reads `index.html` and `app.js`, so any class used there is
included. (The old Tailwind Play CDN was removed — it isn't production-grade and
broke behind Cloudflare Rocket Loader.)

---

## 🔐 Security Rules

The authoritative rules live in [`firestore.rules`](firestore.rules) (version
controlled). They enforce **owner-only** access (`request.auth.uid == uid`)
across each user's subtree and validate both the encrypted and legacy card
shapes plus the `meta/crypto` doc; everything else is denied by default.

**Deploy:** Firebase Console → Firestore → Rules → paste `firestore.rules` →
**Publish** (or `firebase deploy --only firestore:rules` with the Firebase CLI).

---

## 🌐 Deploying to GitHub Pages (no keys in repo)

**Why**: keeps config out of version control.

1. **Add GitHub Actions secrets** (repo → Settings → Secrets and variables →
   Actions):

   ```
   FIREBASE_API_KEY
   FIREBASE_AUTH_DOMAIN
   FIREBASE_PROJECT_ID
   FIREBASE_STORAGE_BUCKET
   FIREBASE_MESSAGING_SENDER_ID
   FIREBASE_APP_ID
   FIREBASE_MEASUREMENT_ID
   ```

2. **`env.js` is gitignored** and generated at build time by
   `.github/workflows/static.yml`, which rsyncs the repo into `dist/`, writes
   `dist/env.js` from the secrets, and deploys to Pages.

3. **Settings → Pages** → build with **GitHub Actions**.

> `styles.css` is committed, so no build step runs in CI — the workflow just
> copies files. Rebuild the CSS locally (see above) and commit it when needed.

---

## 🔄 Switching Firebase Projects

To repoint the app at a new Firebase project (e.g. a different owner account):

1. **Export JSON** from the current app (your migration payload / backup).
2. Create the new project → add a Web app → enable Google auth → create
   Firestore → publish [`firestore.rules`](firestore.rules) → add authorized
   domains (`localhost`, `127.0.0.1`, `pdt.avijitroy.com`).
3. Update config: local `env.js` and the GitHub Actions secrets above.
4. Sign in with the account you'll use going forward, set your Lock Mode
   passphrase, then **Import** the JSON.
5. Verify, then decommission the old project.

Test locally against the new project before updating the production secrets.

---

## 🧭 Usage Notes

* **Sort** by Name / APR / Balance / Utilization / Interest per $100 (persisted).
* **Utilization View**: switch **Bar ↔ Donut** in the controls.
* **Inline edit**: click ✏️ → fields expand; **Enter** saves, **Esc** cancels.
* **Quick pay**: ±$50 buttons for fast balance updates; **Undo delete** toast.
* **Simulator**: enter a monthly budget + strategy → debt-free date, total
  interest, payoff order.
* **Optimizer**: pick the 0% target card, optionally cap its utilization → move
  list + net savings (intro vs. fees).
* **Import/Export**: CSV or JSON from the header.

---

## 📱 PWA & Offline

* Installable; works offline for most flows. The service worker is
  **network-first** (always serves the latest deploy, falls back to cache
  offline), and Firestore queues writes offline and syncs when reconnected.
* To reset cache (dev): DevTools → Application → Clear storage, then hard-reload.

---

## 🧭 Roadmap

See [`project-plan.md`](project-plan.md) for the full phased plan and
[`project-status.md`](project-status.md) for a dated change log.

* [x] Lock Mode (client-side E2EE)
* [x] Payoff schedule simulator
* [x] CSV / JSON import
* [x] Dark mode
* [ ] Guest / local-only mode (try before sign-in)
* [ ] Firebase App Check (reCAPTCHA v3)
* [ ] Multi-currency support
* [ ] Automated tests for the financial math + CI gates

---

## 🧩 Troubleshooting

* **Google popup blocked** — falls back to redirect; ensure *Authorized domains*
  includes `localhost` / `127.0.0.1`.
* **Nothing happens** — check that `env.js` loads before `app.js` (Network tab).
* **Forgot passphrase** — data is unrecoverable by design; re-import a JSON
  backup, or reset by deleting the `meta/crypto` doc and your cards.
* **"Permission denied"** — recheck the deployed Firestore rules.
* **Stale UI** — the network-first SW self-heals on reload; if needed, clear
  storage and hard-reload.

---

## 📄 License

`MIT`

---

Built with ❤️ by [Avijit Roy](https://avijitroy.com). Questions or ideas? Open an
issue.
