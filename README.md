# Personal Debt Tracker

Track credit card balances, see true monthly interest burn, get FICO “threshold nudge” hints, and plan 0% balance transfers — all in a clean, offline-friendly web app powered by Firebase.


> A lightweight, privacy-conscious planner to manage credit cards, visualize utilization, and optimize balance transfers. Built for real-world, mobile-first use.

<p>
  <img alt="Firebase" src="https://img.shields.io/badge/Firebase-Auth%20|%20Firestore-ffca28?logo=firebase&logoColor=000&labelColor=fff" />
  <img alt="Tailwind" src="https://img.shields.io/badge/TailwindCSS-utility%20first-38bdf8?logo=tailwindcss&logoColor=fff" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-offline%20first-5a0fc8?logo=googlechrome&logoColor=fff" />
  <img alt="GitHub Pages" src="https://img.shields.io/badge/GitHub%20Pages-Actions%20deploy-222?logo=github&logoColor=fff" />
</p>

[![GitHub Pages](https://img.shields.io/badge/demo-GitHub%20Pages-blue)](https://heyavijitroy.github.io/PersonalDebtTracker/)

## ✨ Features

* **Auth + Sync**: Google sign-in with Firestore syncing (offline-first).
* **Inline edit**: Edit accounts in-place (row expands to full-width inputs).
  Save/Cancel buttons + *Enter to save*, *Esc to cancel*.
* **Smart visuals**:

  * Dynamic font fit for long account names (stays on one line).
  * Utilization **bar or donut** view (toggle).
  * Risk badges (Healthy / Watch / Medium / High).
  * **0% APR** chips surfaced directly on cards.
* **FICO “threshold nudges”**: Cheapest dollars to drop to hit **30%/50%/80%** per-card + overall minimums.
* **Strategies**:

  * **Debt Avalanche** (highest APR first)
  * **Debt Snowball** (lowest balance first)
  * **Most Expensive** (interest per \$100 ranking)
* **Balance-Transfer Optimizer**:

  * Dropdown to pick target 0% card, optional cap utilization on target.
  * Calculates move list, monthly savings, intro-period net savings vs. fees.
  * **Reset** button to clear inputs/results.
* **Quality of life**:

  * **Undo delete** (5-second toast).
  * **Export** CSV/JSON.
  * **PWA**: installable, offline-first (‘view & add’ work offline; syncs when online).
  * **Mobile-first** responsive layout.
  * Accessibility: keyboard support, focus rings, ARIA labels, high-contrast chips.

> ⚠️ **Disclaimer**: For educational purposes. Not financial advice.

---

## 🧱 Tech Stack

* **Frontend**: HTML + TailwindCSS (no build step required).
* **State/Sync**: Firebase Auth + Firestore (with IndexedDB persistence).
* **PWA**: Service worker + install prompt.
* **CI/CD**: GitHub Actions → GitHub Pages.
* **Secrets**: Injected at build time via Actions (no keys in repo).

---

## 🚀 Live Demo

* Deployed via **GitHub Pages** using Actions.
* Keys are supplied at build time (see below). `env.js` is generated on the server—**never committed**.

---

## 📦 Data Model

```json
artifacts/{projectId}/users/{uid}/cards/{cardId} = {
  "name": "Amex",
  "balance": 3697.15,
  "apr": 29.24,
  "creditLimit": 4000
}
```

* Derived metrics: utilization, monthly interest, interest per \$100.
* All calculations happen **client-side**.

---

## 🛠️ Getting Started (Local)

1. **Firebase Console**

   * Create a web app and enable **Google** provider.
   * Auth → **Authorized domains**: add `localhost` and `127.0.0.1`.
   * Firestore → set **Security Rules** (see sample below).

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

3. **Ensure load order in `index.html`** (in `<head>`):

```html
<script src="env.js"></script>           <!-- must load first -->
<script type="module" src="app.js"></script>
```

4. **Run locally** (serve over HTTP, not file://):

```bash
npx serve .
# or
python3 -m http.server 5173
```

---

## 🔐 Security Rules (example)


```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{project}/users/{uid}/cards/{cardId} {
      allow read, write: if request.auth.uid == uid;
    }
  }
}
```

* This prevents cross-user access.
* Future consideration: Adding field validations with **Rules** or **App Check** later for abuse protection.

---

## 🌐 Deploying to GitHub Pages (No Keys in Repo)

**Why**: Avoids scanners flagging your repo and keeps config out of version control.

1. **Add GitHub Actions Secrets**
   Repo → Settings → *Secrets and variables* → **Actions** → New repository secret:

```
FIREBASE_API_KEY
FIREBASE_AUTH_DOMAIN
FIREBASE_PROJECT_ID
FIREBASE_STORAGE_BUCKET
FIREBASE_MESSAGING_SENDER_ID
FIREBASE_APP_ID
FIREBASE_MEASUREMENT_ID
```

2. **Ignore local `env.js`**

```gitignore
env.js
```

3. **Workflow** `.github/workflows/static.yml` generates `env.js` at build time:

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [ main ] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: "pages", cancel-in-progress: true }

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build static site
        run: |
          mkdir -p dist
          rsync -av --delete --exclude ".git*" --exclude ".github" --exclude "env.js" ./ dist/
      - name: Generate env.js from secrets
        run: |
          cat > dist/env.js << 'EOF'
          window.__FIREBASE_CONFIG = {
            apiKey: "${{ secrets.FIREBASE_API_KEY }}",
            authDomain: "${{ secrets.FIREBASE_AUTH_DOMAIN }}",
            projectId: "${{ secrets.FIREBASE_PROJECT_ID }}",
            storageBucket: "${{ secrets.FIREBASE_STORAGE_BUCKET }}",
            messagingSenderId: "${{ secrets.FIREBASE_MESSAGING_SENDER_ID }}",
            appId: "${{ secrets.FIREBASE_APP_ID }}",
            measurementId: "${{ secrets.FIREBASE_MEASUREMENT_ID }}"
          };
          EOF
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

4. **Settings → Pages** → Build with **GitHub Actions**.

---

## 🧭 Usage Notes

* **Sort** by Name / APR / Balance / Utilization / Interest per \$100.
* **Utilization View**: switch **Bar ↔ Pie** (donut) in the controls.
* **Inline edit**: click ✏️ → fields expand to separate rows for typing comfort.
* **Undo delete**: 5-sec toast with **Undo**.
* **Export**: CSV / JSON from the header action.
* **Optimizer**:

  * Select the **0% target card** from dropdown.
  * Optionally set **Cap Utilization** for target to avoid “maxed” optics.
  * Shows move list + net savings (intro vs fee).

---

## ♿ Accessibility

* Keyboard: **Enter** saves, **Esc** cancels in edit mode.
* Buttons have **ARIA labels**, focus rings.
* Color coding includes redundant text labels (e.g., “Healthy / High”).

---

## 📱 PWA & Offline

* Works offline for most flows; queued writes sync when back online.
* To reset offline cache (dev): DevTools → Application → Clear storage.

---

## 🔮 Future Scope — **Client-Side Encryption (“Lock Mode”)**

**Goal**: data is encrypted in the browser before hitting Firestore, so even project admins cannot read card details.

### Threat Model

* Protects against server-side reads (e.g., console, backups).
* Does **not** protect if a user’s device is compromised while unlocked.

### Approach

* **Passphrase-based** key derivation (no keys stored on server).
* Use **Web Crypto API**; derive an AES-GCM key from passphrase + random salt with PBKDF2 (or scrypt/Argon2id via WASM).
* Encrypt/decrypt per-document fields client-side.

### Data Envelope (versioned)

```json
{
  "v": 1,
  "alg": "AES-GCM",
  "salt": "<base64>",
  "iv": "<base64>",
  "ct": "<base64-ciphertext>"
}
```

### UX

* User toggles **Lock Mode** → sets a passphrase (never sent to server).
* We derive a key in memory; cache it per-session (optional persist in WebCrypto keystore via `crypto.subtle.wrapKey` with platform credentials).
* **No recovery** if passphrase is lost.


### Trade-offs

* No server-side querying on encrypted fields (we can keep small derived non-sensitive indices if needed).
* Key recovery is user responsibility.

---

## 🧭 Roadmap

* [ ] Lock Mode (E2EE) as described above.
* [ ] Multi-currency support.
* [ ] Custom payoff schedule simulator (timeline + amortization).
* [ ] CSV import wizard.
* [ ] App Check (re-enable with Recaptcha v3 site key).
* [ ] Theming & color-blind safe palettes.

---

## 🧩 Troubleshooting

* **Google popup blocked** - falls back to redirect; ensure *Authorized domains* has `localhost` / `127.0.0.1`.
* **Nothing happens** - check that `env.js` loads before `app.js` (Network tab).
* **Stale UI** - unregister service worker and hard-reload.
* **“Permission denied”** - recheck Firestore rules.

---

## 📄 License

`MIT`

---

**Questions / ideas?** Open an issue or ping me—happy to iterate.

---
Built with ❤️ by Avijit Roy.
