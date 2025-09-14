// app.js
// === UI ELEMENTS ===
const form = document.getElementById('debt-form');
const cardList = document.getElementById('card-list');
const avalancheList = document.getElementById('avalanche-list');
const snowballList = document.getElementById('snowball-list');
const noCardsMessage = document.getElementById('no-cards-message');
const cardIdInput = document.getElementById('card-id');
const submitBtn = document.getElementById('submit-btn');
const totalDebtDisplay = document.getElementById('total-debt');
const totalCreditLineDisplay = document.getElementById('total-credit-line');
const totalMonthlyInterestDisplay = document.getElementById('total-monthly-interest');
const authSection = document.getElementById('auth-section');
const mainApp = document.getElementById('main-app');
const googleSigninBtn = document.getElementById('google-signin-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const userDisplay = document.getElementById('user-display');
const authStatus = document.getElementById('auth-status');
const messageModal = document.getElementById('message-modal');
const modalTitle = document.getElementById('modal-title');
const modalMessage = document.getElementById('modal-message');
const modalCloseBtn = document.getElementById('modal-close-btn');

// Balance transfer panel
const btRunBtn = document.getElementById('bt-run');

// global runtime state
let db, auth, userId;
let unsubscribe;
window.__latestCards = []; // keep last snapshot in-memory for tools

function showModal(title, message) {
  modalTitle.textContent = title;
  modalMessage.textContent = message;
  messageModal.classList.remove('hidden');
}
modalCloseBtn.addEventListener('click', () => { messageModal.classList.add('hidden'); });

// === FIREBASE ===
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// IMPORTANT: Replace this with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDa7J_8oOotlrwgk89fDjeMRqgdRJTlYbw",
  authDomain: "personal-debt-tracker.firebaseapp.com",
  projectId: "personal-debt-tracker",
  storageBucket: "personal-debt-tracker.firebasestorage.app",
  messagingSenderId: "515503975013",
  appId: "1:515503975013:web:39923cdaa9d17f10fc748c",
  measurementId: "G-W2L4VJ395L"
};

// Use a static app ID for path consistency
const appId = firebaseConfig.projectId;

function initFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, (user) => {
      if (user) {
        userId = user.uid;
        authSection.classList.add('hidden');
        mainApp.classList.remove('hidden');
        userDisplay.textContent = `Signed in as: ${user.displayName || 'Guest'}`;
        authStatus.textContent = '';
        setupFirestoreListener(user.uid);
      } else {
        userId = null;
        authSection.classList.remove('hidden');
        mainApp.classList.add('hidden');
      }
    });
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
    authStatus.textContent = 'Failed to initialize Firebase. Check your configuration.';
  }
}

function setupFirestoreListener(uid) {
  if (unsubscribe) unsubscribe();
  const cardsCollection = collection(db, `artifacts/${appId}/users/${uid}/cards`);
  unsubscribe = onSnapshot(cardsCollection, (snapshot) => {
    const fetchedCards = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    window.__latestCards = fetchedCards.map(x => ({ ...x })); // cache
    renderAll(fetchedCards);
  }, (error) => {
    console.error("Error listening to Firestore changes:", error);
  });
}

// === RENDER CORE ===
function renderAll(cards) {
  renderCards(cards);
  renderStrategy(cards, 'avalanche');
  renderStrategy(cards, 'snowball');
  renderFicoHints(cards); // NEW
}

