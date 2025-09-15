// ====== UI ELEMENTS ======
const form = document.getElementById("debt-form");
const cardList = document.getElementById("card-list");
const avalancheList = document.getElementById("avalanche-list");
const snowballList = document.getElementById("snowball-list");
const expensiveList = document.getElementById("expensive-list");
const noCardsMessage = document.getElementById("no-cards-message");
const cardIdInput = document.getElementById("card-id");
const submitBtn = document.getElementById("submit-btn");
const totalDebtDisplay = document.getElementById("total-debt");
const totalCreditLineDisplay = document.getElementById("total-credit-line");
const totalMonthlyInterestDisplay = document.getElementById(
  "total-monthly-interest"
);
const accountsMeta = document.getElementById("accounts-meta");

// Auth / modal
const authSection = document.getElementById("auth-section");
const mainApp = document.getElementById("main-app");
const googleSigninBtn = document.getElementById("google-signin-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userDisplay = document.getElementById("user-display");
const authStatus = document.getElementById("auth-status");
const messageModal = document.getElementById("message-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalCloseBtn = document.getElementById("modal-close-btn");

// Controls
const sortBySelect = document.getElementById("sort-by");
const sortDirBtn = document.getElementById("sort-dir");
const utilViewSelect = document.getElementById("util-view");

// Balance transfer optimizer & fields
const btRunBtn = document.getElementById("bt-run");
const btResetBtn = document.getElementById("bt-reset");
const btTargetSelect = document.getElementById("bt-target-id");
const btTargetInput = document.getElementById("bt-target-name"); // legacy text input (optional)

let db, auth, userId;
let unsubscribe;
let sortBy = sortBySelect?.value || "name";
let sortDir = sortDirBtn?.dataset.dir || "desc";
let utilView = utilViewSelect?.value || "bar";
let editingId = null;
window.__latestCards = [];

// ====== AUTH UI ======
function setHeaderAuthUI(isSignedIn, displayName = "") {
  if (!userDisplay || !signOutBtn) return;
  if (isSignedIn) {
    userDisplay.textContent = `Signed in as: ${displayName || "Guest"}`;
    signOutBtn.classList.remove("hidden");
  } else {
    userDisplay.textContent = "";
    signOutBtn.classList.add("hidden");
  }
}
setHeaderAuthUI(false);

// ====== MODAL & TOAST ======
function showModal(title, message) {
  if (!messageModal) return alert(`${title}\n\n${message}`);
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  messageModal.classList.remove("hidden");
}
modalCloseBtn?.addEventListener("click", () =>
  messageModal?.classList.add("hidden")
);

function toast(message, duration = 1800) {
  const t = document.createElement("div");
  t.className =
    "fixed bottom-4 right-4 z-[1100] bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg opacity-0 transition-opacity";
  t.textContent = message;
  document.body.appendChild(t);
  requestAnimationFrame(() => {
    t.classList.replace("opacity-0", "opacity-90");
  });
  setTimeout(() => {
    t.classList.replace("opacity-90", "opacity-0");
    setTimeout(() => t.remove(), 300);
  }, duration);
}

// ====== FIREBASE ======
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Load config from env.js
const firebaseConfig = window.__FIREBASE_CONFIG;
if (!firebaseConfig || !firebaseConfig.apiKey) {
  console.error(
    "[Config] Missing Firebase config. Ensure env.js loads BEFORE app.js."
  );
  authStatus &&
    (authStatus.textContent =
      "Config missing: ensure env.js loads before app.js.");
  // Add a visible banner so it’s obvious in UI
  const warn = document.createElement("div");
  warn.className =
    "max-w-5xl mx-auto my-3 p-3 rounded border bg-amber-50 text-amber-800";
  warn.textContent =
    "Missing Firebase config. Did you include env.js before app.js?";
  document.body.prepend(warn);
  throw new Error("Missing Firebase config");
}
console.log("[Auth] Config OK for project:", firebaseConfig.projectId);
const appId = firebaseConfig.projectId;

function initFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Offline-first Firestore (ignore multi-tab error)
    enableIndexedDbPersistence(db).catch(() => {});

    // Complete redirect sign-in if we came back from Google
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user)
          console.log("[Auth] Redirect success for", res.user.email);
      })
      .catch((err) => {
        console.warn("[Auth] Redirect error:", err?.code, err?.message);
        if (authStatus && err?.code === "auth/unauthorized-domain") {
          authStatus.textContent =
            "Add localhost / 127.0.0.1 to Authorized domains in Firebase Auth.";
        }
      });

    onAuthStateChanged(auth, (user) => {
      if (user) {
        userId = user.uid;
        authSection?.classList.add("hidden");
        mainApp?.classList.remove("hidden");
        authStatus && (authStatus.textContent = "");
        setHeaderAuthUI(true, user.displayName);
        setupFirestoreListener(user.uid);
      } else {
        userId = null;
        authSection?.classList.remove("hidden");
        mainApp?.classList.add("hidden");
        setHeaderAuthUI(false);
      }
    });
  } catch (err) {
    console.error("[Init] Firebase init failed:", err);
    authStatus &&
      (authStatus.textContent =
        "Failed to initialize Firebase. Check your configuration.");
  }
}

