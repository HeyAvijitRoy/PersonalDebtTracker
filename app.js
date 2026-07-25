// ====== UI ELEMENTS ======
const form = document.getElementById("debt-form");
const cardList = document.getElementById("card-list");
const avalancheList = document.getElementById("avalanche-list");
const snowballList = document.getElementById("snowball-list");
const expensiveList = document.getElementById("expensive-list");
const noCardsMessage = document.getElementById("no-cards-message");
const submitBtn = document.getElementById("submit-btn");
const totalDebtDisplay = document.getElementById("total-debt");
const totalCreditLineDisplay = document.getElementById("total-credit-line");
const totalMonthlyInterestDisplay = document.getElementById(
  "total-monthly-interest"
);
const totalYearlyInterestDisplay = document.getElementById(
  "total-yearly-interest"
);
const overallUtilBar = document.getElementById("overall-util-bar");
const overallUtilText = document.getElementById("overall-util-text");
const accountsMeta = document.getElementById("accounts-meta");
const accountSearchInput = document.getElementById("account-search");
const importCsvBtn = document.getElementById("import-csv-btn");
const importCsvInput = document.getElementById("import-csv-input");
const simBudgetInput = document.getElementById("sim-budget");
const simStrategySelect = document.getElementById("sim-strategy");
const simRunBtn = document.getElementById("sim-run");

// Auth / modal
const authSection = document.getElementById("auth-section");
const appLoading = document.getElementById("app-loading");
const mainApp = document.getElementById("main-app");
const googleSigninBtn = document.getElementById("google-signin-btn");
const signOutBtn = document.getElementById("sign-out-btn");
const userDisplay = document.getElementById("user-display");
const authStatus = document.getElementById("auth-status");
const messageModal = document.getElementById("message-modal");
const modalTitle = document.getElementById("modal-title");
const modalMessage = document.getElementById("modal-message");
const modalCloseBtn = document.getElementById("modal-close-btn");
const liveRegion = document.getElementById("live-region");
const themeToggleBtn = document.getElementById("theme-toggle");

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

// Restore saved sort/view preferences (if any) before reading initial state
try {
  const savedSortBy = localStorage.getItem("prefSortBy");
  const savedSortDir = localStorage.getItem("prefSortDir");
  const savedUtilView = localStorage.getItem("prefUtilView");
  if (savedSortBy && sortBySelect) sortBySelect.value = savedSortBy;
  if (savedSortDir && sortDirBtn) {
    sortDirBtn.dataset.dir = savedSortDir;
    sortDirBtn.textContent = savedSortDir === "asc" ? "Asc" : "Desc";
  }
  if (savedUtilView && utilViewSelect) utilViewSelect.value = savedUtilView;
} catch (e) {}

let sortBy = sortBySelect?.value || "name";
let sortDir = sortDirBtn?.dataset.dir || "desc";
let utilView = utilViewSelect?.value || "bar";
let editingId = null;
let firstSnapshotReceived = false;
let searchQuery = "";
window.__latestCards = [];

// ====== NAV HELPERS ======
window.focusAddForm = () => {
  const nameInput = document.getElementById("card-name");
  nameInput?.scrollIntoView({ behavior: "smooth", block: "center" });
  nameInput?.focus();
};

// ====== THEME ======
function setTheme(isDark) {
  document.documentElement.classList.toggle("dark", isDark);
  try {
    localStorage.setItem("theme", isDark ? "dark" : "light");
  } catch (e) {}
}
themeToggleBtn?.addEventListener("click", () => {
  setTheme(!document.documentElement.classList.contains("dark"));
});

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
let modalTriggerEl = null;