function renderCards(cards) {
  cardList.innerHTML = '';
  let totalMonthlyInterest = 0, totalDebt = 0, totalCreditLine = 0;

  if (!cards.length) {
    noCardsMessage.style.display = 'block';
  } else {
    noCardsMessage.style.display = 'none';
    cards.forEach(card => {
      const balance = parseFloat(card.balance);
      const apr = parseFloat(card.apr);
      const creditLimit = parseFloat(card.creditLimit);
      totalDebt += balance;
      totalCreditLine += creditLimit;
      const monthlyInterest = (balance * (apr / 100)) / 12;
      totalMonthlyInterest += monthlyInterest;
      const utilization = creditLimit > 0 ? (balance / creditLimit) * 100 : 0;

      let utilizationColor = 'bg-red-500';
      if (utilization <= 30) utilizationColor = 'bg-green-500';
      else if (utilization <= 50) utilizationColor = 'bg-yellow-500';

      const el = document.createElement('div');
      el.className = 'bg-white p-4 rounded-lg shadow-md transition-transform transform hover:scale-[1.01]';
      el.innerHTML = `
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 class="font-medium text-gray-900">${card.name}</h3>
            <p class="text-sm text-gray-500">Balance: $<span class="font-semibold">${balance.toFixed(2)}</span></p>
            <p class="text-sm text-gray-500">APR: <span class="font-semibold">${apr.toFixed(2)}%</span></p>
            <p class="text-sm text-gray-500">Monthly Interest: $<span class="font-semibold">${isNaN(monthlyInterest) ? '0.00' : monthlyInterest.toFixed(2)}</span></p>
          </div>
          <div class="flex space-x-2">
            <button class="edit-btn px-3 py-1 text-sm bg-yellow-400 text-gray-800 rounded-lg hover:bg-yellow-500 transition-colors" data-id="${card.id}">Edit</button>
            <button class="delete-btn px-3 py-1 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors" data-id="${card.id}">Delete</button>
          </div>
        </div>
        <div class="mt-2">
          <p class="text-sm text-gray-700">Utilization: <span class="font-semibold">${utilization.toFixed(1)}%</span></p>
          <div class="w-full bg-gray-200 rounded-full h-2.5 mt-1">
            <div class="${utilizationColor} h-2.5 rounded-full" style="width: ${Math.min(100, utilization)}%;"></div>
          </div>
        </div>
      `;
      cardList.appendChild(el);
    });
  }

  totalDebtDisplay.textContent = `$${totalDebt.toFixed(2)}`;
  totalCreditLineDisplay.textContent = `$${totalCreditLine.toFixed(2)}`;
  totalMonthlyInterestDisplay.textContent = `$${totalMonthlyInterest.toFixed(2)}`;
}

function renderStrategy(cards, strategy) {
  const target = strategy === 'avalanche' ? avalancheList : snowballList;
  const sorted = sortCards(cards, strategy);
  target.innerHTML = '';
  if (!cards.length) {
    target.innerHTML = '<p class="text-gray-500">Add accounts to see the payoff plan.</p>';
    return;
  }
  sorted.forEach((card, idx) => {
    const el = document.createElement('div');
    el.className = 'p-3 bg-white rounded-md shadow-sm border border-gray-200';
    el.innerHTML = `
      <div class="flex items-center">
        <span class="text-lg font-bold text-gray-600 w-6">${idx + 1}.</span>
        <div class="ml-2">
          <span class="font-medium text-gray-900">${card.name}</span>
          <p class="text-xs text-gray-500">Balance: $${(+card.balance).toFixed(2)} • APR: ${(+card.apr).toFixed(2)}%</p>
        </div>
      </div>
    `;
    target.appendChild(el);
  });
}

function sortCards(cards, strategy) {
  if (strategy === 'avalanche') return [...cards].sort((a, b) => parseFloat(b.apr) - parseFloat(a.apr));
  if (strategy === 'snowball')  return [...cards].sort((a, b) => parseFloat(a.balance) - parseFloat(b.balance));
  return [];
}

// === NEW: ANALYST UTILITIES ===
function monthlyInterest(balance, aprPct) {
  if (!balance || !aprPct) return 0;
  return (balance * (aprPct / 100)) / 12;
}

function interestPer100(_balance, aprPct) {
  if (!aprPct) return 0;
  return monthlyInterest(100, aprPct);
}

function computeTotals(cards) {
  let totalDebt = 0, totalLimit = 0, totalMonthly = 0;
  for (const c of cards) {
    const bal = +c.balance || 0, lim = +c.creditLimit || 0, apr = +c.apr || 0;
    totalDebt += bal; totalLimit += lim; totalMonthly += monthlyInterest(bal, apr);
  }
  const overallUtil = totalLimit > 0 ? (totalDebt / totalLimit) * 100 : 0;
  return { totalDebt, totalLimit, totalMonthly, overallUtil };
}