function setupFirestoreListener(uid) {
  if (unsubscribe) unsubscribe();
  const cardsCollection = collection(
    db,
    `artifacts/${appId}/users/${uid}/cards`
  );
  unsubscribe = onSnapshot(
    cardsCollection,
    (snapshot) => {
      const fetchedCards = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      window.__latestCards = fetchedCards.map((x) => ({ ...x }));
      if (editingId && !window.__latestCards.find((c) => c.id === editingId))
        editingId = null;
      renderAll(window.__latestCards);
    },
    (error) => console.error("[Firestore] onSnapshot error:", error)
  );
}

// ====== HELPERS ======
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => USD.format(+n || 0);
const monthlyInterest = (balance, aprPct) =>
  !balance || !aprPct ? 0 : (balance * (aprPct / 100)) / 12;
const interestPer100 = (aprPct) => (!aprPct ? 0 : monthlyInterest(100, aprPct));

function computeTotals(cards) {
  let debt = 0,
    limit = 0,
    monthly = 0;
  for (const c of cards) {
    const b = +c.balance || 0,
      l = +c.creditLimit || 0,
      a = +c.apr || 0;
    debt += b;
    limit += l;
    monthly += monthlyInterest(b, a);
  }
  const util = limit > 0 ? (debt / limit) * 100 : 0;
  return { debt, limit, monthly, util };
}
function computeCardUtilization(card) {
  const b = +card.balance || 0,
    l = +card.creditLimit || 0;
  return l > 0 ? (b / l) * 100 : 0;
}
function riskBadge(util) {
  if (util > 80)
    return '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">>80% High</span>';
  if (util > 50)
    return '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">>50% Medium</span>';
  if (util > 30)
    return '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">>30% Watch</span>';
  return '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Healthy</span>';
}
function rankByInterestPer100(cards) {
  return cards
    .filter((c) => (+c.balance || 0) > 0)
    .map((c) => ({
      name: c.name,
      id: c.id,
      balance: +c.balance || 0,
      apr: +c.apr || 0,
      per100: interestPer100(+c.apr || 0),
    }))
    .sort((a, b) => b.per100 - a.per100);
}

// FICO optics
function computeFicoHints(cards) {
  const thresholds = [80, 50, 30];
  let over80 = 0,
    over50 = 0,
    over30 = 0;
  const nudges = [];
  let sumTo80 = 0,
    sumTo50 = 0,
    sumTo30 = 0;

  for (const c of cards) {
    const bal = +c.balance || 0,
      lim = +c.creditLimit || 0;
    if (!lim || bal <= 0) continue;
    const util = (bal / lim) * 100;
    if (util > 80) {
      over80++;
      sumTo80 += bal - 0.8 * lim;
    }
    if (util > 50) {
      over50++;
      sumTo50 += bal - 0.5 * lim;
    }
    if (util > 30) {
      over30++;
      sumTo30 += bal - 0.3 * lim;
    }

    const next = thresholds.find((t) => util > t);
    if (next !== undefined) {
      const targetBal = (next / 100) * lim;
      const dollarsToDrop = Math.max(0, bal - targetBal);
      if (dollarsToDrop > 0.01)
        nudges.push({
          name: c.name,
          currentUtil: util,
          nextThreshold: next,
          dollarsToDrop,
        });
    }
  }
  nudges.sort((a, b) => a.dollarsToDrop - b.dollarsToDrop);

  const { debt, limit } = computeTotals(cards);
  const to50Overall = Math.max(0, debt - 0.5 * limit);
  const to30Overall = Math.max(0, debt - 0.3 * limit);

  return {
    over80,
    over50,
    over30,
    nudges,
    sumTo80,
    sumTo50,
    sumTo30,
    to50Overall,
    to30Overall,
  };
}