function trapModalTab(e) {
  if (e.key === "Escape") {
    e.preventDefault();
    closeModal();
    return;
  }
  if (e.key !== "Tab") return;
  const focusable = messageModal.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function showModal(title, message, triggerEl = document.activeElement) {
  if (!messageModal) return alert(`${title}\n\n${message}`);
  modalTriggerEl = triggerEl instanceof HTMLElement ? triggerEl : null;
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  messageModal.classList.remove("hidden");
  document.addEventListener("keydown", trapModalTab);
  modalCloseBtn?.focus();
}

function closeModal() {
  messageModal?.classList.add("hidden");
  document.removeEventListener("keydown", trapModalTab);
  if (modalTriggerEl && modalTriggerEl.isConnected) modalTriggerEl.focus();
  modalTriggerEl = null;
}
modalCloseBtn?.addEventListener("click", closeModal);
messageModal?.addEventListener("click", (e) => {
  if (e.target === messageModal) closeModal();
});

function announce(message) {
  if (!liveRegion) return;
  liveRegion.textContent = "";
  requestAnimationFrame(() => {
    liveRegion.textContent = message;
  });
}

function toast(message, duration = 1800) {
  announce(message);
  const t = document.createElement("div");
  t.className =
    "fixed bottom-4 right-4 z-[1100] bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg ring-1 ring-white/10 opacity-0 transition-opacity";
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
    "max-w-5xl mx-auto my-3 p-3 rounded border bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 text-amber-800 dark:text-amber-300";
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
        firstSnapshotReceived = false;
        authSection?.classList.add("hidden");
        mainApp?.classList.add("hidden");
        appLoading?.classList.remove("hidden");
        authStatus && (authStatus.textContent = "");
        setHeaderAuthUI(true, user.displayName);
        setupFirestoreListener(user.uid);
      } else {
        userId = null;
        authSection?.classList.remove("hidden");
        mainApp?.classList.add("hidden");
        appLoading?.classList.add("hidden");
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

      if (!firstSnapshotReceived) {
        firstSnapshotReceived = true;
        appLoading?.classList.add("hidden");
        mainApp?.classList.remove("hidden");
      }

      renderAll(window.__latestCards);
    },
    (error) => {
      console.error("[Firestore] onSnapshot error:", error);
      appLoading?.classList.add("hidden");
      mainApp?.classList.remove("hidden");
      showModal(
        "Sync error",
        "Lost connection to your data. Changes may not be up to date — try refreshing."
      );
    }
  );
}