function computeFicoHints(cards) {
  const thresholds = [80, 50, 30];
  let over80 = 0, over50 = 0, over30 = 0;
  const nudges = [];

  for (const c of cards) {
    const bal = +c.balance || 0, lim = +c.creditLimit || 0;
    if (!lim || bal <= 0) continue;
    const util = (bal / lim) * 100;
    if (util > 80) over80++;
    if (util > 50) over50++;
    if (util > 30) over30++;

    const next = thresholds.find(t => util > t);
    if (next !== undefined) {
      const targetBal = (next / 100) * lim;
      const dollarsToDrop = Math.max(0, bal - targetBal);
      if (dollarsToDrop > 0.01) nudges.push({ name: c.name, currentUtil: util, nextThreshold: next, dollarsToDrop });
    }
  }
  nudges.sort((a, b) => a.dollarsToDrop - b.dollarsToDrop);
  return { over80, over50, over30, nudges };
}

function rankByInterestPer100(cards) {
  return cards
    .filter(c => (+c.balance || 0) > 0)
    .map(c => ({ name: c.name, balance: +c.balance || 0, apr: +c.apr || 0, per100: interestPer100(+c.balance || 0, +c.apr || 0) }))
    .sort((a, b) => b.per100 - a.per100);
}

function planBalanceTransfer(cards, targetName, rawLimit, feePct, months, capPct) {
  const limit = Math.max(0, +rawLimit || 0);
  const fee = Math.max(0, (+feePct || 0) / 100);
  const introMonths = Math.max(0, +months || 0);
  const cap = capPct ? Math.max(0, Math.min(100, +capPct)) : null;

  const target = cards.find(c => (c.name || '').trim().toLowerCase() === (targetName || '').trim().toLowerCase());
  if (!target) return { error: 'Target 0% card not found by name.', moves: [] };

  const targetLimit = +target.creditLimit || 0;
  const targetBalance = +target.balance || 0;

  let maxRoomByLimit = Math.max(0, targetLimit - targetBalance);
  if (cap !== null && targetLimit > 0) {
    const capBal = (cap / 100) * targetLimit;
    const capRoom = Math.max(0, capBal - targetBalance);
    maxRoomByLimit = Math.min(maxRoomByLimit, capRoom);
  }
  const maxRoom = Math.min(limit, maxRoomByLimit);
  if (maxRoom <= 0.01) return { error: 'No available room on 0% card (limit/cap reached).', moves: [] };

  const ranked = rankByInterestPer100(cards)
    .filter(r => r.name.trim().toLowerCase() !== target.name.trim().toLowerCase());

  let remaining = maxRoom;
  const moves = [];
  for (const src of ranked) {
    if (remaining <= 0.01) break;
    const take = Math.min(remaining, src.balance);
    if (take <= 0.01) continue;

    const per100 = interestPer100(src.balance, src.apr);
    const estMonthlySaved = per100 * (take / 100);
    const estIntroSaved = estMonthlySaved * introMonths;
    const feeCost = take * fee;

    moves.push({ from: src.name, amount: take, apr: src.apr, estMonthlySaved, estIntroSaved, feeCost });
    remaining -= take;
  }

  const totalTransfer = moves.reduce((s, m) => s + m.amount, 0);
  const totalMonthlySaved = moves.reduce((s, m) => s + m.estMonthlySaved, 0);
  const totalIntroSaved = moves.reduce((s, m) => s + m.estIntroSaved, 0);
  const totalFees = moves.reduce((s, m) => s + m.feeCost, 0);
  const netIntroSavings = totalIntroSaved - totalFees;

  return { target: target.name, capApplied: cap !== null ? cap : null,
           totalTransfer, totalMonthlySaved, totalIntroSaved, totalFees, netIntroSavings, moves };
}