// Balance transfer planner
function planBalanceTransfer(
  cards,
  targetName,
  rawLimit,
  feePct,
  months,
  capPct,
  targetId
) {
  const limit = Math.max(0, +rawLimit || 0);
  const fee = Math.max(0, (+feePct || 0) / 100);
  const introMonths = Math.max(0, +months || 0);
  const cap = capPct ? Math.max(0, Math.min(100, +capPct)) : null;

  let target = targetId ? cards.find((c) => c.id === targetId) : null;
  if (!target && targetName) {
    target = cards.find(
      (c) =>
        (c.name || "").trim().toLowerCase() === targetName.trim().toLowerCase()
    );
  }
  if (!target) return { error: "Target 0% card not found.", moves: [] };

  const targetLimit = +target.creditLimit || 0;
  const targetBalance = +target.balance || 0;

  let maxRoomByLimit = Math.max(0, targetLimit - targetBalance);
  if (cap !== null && targetLimit > 0) {
    const capBal = (cap / 100) * targetLimit;
    const capRoom = Math.max(0, capBal - targetBalance);
    maxRoomByLimit = Math.min(maxRoomByLimit, capRoom);
  }
  const maxRoom = Math.min(limit, maxRoomByLimit);
  if (maxRoom <= 0.01)
    return {
      error: "No available room on 0% card (limit/cap reached).",
      moves: [],
    };

  const ranked = rankByInterestPer100(cards).filter(
    (r) =>
      r.id !== target.id &&
      r.name.trim().toLowerCase() !== target.name.trim().toLowerCase()
  );

  let remaining = maxRoom;
  const moves = [];
  for (const src of ranked) {
    if (remaining <= 0.01) break;
    const take = Math.min(remaining, src.balance);
    if (take <= 0.01) continue;
    const estMonthlySaved = interestPer100(src.apr) * (take / 100);
    const estIntroSaved = estMonthlySaved * introMonths;
    const feeCost = take * fee;
    moves.push({
      from: src.name,
      amount: take,
      apr: src.apr,
      estMonthlySaved,
      estIntroSaved,
      feeCost,
    });
    remaining -= take;
  }
  const totalTransfer = moves.reduce((s, m) => s + m.amount, 0);
  const totalMonthlySaved = moves.reduce((s, m) => s + m.estMonthlySaved, 0);
  const totalIntroSaved = moves.reduce((s, m) => s + m.estIntroSaved, 0);
  const totalFees = moves.reduce((s, m) => s + m.feeCost, 0);
  const netIntroSavings = totalIntroSaved - totalFees;
  return {
    target: target.name,
    capApplied: cap !== null ? cap : null,
    totalTransfer,
    totalMonthlySaved,
    totalIntroSaved,
    totalFees,
    netIntroSavings,
    moves,
  };
}

// Dynamic font size
function nameFontClass(name = "") {
  const len = (name || "").length;
  if (len <= 22) return "text-base";
  if (len <= 28) return "text-[0.95rem]";
  if (len <= 34) return "text-[0.90rem]";
  if (len <= 40) return "text-[0.85rem]";
  return "text-[0.80rem]";
}

// Sorting
function sortCardsGeneric(cards) {
  const arr = [...cards];
  arr.sort((a, b) => {
    const utilA = computeCardUtilization(a);
    const utilB = computeCardUtilization(b);
    const per100A = interestPer100(+a.apr || 0);
    const per100B = interestPer100(+b.apr || 0);

    let va, vb;
    switch (sortBy) {
      case "name":
        va = (a.name || "").toLowerCase();
        vb = (b.name || "").toLowerCase();
        break;
      case "apr":
        va = +a.apr || 0;
        vb = +b.apr || 0;
        break;
      case "balance":
        va = +a.balance || 0;
        vb = +b.balance || 0;
        break;
      case "utilization":
        va = utilA;
        vb = utilB;
        break;
      case "interestPer100":
        va = per100A;
        vb = per100B;
        break;
      default:
        va = 0;
        vb = 0;
    }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ? 1 : -1;
    return 0;
  });
  return arr;
}

// ====== RENDERERS ======
function renderAll(cards) {
  populateBtDropdown(cards);
  renderCards(cards);
  renderStrategy(cards, "avalanche");
  renderStrategy(cards, "snowball");
  renderExpensive(cards);
  renderFicoHints(cards);
}

