# Personal Debt Tracker

Track credit card balances, see true **monthly interest burn**, get **FICO “threshold nudge”** hints, and plan **0% balance transfers** — all in a clean, offline-friendly web app powered by Firebase.

> Built for real-world decisions: visibility, speed, and zero fluff.

---

## Tech Stack

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5\&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-323330?logo=javascript)
![TailwindCSS](https://img.shields.io/badge/Tailwind-38B2AC?logo=tailwindcss\&logoColor=white)
![Firebase Auth](https://img.shields.io/badge/Firebase_Auth-FFCA28?logo=firebase\&logoColor=black)
![Firestore](https://img.shields.io/badge/Cloud_Firestore-039BE5?logo=firebase\&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-5A0FC8?logo=pwa\&logoColor=white)

* **UI**: HTML + Tailwind (responsive, mobile-first, accessible)
* **Auth**: Google Sign-In (Firebase Auth)
* **Data**: Cloud Firestore (real-time sync + **offline persistence**)
* **PWA-ready**: service worker hook included (optional app-shell caching)

---

## Demo Highlights

* **KPI Tiles**: Total Debt, Total Credit, Monthly Interest (live math).
* **Accounts**: Add/Edit/Delete with **inline edit**, **undo delete (5s)**, and **input guardrails**.
* **Sorting**: by Name, APR, Balance, Utilization, or Interest/\$100 (asc/desc).
* **Utilization Visuals**: bar or donut (**pie**) per account + risk badges (Healthy / >30% / >50% / >80%).
* **Credit Score Hints (FICO optics)**:

  * Shows how many cards sit above **30/50/80%** utilization.
  * **Cheapest “threshold nudges”** with exact dollars to drop below the next tier.
  * **Total \$** needed to bring overall utilization to **50%** and **30%**.
* **Strategies**:

  * **Debt Avalanche** (highest APR first).
  * **Debt Snowball** (lowest balance first).
  * **Most Expensive Balances** ranked by **interest cost per \$100**.
* **Balance-Transfer Optimizer**:

  * **Dropdown target** (auto-populated from your accounts) with **0% APR badge** and auto-select heuristics.
  * Inputs: limit, intro months, transfer fee, optional **cap utilization**.
  * Output: recommended moves, monthly savings, intro-period net savings after fees.
  * **Reset** button to clear the planner.
* **Export**: one-click **CSV** or **JSON** (no server).
* **Keyboard UX**: **Enter** to save, **Esc** to cancel (while inline editing).
* **Accessibility**: focus rings, skip-to-content, ARIA where it matters.

---

## How It Works

### Data Model (Firestore)

Each user has a private subcollection of `cards`:

```jsonc
{
  "name": "Amex Blue Cash",
  "balance": 3697.15,        // number
  "apr": 29.24,              // percent APR (0 => 0% intro APR)
  "creditLimit": 4000        // number
}
```

* **Monthly interest** per card = `balance * (apr / 100) / 12`.
* **Interest per \$100** = `monthlyInterest(100, apr)` — used to rank expensive balances.
* **Utilization** per card = `balance / creditLimit`.
* **Overall utilization** = `sum(balance) / sum(limit)`.

### Optimizer Logic (0% APR)

1. **Target** = selected account (prefer **0% APR**; otherwise pick card with most **available room**).
2. **Budget** = min(input limit, remaining room on target, optional cap).
3. Transfer from source cards (excluding the target) in descending **interest/\$100** until budget is exhausted.
4. Compute **monthly savings**, **intro-period savings**, **fees**, and **net**.

---

## Screens & UX Details

### Accounts

* **Inline Edit** expands fields to full width (easier typing).
* **Name fitting**: single-line ellipsis with auto font-shrink for long names (no layout jump).
* **0% APR** accounts show a green badge in list + optimizer dropdown.
* **Undo Delete**: toast with **Undo** (5s).

### Sorting & Views

* `Sort by`: **Name / APR / Balance / Utilization / Interest per \$100**
* `View`: **Bar** or **Pie** (donut). Pie mode is compact — two cards per row on md screens.

### Score Hints

* Shows counts above **30/50/80%**, total dollars to tame each band, and “cheapest” per-card nudges (dollar amounts to drop below the next tier).

### Optimizer (0% Planner)

* **Target dropdown** auto-populates from cards (with current balance + utilization).
* Auto-pick heuristics:

  * Prefer any **0% APR** card (largest limit if multiple).
  * Otherwise pick the card with the most **available room**.
* **Reset** button restores a clean planner state.

### Keyboard

* Inline Edit: **Enter** = save, **Esc** = cancel.

---

## Setup

> This is a static, client-side app. You only need Firebase project config + a static host.

### 1) Firebase Project

* Create a Firebase project; enable:

  * **Authentication ➜ Google Sign-in**
  * **Firestore Database**
* Add **Authorized domains** (e.g., `localhost`, your site).
* Grab the **web app config** and replace the `firebaseConfig` in `app.js`.

### 2) Firestore Security Rules

You said they’re already in place. If you need a simple starting point:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{projectId}/users/{userId}/cards/{cardId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 3) Run Locally

Because `app.js` uses ES modules, serve over HTTP (not `file://`).

```bash
# any simple static server works
npx serve .
# or
python -m http.server 5173
```

Open `http://localhost:3000` (or shown port).

### 4) Deploy

* **GitHub Pages**, **Vercel**, **Netlify**, or your host of choice.
* Ensure the domain is added to Firebase Auth’s authorized domains.

---

## Optional: PWA Install

The app already:

* Enables **Firestore offline persistence** (works offline for data).
* Registers a service worker if `/sw.js` exists.

To finish PWA:

1. Create `/manifest.webmanifest` (name, icons, theme).
2. Create `/sw.js` that caches static assets (index, app.js, CSS, fonts).
3. Ensure `<link rel="manifest" href="/manifest.webmanifest">` is in `index.html`.

> Want me to drop a minimal `sw.js` + `manifest.webmanifest`? I’ll add them with sane defaults.

---

## Project Structure

```text
/
├─ index.html          # Tailwind UI + sections + controls
├─ app.js              # Auth, Firestore, rendering, optimizer, exports, UX glue
├─ (optional) sw.js    # PWA service worker
└─ (optional) manifest.webmanifest
```

---

## Export / Import

* **Export**: CSV / JSON buttons in the header (also duplicated near optimizer on small screens).
* **Import**: (roadmap) Paste JSON ➜ validate ➜ merge/replace with dupe detection.

---

## Accessibility & Mobile

* **Skip link**, focus rings, aria labels on interactive controls.
* Buttons use **min hit target** (36px+) and clear contrasts.
* Layout adapts from single column ➜ two columns on md+ screens.

---

## Notes & Decisions

* **Risk badges** (Healthy / Watch / Medium / High) are based on utilization thresholds and intended for **score optics**, not moral judgment.
* **0% APR detection** is simple (`apr <= 0.01`). If you later store `promoMonths` or `isZeroAprPromo`, we’ll prefer the flag.
* **Financial disclaimer**: This app provides calculations and heuristics — not financial advice.

---

## Roadmap

* Import JSON dialog (merge/replace with diff preview).
* “What-if” payoff simulator with extra payment slider.
* Multi-goal optimizer (min monthly interest vs. hit score optics first).
* Tagging (business/personal) + filters.
* XLSX export.
* i18n + currency formatting options.

---

## License

MIT — do what you want; a credit to **@AvijitRoy** / **#DotNetWithRoy** is appreciated.