// === NEW: RENDERERS ===
function renderFicoHints(cards) {
  const box = document.getElementById('fico-hints');
  box.innerHTML = '';
  if (!cards.length) {
    box.innerHTML = '<p class="text-gray-500">Add accounts to see utilization thresholds and “nudge” amounts.</p>';
    return;
  }

  const { overallUtil } = computeTotals(cards);
  const { over80, over50, over30, nudges } = computeFicoHints(cards);

  const summary = document.createElement('div');
  summary.className = 'p-3 bg-white rounded-md shadow-sm border border-gray-200';
  summary.innerHTML = `
    <p><span class="font-medium">Overall Utilization:</span> ${overallUtil.toFixed(1)}%</p>
    <p class="mt-1">Cards >80%: <span class="font-semibold ${over80 ? 'text-red-600' : 'text-green-600'}">${over80}</span> •
       >50%: <span class="font-semibold ${over50 ? 'text-yellow-600' : 'text-green-600'}">${over50}</span> •
       >30%: <span class="font-semibold ${over30 ? 'text-yellow-600' : 'text-green-600'}">${over30}</span></p>
  `;
  box.appendChild(summary);

  if (nudges.length) {
    const list = document.createElement('div');
    list.className = 'mt-3 space-y-2';
    const title = document.createElement('p');
    title.className = 'font-medium';
    title.textContent = 'Cheapest “threshold nudges” (FICO optics):';
    list.appendChild(title);

    nudges.slice(0, 5).forEach(n => {
      const row = document.createElement('div');
      row.className = 'text-sm p-2 bg-white rounded border border-gray-200';
      row.textContent = `${n.name}: ${n.currentUtil.toFixed(1)}% → ${n.nextThreshold}%  •  Pay $${n.dollarsToDrop.toFixed(2)}`;
      list.appendChild(row);
    });
    box.appendChild(list);
  } else {
    const ok = document.createElement('p');
    ok.className = 'text-sm text-green-700 mt-2';
    ok.textContent = 'Nice! No cards above 30%, utilization profile looks healthy.';
    box.appendChild(ok);
  }

  const rank = rankByInterestPer100(cards);
  if (rank.length) {
    const snap = document.createElement('div');
    snap.className = 'mt-4';
    const title = document.createElement('p');
    title.className = 'font-medium';
    title.textContent = 'Most expensive balances (per $100, monthly):';
    snap.appendChild(title);

    rank.slice(0, 5).forEach(r => {
      const row = document.createElement('div');
      row.className = 'text-sm p-2 bg-white rounded border border-gray-200';
      row.textContent = `${r.name}: ~$${r.per100.toFixed(2)} per $100  •  APR ${r.apr.toFixed(2)}%  •  Bal $${r.balance.toFixed(2)}`;
      snap.appendChild(row);
    });
    box.appendChild(snap);
  }
}

// === EVENTS ===
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = cardIdInput.value;
  const name = document.getElementById('card-name').value;
  const balance = parseFloat(document.getElementById('balance').value);
  const apr = parseFloat(document.getElementById('apr').value);
  const creditLimit = parseFloat(document.getElementById('limit').value);

  if (isNaN(balance) || isNaN(apr) || isNaN(creditLimit)) {
    console.error("Please enter valid numbers for Balance, APR, and Credit Limit.");
    return;
  }
  if (!userId) { showModal("Authentication Error", "Please sign in to add accounts."); return; }

  const cardsCollection = collection(db, `artifacts/${appId}/users/${userId}/cards`);
  try {
    const data = { name, balance, apr, creditLimit };
    if (id) await setDoc(doc(cardsCollection, id), data);
    else    await setDoc(doc(cardsCollection), data);
  } catch (err) {
    console.error("Error adding/updating document:", err);
  }

  form.reset();
  cardIdInput.value = '';
  submitBtn.textContent = 'Add Account';
});

cardList.addEventListener('click', async (e) => {
  const id = e.target.dataset.id;
  if (e.target.classList.contains('delete-btn')) {
    if (!userId) { showModal("Authentication Error", "Please sign in to delete accounts."); return; }
    const cardsCollection = collection(db, `artifacts/${appId}/users/${userId}/cards`);
    try { await deleteDoc(doc(cardsCollection, id)); } catch (err) { console.error("Error removing document:", err); }
  } else if (e.target.classList.contains('edit-btn')) {
    if (!userId) { showModal("Authentication Error", "Please sign in to edit accounts."); return; }
    const cardsCollection = collection(db, `artifacts/${appId}/users/${userId}/cards`);
    try {
      const snap = await getDoc(doc(cardsCollection, id));
      if (snap.exists()) {
        const d = snap.data();
        document.getElementById('card-id').value = id;
        document.getElementById('card-name').value = d.name;
        document.getElementById('balance').value = d.balance;
        document.getElementById('apr').value = d.apr;
        document.getElementById('limit').value = d.creditLimit;
        submitBtn.textContent = 'Update Account';
      }
    } catch (err) {
      console.error("Error fetching document for edit:", err);
    }
  }
});