function renderCards(cards) {
  const { debt, limit, monthly, util } = computeTotals(cards);
  if (totalDebtDisplay) totalDebtDisplay.textContent = fmtMoney(debt);
  if (totalCreditLineDisplay)
    totalCreditLineDisplay.textContent = fmtMoney(limit);
  if (totalMonthlyInterestDisplay)
    totalMonthlyInterestDisplay.textContent = fmtMoney(monthly);
  if (accountsMeta)
    accountsMeta.textContent = cards.length
      ? `Overall Utilization: ${util.toFixed(1)}% • Accounts: ${cards.length}`
      : "";

  cardList.innerHTML = "";
  if (!cards.length) {
    if (noCardsMessage) noCardsMessage.style.display = "block";
    return;
  }
  if (noCardsMessage) noCardsMessage.style.display = "none";

  const sorted = sortCardsGeneric(cards);
  sorted.forEach((card) => {
    const balance = +card.balance || 0;
    const apr = +card.apr || 0;
    const creditLimit = +card.creditLimit || 0;
    const monthlyInt = monthlyInterest(balance, apr);
    const utilization = computeCardUtilization(card);
    const utilColor =
      utilization <= 30
        ? "bg-emerald-500"
        : utilization <= 50
        ? "bg-amber-500"
        : "bg-rose-500";
    const isEditing = editingId === card.id;

    const el = document.createElement("div");
    el.className = "bg-white p-4 rounded-lg shadow-sm border border-gray-100";

    if (!isEditing) {
      el.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <h3 class="name-fit font-semibold text-gray-900 flex items-center whitespace-nowrap overflow-hidden text-ellipsis ${nameFontClass(
              card.name
            )}" title="${card.name}">
              ${card.name} ${riskBadge(utilization)}
            </h3>
            <div class="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
              <p>Balance: <span class="font-semibold text-gray-900">${fmtMoney(
                balance
              )}</span></p>
              <p>APR:
                <span class="font-semibold text-gray-900">${apr.toFixed(
                  2
                )}%</span>
                ${
                  apr <= 0.01
                    ? '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">0% APR</span>'
                    : ""
                }
              </p>
              <p>Limit: <span class="font-semibold text-gray-900">${fmtMoney(
                creditLimit
              )}</span></p>
              <p>Monthly Interest: <span class="font-semibold text-gray-900">${fmtMoney(
                monthlyInt
              )}</span></p>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button
              class="inline-edit-btn w-9 h-9 flex items-center justify-center rounded-full bg-sky-600 text-white hover:bg-sky-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition-colors"
              data-id="${card.id}" title="Edit" aria-label="Edit">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15.232 5.232l3.536 3.536M4 20h4l10.5-10.5a2.5 2.5 0 10-3.536-3.536L4 16v4z"/>
              </svg>
            </button>
            <button
              class="delete-btn w-9 h-9 flex items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition-colors"
              data-id="${card.id}" title="Delete" aria-label="Delete">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 7h12M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2m1 0v12a2 2 0 01-2 2H8a2 2 0 01-2-2V7"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="mt-3">
          <div class="flex items-center justify-between mb-1">
            <p class="text-sm text-gray-700">Utilization: <span class="font-semibold">${utilization.toFixed(
              1
            )}%</span></p>
            <p class="text-xs text-gray-400">View: ${utilView.toUpperCase()}</p>
          </div>

          ${
            utilView === "pie"
              ? donut(utilization)
              : `
            <div class="w-full bg-gray-200 rounded-full h-2.5">
              <div class="${utilColor} h-2.5 rounded-full" style="width:${Math.min(
                  100,
                  utilization
                )}%"></div>
            </div>
          `
          }
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <h3 class="name-fit font-semibold text-gray-900 flex items-center whitespace-nowrap overflow-hidden text-ellipsis ${nameFontClass(
              card.name
            )}" title="${card.name}">
              ${
                card.name
              } <span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">Editing</span>
            </h3>
            <div class="mt-3 space-y-3 text-sm">
              <label class="block">
                <span class="text-gray-600">Balance ($)</span>
                <input data-field="balance" type="number" step="0.01" min="0" value="${balance}"
                       class="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500"/>
              </label>
              <label class="block">
                <span class="text-gray-600">APR (%)</span>
                <input data-field="apr" type="number" step="0.01" min="0" max="99.99" value="${apr}"
                       class="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500"/>
              </label>
              <label class="block">
                <span class="text-gray-600">Limit ($)</span>
                <input data-field="creditLimit" type="number" step="0.01" min="0" value="${creditLimit}"
                       class="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500"/>
              </label>
              <label class="block">
                <span class="text-gray-600">Name</span>
                <input data-field="name" type="text" value="${card.name}"
                       class="w-full mt-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-sky-500"/>
              </label>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="save-inline-btn px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" data-id="${
              card.id
            }">Save</button>
            <button class="cancel-inline-btn px-3 py-1.5 text-xs bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors focus-visible:ring-2 focus-visible:ring-gray-400" data-id="${
              card.id
            }">Cancel</button>
          </div>
        </div>
        <div class="mt-3 text-xs text-gray-500">
          Tip: Press <span class="font-semibold">Enter</span> to save or <span class="font-semibold">Esc</span> to cancel.
        </div>
      `;
    }
    cardList.appendChild(el);
  });
}

function donut(util) {
  const r = 18,
    c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, util));
  const filled = c * (pct / 100);
  const remaining = c - filled;
  const color = util <= 30 ? "#10b981" : util <= 50 ? "#f59e0b" : "#ef4444";
  return `
    <div class="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 48 48" role="img" aria-label="Utilization donut">
        <circle cx="24" cy="24" r="${r}" stroke="#e5e7eb" stroke-width="6" fill="none"/>
        <circle cx="24" cy="24" r="${r}" stroke="${color}" stroke-width="6" fill="none"
                stroke-dasharray="${filled} ${remaining}" transform="rotate(-90 24 24)"/>
      </svg>
      <span class="text-sm text-gray-700">${pct.toFixed(1)}%</span>
    </div>
  `;
}

function renderStrategy(cards, strategy) {
  const target = strategy === "avalanche" ? avalancheList : snowballList;
  const sorted =
    strategy === "avalanche"
      ? [...cards].sort((a, b) => (+b.apr || 0) - (+a.apr || 0))
      : [...cards].sort((a, b) => (+a.balance || 0) - (+b.balance || 0));

  if (!target) return;
  target.innerHTML = "";
  if (!cards.length) {
    target.innerHTML =
      '<p class="text-gray-500">Add accounts to see the payoff plan.</p>';
    return;
  }
  sorted.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className = "p-3 bg-white rounded-md shadow-sm border border-gray-200";
    el.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center min-w-0">
          <span class="text-lg font-bold text-gray-600 w-6">${idx + 1}.</span>
          <p class="ml-2 font-medium text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis ${nameFontClass(
            card.name
          )}" title="${card.name}">
            ${card.name}
          </p>
        </div>
        <p class="text-xs text-gray-500">Bal ${fmtMoney(
          +card.balance || 0
        )} • APR ${(+card.apr || 0).toFixed(
      2
    )}% • Util ${computeCardUtilization(card).toFixed(0)}%</p>
      </div>
    `;
    target.appendChild(el);
  });
}