// ====== HELPERS ======
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => USD.format(+n || 0);
const ESCAPE_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const escapeHtml = (str) => String(str ?? "").replace(/[&<>"']/g, (m) => ESCAPE_MAP[m]);
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
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">&gt;80% High</span>';
  if (util > 50)
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">&gt;50% Medium</span>';
  if (util > 30)
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300">&gt;30% Watch</span>';
  return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">Healthy</span>';
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

// Payoff schedule simulator
function simulatePayoff(cards, monthlyBudget, strategy) {
  const MAX_MONTHS = 600; // 50-year safety cap
  let working = cards
    .map((c) => ({ name: c.name, balance: +c.balance || 0, apr: +c.apr || 0 }))
    .filter((c) => c.balance > 0);

  if (!working.length) return { months: 0, totalInterest: 0, payoffOrder: [] };

  const budget = Math.max(0, +monthlyBudget || 0);
  let totalInterest = 0;
  let months = 0;
  const payoffOrder = [];

  while (working.length && months < MAX_MONTHS) {
    months++;
    for (const c of working) {
      const interest = monthlyInterest(c.balance, c.apr);
      c.balance += interest;
      totalInterest += interest;
    }
    const order =
      strategy === "snowball"
        ? [...working].sort((a, b) => a.balance - b.balance)
        : [...working].sort((a, b) => b.apr - a.apr);

    let remaining = budget;
    for (const c of order) {
      if (remaining <= 0) break;
      const pay = Math.min(remaining, c.balance);
      c.balance -= pay;
      remaining -= pay;
    }
    working = working.filter((c) => {
      if (c.balance <= 0.01) {
        payoffOrder.push({ name: c.name, month: months });
        return false;
      }
      return true;
    });
  }

  if (working.length) {
    return {
      error:
        "This budget isn't enough to pay off your balances within 50 years — try a higher monthly amount.",
      payoffOrder,
    };
  }
  return { months, totalInterest, payoffOrder };
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

// ====== VALIDATION ======
function validateCardInput({ name, balance, apr, creditLimit }) {
  const errors = {};
  if (!name) errors.name = "Enter an account name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  if (Number.isNaN(balance) || balance < 0)
    errors.balance = "Enter a balance of 0 or more.";
  if (Number.isNaN(apr) || apr < 0 || apr > 99.99)
    errors.apr = "Enter an APR between 0 and 99.99.";
  if (Number.isNaN(creditLimit) || creditLimit < 0)
    errors.creditLimit = "Enter a credit limit of 0 or more.";
  return errors;
}

const INVALID_INPUT_CLASSES = ["border-rose-500", "dark:border-rose-500", "focus:ring-rose-500"];

function applyFieldErrors(errors, fieldMap) {
  let firstInvalid = null;
  for (const key of Object.keys(fieldMap)) {
    const input = fieldMap[key].input();
    const errorEl = fieldMap[key].error();
    if (!input) continue;
    const message = errors[key];
    if (message) {
      if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove("hidden");
      }
      input.classList.add(...INVALID_INPUT_CLASSES);
      input.setAttribute("aria-invalid", "true");
      if (!firstInvalid) firstInvalid = input;
    } else {
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.classList.add("hidden");
      }
      input.classList.remove(...INVALID_INPUT_CLASSES);
      input.removeAttribute("aria-invalid");
    }
  }
  return firstInvalid;
}

const TOP_FORM_FIELD_MAP = {
  name: {
    input: () => document.getElementById("card-name"),
    error: () => document.getElementById("err-card-name"),
  },
  balance: {
    input: () => document.getElementById("balance"),
    error: () => document.getElementById("err-balance"),
  },
  apr: {
    input: () => document.getElementById("apr"),
    error: () => document.getElementById("err-apr"),
  },
  creditLimit: {
    input: () => document.getElementById("limit"),
    error: () => document.getElementById("err-limit"),
  },
};

["card-name", "balance", "apr", "limit"].forEach((id) => {
  const key = id === "card-name" ? "name" : id === "limit" ? "creditLimit" : id;
  document.getElementById(id)?.addEventListener("input", () => {
    const input = TOP_FORM_FIELD_MAP[key].input();
    const errorEl = TOP_FORM_FIELD_MAP[key].error();
    if (!errorEl || errorEl.classList.contains("hidden")) return;
    errorEl.classList.add("hidden");
    input.classList.remove(...INVALID_INPUT_CLASSES);
    input.removeAttribute("aria-invalid");
  });
});

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
  if (totalYearlyInterestDisplay)
    totalYearlyInterestDisplay.textContent = fmtMoney(monthly * 12);
  if (overallUtilBar) {
    const pct = Math.max(0, Math.min(100, util));
    overallUtilBar.style.width = `${pct}%`;
    overallUtilBar.className =
      "h-2.5 rounded-full transition-all " +
      (pct <= 30 ? "bg-emerald-500" : pct <= 50 ? "bg-amber-500" : "bg-rose-500");
  }
  if (overallUtilText) overallUtilText.textContent = `${util.toFixed(1)}%`;
  if (accountsMeta)
    accountsMeta.textContent = cards.length
      ? `Accounts: ${cards.length}`
      : "";

  cardList.innerHTML = "";
  if (!cards.length) {
    if (noCardsMessage) {
      noCardsMessage.classList.remove("hidden");
      noCardsMessage.textContent = "No accounts added yet. Click to add your first account.";
    }
    return;
  }

  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? cards.filter((c) => (c.name || "").toLowerCase().includes(query))
    : cards;

  if (!filtered.length) {
    if (noCardsMessage) {
      noCardsMessage.classList.remove("hidden");
      noCardsMessage.textContent = `No accounts match “${searchQuery.trim()}”. Click to add a new account.`;
    }
    return;
  }
  if (noCardsMessage) noCardsMessage.classList.add("hidden");

  const sorted = sortCardsGeneric(filtered);
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
    el.className =
      "debt-card group bg-white dark:bg-gray-900 p-4 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 hover:shadow-md transition-shadow";

    if (!isEditing) {
      el.innerHTML = `
        <div class="flex items-start justify-between">
          <div class="min-w-0">
            <h3 class="name-fit text-base font-semibold text-gray-900 dark:text-gray-100" title="${escapeHtml(card.name)}">
              ${escapeHtml(card.name)}
            </h3>
            <div class="mt-1">${riskBadge(utilization)}</div>
            <div class="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
              <p>Balance: <span class="font-semibold text-gray-900 dark:text-gray-100">${fmtMoney(
                balance
              )}</span></p>
              <p>APR:
                <span class="font-semibold text-gray-900 dark:text-gray-100">${apr.toFixed(
                  2
                )}%</span>
                ${
                  apr <= 0.01
                    ? '<span class="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">0% APR</span>'
                    : ""
                }
              </p>
              <p>Limit: <span class="font-semibold text-gray-900 dark:text-gray-100">${fmtMoney(
                creditLimit
              )}</span></p>
              <p>Monthly Interest: <span class="font-semibold text-gray-900 dark:text-gray-100">${fmtMoney(
                monthlyInt
              )}</span></p>
            </div>
            <div class="mt-2 flex items-center gap-2">
              <span class="text-xs text-gray-500 dark:text-gray-400">Quick pay:</span>
              <button
                class="nudge-btn text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                data-id="${card.id}" data-delta="-50" ${balance <= 0 ? "disabled" : ""} aria-label="Decrease balance by $50"
              >−$50</button>
              <button
                class="nudge-btn text-xs px-2 py-1 rounded-md border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                data-id="${card.id}" data-delta="50" aria-label="Increase balance by $50"
              >+$50</button>
            </div>
          </div>
          <div class="flex gap-2 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-opacity">
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
            <p class="text-sm text-gray-700 dark:text-gray-300">Utilization: <span class="font-semibold">${utilization.toFixed(
              1
            )}%</span></p>
            <p class="text-xs text-gray-400 dark:text-gray-500">View: ${utilView.toUpperCase()}</p>
          </div>

          ${
            utilView === "pie"
              ? donut(utilization)
              : `
            <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
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
          <div class="min-w-0 flex-1">
            <h3 class="name-fit text-base font-semibold text-gray-900 dark:text-gray-100" title="${escapeHtml(card.name)}">
              ${escapeHtml(card.name)}
            </h3>
            <div class="mt-1"><span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300">Editing</span></div>
            <div class="mt-3 space-y-3 text-sm">
              <label class="block">
                <span class="text-gray-600 dark:text-gray-400">Balance ($)</span>
                <input data-field="balance" type="number" inputmode="decimal" step="0.01" min="0" value="${balance}"
                       class="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <p class="field-error hidden text-xs text-rose-600 dark:text-rose-400 mt-1" data-error-for="balance"></p>
              </label>
              <label class="block">
                <span class="text-gray-600 dark:text-gray-400">APR (%)</span>
                <input data-field="apr" type="number" inputmode="decimal" step="0.01" min="0" max="99.99" value="${apr}"
                       class="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <p class="field-error hidden text-xs text-rose-600 dark:text-rose-400 mt-1" data-error-for="apr"></p>
              </label>
              <label class="block">
                <span class="text-gray-600 dark:text-gray-400">Limit ($)</span>
                <input data-field="creditLimit" type="number" inputmode="decimal" step="0.01" min="0" value="${creditLimit}"
                       class="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <p class="field-error hidden text-xs text-rose-600 dark:text-rose-400 mt-1" data-error-for="creditLimit"></p>
              </label>
              <label class="block">
                <span class="text-gray-600 dark:text-gray-400">Name</span>
                <input data-field="name" type="text" value="${escapeHtml(card.name)}"
                       class="w-full mt-1 px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-2 focus:ring-sky-500"/>
                <p class="field-error hidden text-xs text-rose-600 dark:text-rose-400 mt-1" data-error-for="name"></p>
              </label>
            </div>
          </div>
          <div class="flex gap-2 shrink-0">
            <button class="save-inline-btn px-3 py-1.5 text-xs bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors focus-visible:ring-2 focus-visible:ring-emerald-500" data-id="${
              card.id
            }">Save</button>
            <button class="cancel-inline-btn px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors focus-visible:ring-2 focus-visible:ring-gray-400" data-id="${
              card.id
            }">Cancel</button>
          </div>
        </div>
        <div class="mt-3 text-xs text-gray-500 dark:text-gray-400">
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
  const isDark = document.documentElement.classList.contains("dark");
  const trackColor = isDark ? "#374151" : "#e5e7eb";
  return `
    <div class="flex items-center gap-3">
      <svg width="56" height="56" viewBox="0 0 48 48" role="img" aria-label="Utilization: ${pct.toFixed(1)}%">
        <circle cx="24" cy="24" r="${r}" stroke="${trackColor}" stroke-width="6" fill="none"/>
        <circle cx="24" cy="24" r="${r}" stroke="${color}" stroke-width="6" fill="none"
                stroke-dasharray="${filled} ${remaining}" transform="rotate(-90 24 24)"/>
      </svg>
      <span class="text-sm text-gray-700 dark:text-gray-300">${pct.toFixed(1)}%</span>
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
      '<button type="button" onclick="focusAddForm()" class="text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">Add accounts to see the payoff plan.</button>';
    return;
  }
  sorted.forEach((card, idx) => {
    const el = document.createElement("div");
    el.className =
      "p-3 bg-white dark:bg-gray-900 rounded-md shadow-sm border border-gray-200 dark:border-gray-800";
    el.innerHTML = `
      <div class="flex items-start gap-2">
        <span class="text-lg font-bold text-gray-600 dark:text-gray-400 w-6 shrink-0">${idx + 1}.</span>
        <div class="min-w-0 flex-1">
          <p class="font-medium text-gray-900 dark:text-gray-100 break-words leading-snug">${escapeHtml(card.name)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Bal ${fmtMoney(
            +card.balance || 0
          )} • APR ${(+card.apr || 0).toFixed(
      2
    )}% • Util ${computeCardUtilization(card).toFixed(0)}%</p>
        </div>
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
      '<button type="button" onclick="focusAddForm()" class="text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">Add accounts to see per-$100 cost ranking.</button>';
    return;
  }
  ranked.slice(0, 6).forEach((r, i) => {
    const row = document.createElement("div");
    row.className =
      "p-3 bg-white dark:bg-gray-900 rounded-md shadow-sm border border-gray-200 dark:border-gray-800 flex items-start justify-between gap-3";
    row.innerHTML = `
      <div class="flex items-start min-w-0">
        <span class="text-lg font-bold text-gray-600 dark:text-gray-400 w-6 shrink-0">${i + 1}.</span>
        <div class="ml-2 min-w-0">
          <p class="font-medium text-gray-900 dark:text-gray-100 break-words leading-snug">${escapeHtml(r.name)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">APR ${r.apr.toFixed(
            2
          )}% • Balance ${fmtMoney(r.balance)}</p>
        </div>
      </div>
      <span class="text-sm font-semibold text-rose-700 dark:text-rose-400 shrink-0">${fmtMoney(
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
      '<button type="button" onclick="focusAddForm()" class="text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">Add accounts to see utilization thresholds and “nudge” amounts.</button>';
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

  const thresholdTile = (label, count, minToTame) => {
    const theme = count
      ? "bg-rose-50 dark:bg-rose-950/30 border-rose-100 dark:border-rose-900 text-rose-700 dark:text-rose-400"
      : "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400";
    return `
      <div class="rounded-lg p-3 border ${theme}">
        <p class="text-xs uppercase tracking-wide opacity-80">Cards ${label}</p>
        <p class="text-xl font-bold">${count}</p>
        ${
          count
            ? `<p class="text-xs mt-1 opacity-90">Min to tame: ${fmtMoney(minToTame)}</p>`
            : `<p class="text-xs mt-1 opacity-90">All clear</p>`
        }
      </div>
    `;
  };

  const summary = document.createElement("div");
  summary.className =
    "p-3 bg-white dark:bg-gray-900 rounded-md shadow-sm border border-gray-200 dark:border-gray-800";
  summary.innerHTML = `
    <div class="flex items-center justify-between mb-3">
      <span class="text-sm text-gray-600 dark:text-gray-400">Overall Utilization</span>
      <span class="text-lg font-bold text-gray-900 dark:text-gray-100">${util.toFixed(1)}%</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      ${thresholdTile("&gt;80%", over80, sumTo80)}
      ${thresholdTile("&gt;50%", over50, sumTo50)}
      ${thresholdTile("&gt;30%", over30, sumTo30)}
    </div>
    <div class="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
      <span>To reach 50% overall: <span class="font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(
        to50Overall
      )}</span></span>
      <span>To reach 30% overall: <span class="font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(
        to30Overall
      )}</span></span>
    </div>
  `;
  box.appendChild(summary);

  if (nudges.length) {
    const list = document.createElement("div");
    list.className = "mt-3 space-y-2";
    const title = document.createElement("p");
    title.className = "font-medium";
    title.textContent = "Cheapest “threshold nudges” (FICO optics):";
    list.appendChild(title);

    nudges.slice(0, 8).forEach((n) => {
      const row = document.createElement("div");
      row.className =
        "flex items-start justify-between gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900";
      row.innerHTML = `
        <div class="min-w-0">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100 break-words leading-snug">${escapeHtml(n.name)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${n.currentUtil.toFixed(1)}% → ${n.nextThreshold}%</p>
        </div>
        <span class="text-sm font-semibold text-sky-700 dark:text-sky-400 shrink-0">Pay ${fmtMoney(n.dollarsToDrop)}</span>
      `;
      list.appendChild(row);
    });
    box.appendChild(list);
  } else {
    const ok = document.createElement("p");
    ok.className = "text-sm text-emerald-700 dark:text-emerald-400 mt-2";
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

// ====== CSV IMPORT ======
function parseCsvLine(line) {
  const values = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      values.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  values.push(cur);
  return values;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return { rows: [], errors: ["File is empty."] };
  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const colIndex = {
    name: header.indexOf("name"),
    balance: header.indexOf("balance"),
    apr: header.indexOf("apr"),
    creditLimit: header.indexOf("creditlimit"),
  };
  const missing = Object.keys(colIndex).filter((k) => colIndex[k] === -1);
  if (missing.length) {
    return {
      rows: [],
      errors: [`Missing required column(s): ${missing.join(", ")}.`],
    };
  }

  const rows = [];
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const name = (values[colIndex.name] || "").trim();
    const balance = parseFloat(values[colIndex.balance]);
    const apr = parseFloat(values[colIndex.apr]);
    const creditLimit = parseFloat(values[colIndex.creditLimit]);
    const fieldErrors = validateCardInput({ name, balance, apr, creditLimit });
    if (Object.keys(fieldErrors).length) {
      errors.push(`Row ${i + 1}: ${Object.values(fieldErrors).join(" ")}`);
      continue;
    }
    rows.push({ name, balance, apr, creditLimit });
  }
  return { rows, errors };
}

importCsvBtn?.addEventListener("click", () => importCsvInput?.click());
importCsvInput?.addEventListener("change", async () => {
  const file = importCsvInput.files?.[0];
  importCsvInput.value = "";
  if (!file) return;
  if (!userId) {
    showModal("Authentication", "Please sign in to import accounts.");
    return;
  }

  const text = await file.text();
  const { rows, errors } = parseCsv(text);

  if (!rows.length) {
    showModal(
      "Import failed",
      errors.length
        ? `No valid rows found.\n${errors.slice(0, 5).join("\n")}`
        : "No valid rows found in the file."
    );
    return;
  }

  const cardsCollection = collection(
    db,
    `artifacts/${appId}/users/${userId}/cards`
  );
  let imported = 0;
  for (const row of rows) {
    try {
      await setDoc(doc(cardsCollection), row);
      imported++;
    } catch (err) {
      console.error("[Import] Row failed:", err);
    }
  }

  const skipped = errors.length;
  toast(
    `Imported ${imported} account${imported === 1 ? "" : "s"}` +
      (skipped ? ` • ${skipped} skipped` : "")
  );
  if (skipped) {
    showModal(
      "Import finished with issues",
      `Imported ${imported} account(s). Skipped ${skipped} invalid row(s):\n${errors
        .slice(0, 8)
        .join("\n")}`
    );
  }
});

// ====== EVENTS ======

// Add account (top form)
form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("card-name").value.trim();
  const balance = parseFloat(document.getElementById("balance").value);
  const apr = parseFloat(document.getElementById("apr").value);
  const creditLimit = parseFloat(document.getElementById("limit").value);

  const errors = validateCardInput({ name, balance, apr, creditLimit });
  const firstInvalid = applyFieldErrors(errors, TOP_FORM_FIELD_MAP);
  if (firstInvalid) {
    firstInvalid.focus();
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
  const prevText = submitBtn.textContent;
  try {
    submitBtn.disabled = true;
    submitBtn.textContent = "Adding…";
    await setDoc(doc(cardsCollection), { name, balance, apr, creditLimit });
    toast("Account added");
    form.reset();
    applyFieldErrors({}, TOP_FORM_FIELD_MAP);
  } catch (err) {
    console.error("[Save] Add failed:", err);
    showModal("Error", "Could not save the account.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = prevText;
  }
});

// Inline edit + delete (with Undo)
cardList?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".inline-edit-btn");
  const cancelBtn = e.target.closest(".cancel-inline-btn");
  const saveBtn = e.target.closest(".save-inline-btn");
  const deleteBtn = e.target.closest(".delete-btn");
  const nudgeBtn = e.target.closest(".nudge-btn");

  if (nudgeBtn) {
    if (!userId) {
      showModal("Authentication", "Please sign in to update accounts.");
      return;
    }
    const id = nudgeBtn.dataset.id;
    const delta = +nudgeBtn.dataset.delta || 0;
    const card = window.__latestCards.find((c) => c.id === id);
    if (!card) return;
    const newBalance = Math.max(0, (+card.balance || 0) + delta);

    const cardsCollection = collection(
      db,
      `artifacts/${appId}/users/${userId}/cards`
    );
    nudgeBtn.disabled = true;
    try {
      await setDoc(
        doc(cardsCollection, id),
        { name: card.name, balance: newBalance, apr: card.apr, creditLimit: card.creditLimit }
      );
      card.balance = newBalance;
      toast(delta < 0 ? "Balance decreased by $50" : "Balance increased by $50");
      renderCards(window.__latestCards);
    } catch (err) {
      console.error("[Nudge] Update failed:", err);
      showModal("Error", "Could not update the balance. Please try again.");
      nudgeBtn.disabled = false;
    }
    return;
  }

  if (editBtn) {
    editingId = editBtn.dataset.id;
    renderCards(window.__latestCards);
    cardList
      .querySelector(`.save-inline-btn[data-id="${editingId}"]`)
      ?.closest(".debt-card")
      ?.querySelector("input[data-field]")
      ?.focus();
    return;
  }
  if (cancelBtn) {
    editingId = null;
    renderCards(window.__latestCards);
    return;
  }
  if (saveBtn) {
    const id = saveBtn.dataset.id;
    const cardEl = saveBtn.closest(".debt-card");
    if (!cardEl) return;

    const getVal = (sel) => {
      const inp = cardEl.querySelector(`input[data-field="${sel}"]`);
      return inp ? inp.value : null;
    };
    const name = (getVal("name") || "").trim();
    const balance = parseFloat(getVal("balance"));
    const apr = parseFloat(getVal("apr"));
    const creditLimit = parseFloat(getVal("creditLimit"));

    const errors = validateCardInput({ name, balance, apr, creditLimit });
    const inlineFieldMap = {
      name: {
        input: () => cardEl.querySelector('input[data-field="name"]'),
        error: () => cardEl.querySelector('[data-error-for="name"]'),
      },
      balance: {
        input: () => cardEl.querySelector('input[data-field="balance"]'),
        error: () => cardEl.querySelector('[data-error-for="balance"]'),
      },
      apr: {
        input: () => cardEl.querySelector('input[data-field="apr"]'),
        error: () => cardEl.querySelector('[data-error-for="apr"]'),
      },
      creditLimit: {
        input: () => cardEl.querySelector('input[data-field="creditLimit"]'),
        error: () => cardEl.querySelector('[data-error-for="creditLimit"]'),
      },
    };
    const firstInvalid = applyFieldErrors(errors, inlineFieldMap);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }
    if (!userId) {
      showModal("Authentication", "Please sign in to edit accounts.");
      return;
    }

    const updated = { name, balance, apr, creditLimit };
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
      announce("Account deleted. Undo available.");
      let undone = false;

      const undoEl = document.createElement("div");
      undoEl.className =
        "fixed bottom-4 right-4 z-[1100] bg-gray-900 text-white text-sm px-3 py-2 rounded-lg shadow-lg ring-1 ring-white/10 flex items-center gap-3";
      undoEl.innerHTML = `<span>Account deleted</span>
        <button class="px-2 py-1 bg-white text-gray-900 rounded hover:bg-gray-100 text-xs font-medium" id="undo-delete">Undo</button>`;
      document.body.appendChild(undoEl);

      const timer = setTimeout(() => {
        if (undoEl.isConnected) undoEl.remove();
      }, 8000);

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
  const editingCard = e.target.closest(".debt-card");
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
  try {
    localStorage.setItem("prefSortBy", sortBy);
  } catch (e) {}
  renderCards(window.__latestCards);
});
sortDirBtn?.addEventListener("click", () => {
  sortDir = sortDirBtn.dataset.dir === "asc" ? "desc" : "asc";
  sortDirBtn.dataset.dir = sortDir;
  sortDirBtn.textContent = sortDir === "asc" ? "Asc" : "Desc";
  try {
    localStorage.setItem("prefSortDir", sortDir);
  } catch (e) {}
  renderCards(window.__latestCards);
});
utilViewSelect?.addEventListener("change", () => {
  utilView = utilViewSelect.value;
  try {
    localStorage.setItem("prefUtilView", utilView);
  } catch (e) {}
  renderCards(window.__latestCards);
});
accountSearchInput?.addEventListener("input", () => {
  searchQuery = accountSearchInput.value.trim();
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
    if (noCardsMessage) {
      noCardsMessage.classList.remove("hidden");
      noCardsMessage.textContent = "No accounts added yet. Click to add your first account.";
    }
    cardList && (cardList.innerHTML = "");
    totalDebtDisplay && (totalDebtDisplay.textContent = `$0.00`);
    totalCreditLineDisplay && (totalCreditLineDisplay.textContent = `$0.00`);
    totalMonthlyInterestDisplay &&
      (totalMonthlyInterestDisplay.textContent = `$0.00`);
    accountsMeta && (accountsMeta.textContent = "");
    form?.reset();
    applyFieldErrors({}, TOP_FORM_FIELD_MAP);
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
    out.innerHTML = `<p class="text-rose-600 dark:text-rose-400">${escapeHtml(result.error)}</p>`;
    return;
  }

  const hdr = document.createElement("div");
  hdr.className =
    "p-3 bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800";
  hdr.innerHTML = `
    <p class="font-medium">Target: ${escapeHtml(result.target)}${
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
      result.netIntroSavings >= 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-rose-700 dark:text-rose-400"
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
      row.className =
        "text-sm p-2 bg-white dark:bg-gray-900 rounded border border-gray-200 dark:border-gray-800";
      row.innerHTML = `
        <span class="font-medium">${i + 1}.</span> Move ${fmtMoney(
        m.amount
      )} from <span class="font-semibold">${escapeHtml(m.from)}</span>
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
      '<p class="text-gray-600 dark:text-gray-400 mt-2">No eligible moves found.</p>';
  }
});

// Payoff simulator: Run
simRunBtn?.addEventListener("click", () => {
  const out = document.getElementById("sim-output");
  if (!out) return;

  if (!window.__latestCards.length) {
    showModal("No Data", "Please add accounts first.");
    return;
  }
  const budget = +simBudgetInput?.value || 0;
  if (budget <= 0) {
    showModal("Missing Budget", "Enter a monthly payment budget greater than $0.");
    return;
  }
  const strategy = simStrategySelect?.value || "avalanche";
  const result = simulatePayoff(window.__latestCards, budget, strategy);
  out.innerHTML = "";

  if (result.error) {
    out.innerHTML = `<p class="text-rose-600 dark:text-rose-400">${escapeHtml(result.error)}</p>`;
    return;
  }

  const years = Math.floor(result.months / 12);
  const remMonths = result.months % 12;
  const durationText = [
    years ? `${years} year${years === 1 ? "" : "s"}` : null,
    remMonths ? `${remMonths} month${remMonths === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" ") || "0 months";

  const payoffDate = new Date();
  payoffDate.setMonth(payoffDate.getMonth() + result.months);
  const payoffDateText = payoffDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const hdr = document.createElement("div");
  hdr.className =
    "p-3 bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800";
  hdr.innerHTML = `
    <p>Debt-free in: <span class="font-semibold">${durationText}</span> <span class="text-xs text-gray-500 dark:text-gray-400">(~${payoffDateText})</span></p>
    <p>Total Interest Paid: <span class="font-semibold text-rose-700 dark:text-rose-400">${fmtMoney(
      result.totalInterest
    )}</span></p>
  `;
  out.appendChild(hdr);

  if (result.payoffOrder.length) {
    const list = document.createElement("div");
    list.className = "mt-3 space-y-2";
    const title = document.createElement("p");
    title.className = "font-medium";
    title.textContent = "Payoff order:";
    list.appendChild(title);

    result.payoffOrder.forEach((p, i) => {
      const row = document.createElement("div");
      row.className =
        "flex items-center justify-between gap-3 p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm";
      row.innerHTML = `
        <span class="min-w-0 break-words"><span class="font-medium">${i + 1}.</span> ${escapeHtml(p.name)}</span>
        <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">Month ${p.month}</span>
      `;
      list.appendChild(row);
    });
    out.appendChild(list);
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
      '<p class="text-gray-500 dark:text-gray-400">Enter details and click “Recommend Transfer”.</p>';
  toast("Optimizer reset");
});

// ====== SCROLLSPY (highlight nav link for section in view) ======
const NAV_ACTIVE_CLASSES = [
  "bg-sky-50",
  "dark:bg-sky-950/50",
  "border-sky-300",
  "dark:border-sky-700",
  "text-sky-700",
  "dark:text-sky-300",
  "font-semibold",
];
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const navSections = navLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

function setActiveNav(id) {
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${id}`;
    NAV_ACTIVE_CLASSES.forEach((c) => link.classList.toggle(c, isActive));
  });
}

if (navSections.length && "IntersectionObserver" in window) {
  const spy = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveNav(visible.target.id);
    },
    { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
  navSections.forEach((sec) => spy.observe(sec));
}

// PWA SW registration (enables offline app-shell caching)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  });
}

// ====== FOOTER ======
const footerYear = document.getElementById("footer-year");
if (footerYear) footerYear.textContent = new Date().getFullYear();

// ====== BOOT ======
initFirebase();