// Google Sign-in/out
googleSigninBtn.addEventListener('click', async () => {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("Google Sign-in failed:", err);
    if (err.code === 'auth/popup-closed-by-user') showModal("Sign-in Canceled", "The sign-in popup was closed. Please try again.");
    else showModal("Sign-in Failed", "An error occurred during sign-in. Please try again later.");
  }
});

signOutBtn.addEventListener('click', async () => {
  try {
    await signOut(auth);
    noCardsMessage.style.display = 'block';
    cardList.innerHTML = '';
    totalDebtDisplay.textContent = `$0.00`;
    totalCreditLineDisplay.textContent = `$0.00`;
    totalMonthlyInterestDisplay.textContent = `$0.00`;
    form.reset();
  } catch (err) {
    console.error("Sign-out failed:", err);
  }
});

// Balance-Transfer Optimizer
btRunBtn.addEventListener('click', () => {
  const targetName = (document.getElementById('bt-target-name').value || '').trim();
  const limit = +document.getElementById('bt-limit').value || 0;
  const months = +document.getElementById('bt-months').value || 0;
  const fee = +document.getElementById('bt-fee').value || 0;
  const capVal = document.getElementById('bt-cap').value;
  const cap = capVal ? +capVal : null;

  if (!userId) { showModal('Authentication Error', 'Please sign in to run the optimizer.'); return; }
  if (!window.__latestCards || !window.__latestCards.length) { showModal('No Data', 'Please add accounts first.'); return; }

  const result = planBalanceTransfer(window.__latestCards, targetName, limit, fee, months, cap);
  const out = document.getElementById('bt-output');
  out.innerHTML = '';

  if (result.error) {
    out.innerHTML = `<p class="text-red-600">${result.error}</p>`;
    return;
  }

  const hdr = document.createElement('div');
  hdr.className = 'p-3 bg-white rounded-md border border-gray-200';
  hdr.innerHTML = `
    <p class="font-medium">Target: ${result.target}${result.capApplied !== null ? ` (cap ${result.capApplied}%)` : ''}</p>
    <p>Total Transfer: <span class="font-semibold">$${result.totalTransfer.toFixed(2)}</span></p>
    <p>Monthly Interest Saved: <span class="font-semibold">$${result.totalMonthlySaved.toFixed(2)}</span></p>
    <p>Intro Savings (months ${months}) vs Fees: <span class="font-semibold">$${result.totalIntroSaved.toFixed(2)} saved • $${result.totalFees.toFixed(2)} fees</span></p>
    <p class="${result.netIntroSavings >= 0 ? 'text-green-700' : 'text-red-700'}">Net Savings Over Intro: <span class="font-semibold">$${result.netIntroSavings.toFixed(2)}</span></p>
  `;
  out.appendChild(hdr);

  if (result.moves.length) {
    const list = document.createElement('div');
    list.className = 'mt-3 space-y-2';
    result.moves.forEach((m, i) => {
      const row = document.createElement('div');
      row.className = 'text-sm p-2 bg-white rounded border border-gray-200';
      row.innerHTML = `
        <span class="font-medium">${i + 1}.</span> Move $${m.amount.toFixed(2)} from <span class="font-semibold">${m.from}</span>
        (APR ${m.apr.toFixed(2)}%) • Est monthly saved ~$${m.estMonthlySaved.toFixed(2)}
        ${months ? ` • Intro saved ~$${m.estIntroSaved.toFixed(2)}` : ''} • Fee ~$${m.feeCost.toFixed(2)}
      `;
      list.appendChild(row);
    });
    out.appendChild(list);
  } else {
    out.innerHTML += '<p class="text-gray-600 mt-2">No eligible moves found.</p>';
  }
});

// Init
initFirebase();