function renderExpensive(cards) {
  if (!expensiveList) return;
  const ranked = rankByInterestPer100(cards);
  expensiveList.innerHTML = "";
  if (!ranked.length) {
    expensiveList.innerHTML =
      '<p class="text-gray-500">Add accounts to see per-$100 cost ranking.</p>';
    return;
  }
  ranked.slice(0, 6).forEach((r, i) => {
    const row = document.createElement("div");
    row.className =
      "p-3 bg-white rounded-md shadow-sm border border-gray-200 flex items-center justify-between";
    row.innerHTML = `
      <div class="flex items-center min-w-0">
        <span class="text-lg font-bold text-gray-600 w-6">${i + 1}.</span>
        <div class="ml-2 min-w-0">
          <p class="font-medium text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis ${nameFontClass(
            r.name
          )}" title="${r.name}">${r.name}</p>
          <p class="text-xs text-gray-500">APR ${r.apr.toFixed(
            2
          )}% • Balance ${fmtMoney(r.balance)}</p>
        </div>
      </div>
      <span class="text-sm font-semibold text-rose-700">${fmtMoney(
        r.per100
      )}/$100</span>
    `;
    expensiveList.appendChild(row);
  });
}

function renderFicoHints(cards) {
  const box = document.getElementById("fico-hints");
  if (!box) return;
  box.innerHTML = "";
  if (!cards.length) {
    box.innerHTML =
      '<p class="text-gray-500">Add accounts to see utilization thresholds and “nudge” amounts.</p>';
    return;
  }
  const { util } = computeTotals(cards);
  const {
    over80,
    over50,
    over30,
    nudges,
    sumTo80,
    sumTo50,
    sumTo30,
    to50Overall,
    to30Overall,
  } = computeFicoHints(cards);

  const summary = document.createElement("div");
  summary.className =
    "p-3 bg-white rounded-md shadow-sm border border-gray-200";
  summary.innerHTML = `
    <p><span class="font-medium">Overall Utilization:</span> ${util.toFixed(
      1
    )}%</p>
    <p class="mt-1 flex flex-wrap gap-x-4 gap-y-1 items-center">
      <span>Cards >80%:
        <span class="font-semibold ${
          over80 ? "text-rose-600" : "text-emerald-600"
        }">${over80}</span>
        <span class="ml-2 text-xs text-gray-500">Min to tame: ${fmtMoney(
          sumTo80
        )}</span>
      </span>
      <span>>50%:
        <span class="font-semibold ${
          over50 ? "text-amber-600" : "text-emerald-600"
        }">${over50}</span>
        <span class="ml-2 text-xs text-gray-500">Min to tame: ${fmtMoney(
          sumTo50
        )}</span>
      </span>
      <span>>30%:
        <span class="font-semibold ${
          over30 ? "text-yellow-600" : "text-emerald-600"
        }">${over30}</span>
        <span class="ml-2 text-xs text-gray-500">Min to tame: ${fmtMoney(
          sumTo30
        )}</span>
      </span>
    </p>
    <p class="mt-1 text-xs text-gray-500">Overall dollars to reach target utilization — to 50%: <span class="font-semibold text-gray-700">${fmtMoney(
      to50Overall
    )}</span> • to 30%: <span class="font-semibold text-gray-700">${fmtMoney(
    to30Overall
  )}</span></p>
  `;
  box.appendChild(summary);

  if (nudges.length) {
    const list = document.createElement("div");
    list.className = "mt-3 flex flex-wrap gap-2";
    const title = document.createElement("p");
    title.className = "w-full font-medium";
    title.textContent = "Cheapest “threshold nudges” (FICO optics):";
    list.appendChild(title);

    nudges.slice(0, 8).forEach((n) => {
      const chip = document.createElement("span");
      chip.className = "text-xs px-2 py-1 rounded-full border bg-white";
      chip.textContent = `${n.name}: ${n.currentUtil.toFixed(1)}% → ${
        n.nextThreshold
      }% • Pay ${fmtMoney(n.dollarsToDrop)}`;
      list.appendChild(chip);
    });
    box.appendChild(list);
  } else {
    const ok = document.createElement("p");
    ok.className = "text-sm text-emerald-700 mt-2";
    ok.textContent =
      "Nice! No cards above 30%, utilization profile looks healthy.";
    box.appendChild(ok);
  }
}

// ====== OPTIMIZER DROPDOWN ======
function populateBtDropdown(cards) {
  if (!btTargetSelect) return;

  const prev = btTargetSelect.value;
  btTargetSelect.innerHTML =
    '<option value="">-- Select 0% target card --</option>';

  cards.forEach((c) => {
    const util = computeCardUtilization(c);
    const apr = +c.apr || 0;
    const opt = document.createElement("option");
    opt.value = c.id;
    const zeroAprTag = apr <= 0.01 ? " • 0% APR" : "";
    opt.textContent = `${c.name} • Bal ${fmtMoney(
      +c.balance || 0
    )} • Util ${util.toFixed(0)}%${zeroAprTag}`;
    btTargetSelect.appendChild(opt);
  });

  // Keep prior selection if still present
  if ([...btTargetSelect.options].some((o) => o.value === prev)) {
    btTargetSelect.value = prev;
  }

  // Auto-pick: prefer 0% APR (largest limit), else most remaining room
  if (!btTargetSelect.value && cards.length) {
    const zeroApr = cards.filter((c) => (+c.apr || 0) <= 0.01);
    if (zeroApr.length === 1) {
      btTargetSelect.value = zeroApr[0].id;
    } else if (zeroApr.length > 1) {
      zeroApr.sort((a, b) => (+b.creditLimit || 0) - (+a.creditLimit || 0));
      btTargetSelect.value = zeroApr[0].id;
    } else {
      const byRoom = [...cards]
        .map((c) => ({ ...c, room: (+c.creditLimit || 0) - (+c.balance || 0) }))
        .sort((a, b) => b.room - a.room);
      if (byRoom[0] && byRoom[0].room > 0) btTargetSelect.value = byRoom[0].id;
    }
  }
}

// ====== EXPORT (exposed for onclick in HTML) ======
function downloadFile(name, type, data) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function exportData(format = "csv") {
  const rows = window.__latestCards.map((c) => ({
    id: c.id,
    name: c.name,
    balance: +c.balance || 0,
    apr: +c.apr || 0,
    creditLimit: +c.creditLimit || 0,
  }));
  if (format === "json") {
    downloadFile(
      "debt-tracker.json",
      "application/json",
      JSON.stringify(rows, null, 2)
    );
  } else {
    const header = "id,name,balance,apr,creditLimit";
    const csv = [
      header,
      ...rows.map(
        (r) =>
          `${r.id},"${(r.name || "").replace(/"/g, '""')}",${r.balance},${
            r.apr
          },${r.creditLimit}`
      ),
    ].join("\n");
    downloadFile("debt-tracker.csv", "text/csv", csv);
  }
}
window.exportData = exportData;

// ====== EVENTS ======

// Add / Update (top form)
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = cardIdInput.value;
  const name = document.getElementById("card-name").value.trim();

  // Guardrails
  const balance = Math.max(
    0,
    parseFloat(document.getElementById("balance").value)
  );
  const apr = Math.min(
    99.99,
    Math.max(0, parseFloat(document.getElementById("apr").value))
  );
  const creditLimit = Math.max(
    0,
    parseFloat(document.getElementById("limit").value)
  );

  if (!name || isNaN(balance) || isNaN(apr) || isNaN(creditLimit)) {
    showModal(
      "Validation",
      "Please enter valid Name, Balance, APR, and Credit Limit."
    );
    return;
  }
  if (!userId) {
    showModal("Authentication", "Please sign in to add accounts.");
    return;
  }

  const cardsCollection = collection(
    db,
    `artifacts/${appId}/users/${userId}/cards`
  );
  try {
    const data = { name, balance, apr, creditLimit };
    if (id) await setDoc(doc(cardsCollection, id), data);
    else await setDoc(doc(cardsCollection), data);
    toast(id ? "Account updated" : "Account added");
  } catch (err) {
    console.error("[Save] Add/Update failed:", err);
    showModal("Error", "Could not save the account.");
  }

  form.reset();
  cardIdInput.value = "";
  submitBtn.textContent = "Add Account";
});

// Inline edit + delete (with Undo)
cardList?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".inline-edit-btn");
  const cancelBtn = e.target.closest(".cancel-inline-btn");
  const saveBtn = e.target.closest(".save-inline-btn");
  const deleteBtn = e.target.closest(".delete-btn");

  if (editBtn) {
    editingId = editBtn.dataset.id;
    renderCards(window.__latestCards);
    return;
  }
  if (cancelBtn) {
    editingId = null;
    renderCards(window.__latestCards);
    return;
  }
  if (saveBtn) {
    if (!userId) {
      showModal("Authentication", "Please sign in to edit accounts.");
      return;
    }
    const id = saveBtn.dataset.id;
    const cardEl = saveBtn.closest(".bg-white");
    if (!cardEl) return;

    const getVal = (sel) => {
      const inp = cardEl.querySelector(`input[data-field="${sel}"]`);
      return inp ? inp.value : null;
    };
    const updated = {
      balance: Math.max(0, parseFloat(getVal("balance"))),
      apr: Math.min(99.99, Math.max(0, parseFloat(getVal("apr")))),
      creditLimit: Math.max(0, parseFloat(getVal("creditLimit"))),
      name: (getVal("name") || "").trim(),
    };
    if (
      !updated.name ||
      isNaN(updated.balance) ||
      isNaN(updated.apr) ||
      isNaN(updated.creditLimit)
    ) {
      showModal(
        "Validation",
        "Please provide valid values for Name, Balance, APR, and Limit."
      );
      return;
    }

    const cardsCollection = collection(
      db,
      `artifacts/${appId}/users/${userId}/cards`
    );
    const prevHTML = saveBtn.innerHTML;

    try {
      saveBtn.disabled = true;
      saveBtn.innerHTML = "Saving…";
      await setDoc(doc(cardsCollection, id), updated);

      editingId = null;
      toast("Account updated");

      // Optimistic render
      const idx = window.__latestCards.findIndex((c) => c.id === id);
      if (idx !== -1)
        window.__latestCards[idx] = {
          ...window.__latestCards[idx],
          ...updated,
        };
      renderCards(window.__latestCards);
    } catch (err) {
      console.error("[Save] Inline save failed:", err);
      showModal("Error", "Saving failed. Please try again.");
      if (saveBtn.isConnected) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = prevHTML;
      }
    }
    return;
  }
  if (deleteBtn) {
    if (!userId) {
      showModal("Authentication", "Please sign in to delete accounts.");
      return;
    }
    const id = deleteBtn.dataset.id;
    const cardsCollection = collection(
      db,
      `artifacts/${appId}/users/${userId}/cards`
    );

    const snapshot = window.__latestCards.find((c) => c.id === id);
    if (!snapshot) {
      return;
    }

    try {
      await deleteDoc(doc(cardsCollection, id));
      let undone = false;

      const undoEl = document.createElement("div");
      undoEl.className =
        "fixed bottom-4 right-4 z-[1100] bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg flex items-center gap-3";
      undoEl.innerHTML = `<span>Account deleted</span>
        <button class="px-2 py-1 bg-white text-gray-900 rounded hover:bg-gray-100 text-xs" id="undo-delete">Undo</button>`;
      document.body.appendChild(undoEl);

      const timer = setTimeout(() => {
        if (undoEl.isConnected) undoEl.remove();
      }, 5000);

      undoEl
        .querySelector("#undo-delete")
        .addEventListener("click", async () => {
          if (undone) return;
          undone = true;
          clearTimeout(timer);
          if (undoEl.isConnected) undoEl.remove();

          await setDoc(doc(cardsCollection, id), {
            name: snapshot.name,
            balance: snapshot.balance,
            apr: snapshot.apr,
            creditLimit: snapshot.creditLimit,
          });
          toast("Delete undone");
        });
    } catch (err) {
      console.error("[Delete] Delete failed:", err);
      showModal("Error", "Delete failed. Please try again.");
    }
    return;
  }
});

// Keyboard shortcuts (Enter=Save, Esc=Cancel)
cardList?.addEventListener("keydown", (e) => {
  const editingCard = e.target.closest(".bg-white");
  if (!editingCard) return;
  const saveBtn = editingCard.querySelector(".save-inline-btn");
  const cancelBtn = editingCard.querySelector(".cancel-inline-btn");
  if (!saveBtn || !cancelBtn) return;

  if (e.key === "Escape") {
    cancelBtn.click();
  } else if (e.key === "Enter") {
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input") {
      e.preventDefault();
      saveBtn.click();
    }
  }
});

// Controls
sortBySelect?.addEventListener("change", () => {
  sortBy = sortBySelect.value;
  renderCards(window.__latestCards);
});
sortDirBtn?.addEventListener("click", () => {
  sortDir = sortDirBtn.dataset.dir === "asc" ? "desc" : "asc";
  sortDirBtn.dataset.dir = sortDir;
  sortDirBtn.textContent = sortDir === "asc" ? "Asc" : "Desc";
  renderCards(window.__latestCards);
});
utilViewSelect?.addEventListener("change", () => {
  utilView = utilViewSelect.value;
  renderCards(window.__latestCards);
});

// Sign-in logic with popup → redirect fallback
googleSigninBtn?.addEventListener("click", async () => {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    googleSigninBtn.disabled = true;
    const prev = googleSigninBtn.textContent;
    googleSigninBtn.textContent = "Opening Google…";

    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      // Popup blocked or closed? fall back to redirect
      if (
        err?.code === "auth/popup-blocked" ||
        err?.code === "auth/popup-closed-by-user"
      ) {
        googleSigninBtn.textContent = "Redirecting…";
        await signInWithRedirect(auth, provider);
        return;
      }
      if (err?.code === "auth/unauthorized-domain") {
        showModal(
          "Domain not authorized",
          "Add localhost and 127.0.0.1 in Firebase Auth → Settings → Authorized domains."
        );
      }
      throw err;
    } finally {
      if (googleSigninBtn.isConnected) {
        googleSigninBtn.disabled = false;
        googleSigninBtn.textContent = prev;
      }
    }
  } catch (err) {
    console.error("[Auth] Sign-in failed:", err?.code, err?.message);
    authStatus &&
      (authStatus.textContent = `${err?.code || "auth/error"} — ${
        err?.message || "Sign-in failed."
      }`);
    showModal(
      "Sign-in failed",
      `${err?.code || "auth/error"} — ${err?.message || "Try again."}`
    );
  }
});

signOutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    setHeaderAuthUI(false);
    noCardsMessage && (noCardsMessage.style.display = "block");
    cardList && (cardList.innerHTML = "");
    totalDebtDisplay && (totalDebtDisplay.textContent = `$0.00`);
    totalCreditLineDisplay && (totalCreditLineDisplay.textContent = `$0.00`);
    totalMonthlyInterestDisplay &&
      (totalMonthlyInterestDisplay.textContent = `$0.00`);
    accountsMeta && (accountsMeta.textContent = "");
    form?.reset();
    editingId = null;
  } catch (err) {
    console.error("[Auth] Sign-out failed:", err);
  }
});

// Optimizer: Recommend
btRunBtn?.addEventListener("click", () => {
  const targetIdFromSelect = btTargetSelect?.value || "";
  let targetName = "";
  if (targetIdFromSelect) {
    const targetCard = window.__latestCards.find(
      (c) => c.id === targetIdFromSelect
    );
    targetName = targetCard?.name || "";
  } else if (btTargetInput && btTargetInput.value.trim()) {
    targetName = btTargetInput.value.trim();
  } else {
    showModal("Missing Target", "Please select (or type) your 0% target card.");
    return;
  }

  const limit = +document.getElementById("bt-limit")?.value || 0;
  const months = +document.getElementById("bt-months")?.value || 0;
  const fee = +document.getElementById("bt-fee")?.value || 0;
  const capVal = document.getElementById("bt-cap")?.value;
  const cap = capVal ? +capVal : null;

  if (!userId) {
    showModal("Authentication", "Please sign in to run the optimizer.");
    return;
  }
  if (!window.__latestCards.length) {
    showModal("No Data", "Please add accounts first.");
    return;
  }

  const result = planBalanceTransfer(
    window.__latestCards,
    targetName,
    limit,
    fee,
    months,
    cap,
    targetIdFromSelect
  );
  const out = document.getElementById("bt-output");
  if (!out) return;
  out.innerHTML = "";

  if (result.error) {
    out.innerHTML = `<p class="text-rose-600">${result.error}</p>`;
    return;
  }

  const hdr = document.createElement("div");
  hdr.className = "p-3 bg-white rounded-md border border-gray-200";
  hdr.innerHTML = `
    <p class="font-medium">Target: ${result.target}${
    result.capApplied !== null ? ` (cap ${result.capApplied}%)` : ""
  }</p>
    <p>Total Transfer: <span class="font-semibold">${fmtMoney(
      result.totalTransfer
    )}</span></p>
    <p>Monthly Interest Saved: <span class="font-semibold">${fmtMoney(
      result.totalMonthlySaved
    )}</span></p>
    <p>Intro Savings (months ${months}) vs Fees: <span class="font-semibold">${fmtMoney(
    result.totalIntroSaved
  )} saved • ${fmtMoney(result.totalFees)} fees</span></p>
    <p class="${
      result.netIntroSavings >= 0 ? "text-emerald-700" : "text-rose-700"
    }">Net Savings Over Intro: <span class="font-semibold">${fmtMoney(
    result.netIntroSavings
  )}</span></p>
  `;
  out.appendChild(hdr);

  if (result.moves.length) {
    const list = document.createElement("div");
    list.className = "mt-3 space-y-2";
    result.moves.forEach((m, i) => {
      const row = document.createElement("div");
      row.className = "text-sm p-2 bg-white rounded border border-gray-200";
      row.innerHTML = `
        <span class="font-medium">${i + 1}.</span> Move ${fmtMoney(
        m.amount
      )} from <span class="font-semibold">${m.from}</span>
        (APR ${m.apr.toFixed(2)}%) • Est monthly saved ~${fmtMoney(
        m.estMonthlySaved
      )}
        ${
          months ? ` • Intro saved ~${fmtMoney(m.estIntroSaved)}` : ""
        } • Fee ~${fmtMoney(m.feeCost)}
      `;
      list.appendChild(row);
    });
    out.appendChild(list);
  } else {
    out.innerHTML +=
      '<p class="text-gray-600 mt-2">No eligible moves found.</p>';
  }
});

// Optimizer: Reset
btResetBtn?.addEventListener("click", () => {
  if (btTargetSelect) btTargetSelect.value = "";
  if (btTargetInput) btTargetInput.value = "";
  ["bt-limit", "bt-months", "bt-fee", "bt-cap"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const out = document.getElementById("bt-output");
  if (out)
    out.innerHTML =
      '<p class="text-gray-500">Enter details and click “Recommend Transfer”.</p>';
  toast("Optimizer reset");
});

// PWA SW registration (optional; harmless if missing)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

// ====== BOOT ======
initFirebase();
