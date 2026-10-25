import { decryptAccount } from "./src/account-crypto.mjs";
import { moneyToCents, aprToBasisPoints } from "./src/money.mjs";
import { SessionScope } from "./src/session-scope.mjs";
import { TrackingStore,revisionOf,fieldsOf,cardPath,safeId } from "./src/tracking-store.mjs";
import { indexedOutbox } from "./src/outbox.mjs";
import { firestoreAdapter } from "./src/firestore-adapter.mjs";
import { makeObservation,localDate } from "./src/observations.mjs";
import { estimateBalance,paymentToTarget } from "./src/money.mjs";
import { showHistory,makeBackup,restoreBackup,historyCSV,trackingDialog,element as uiElement,button as uiButton } from "./src/account-tools.mjs";
import { BACKUP_FORMAT,validateBackup,csvCell } from "./src/backup.mjs";
import { showPlanning,showPayment,showTransfer } from "./src/planning-ui.mjs";
import { scenarioCost,reminders } from "./src/planning.mjs";
import { ProgressPage } from "./src/progress-ui.mjs";
import { preferences } from "./src/preferences.mjs";
import { loadLockMetadata } from "./src/lock-gate.mjs";
import { fallbackAfter,fetchCryptoMetadata,metadataCache } from "./src/metadata-transport.mjs";
import { FirestoreReadClient } from "./src/firestore-read.mjs";
import { encryptedReadCache } from "./src/encrypted-read-cache.mjs";
const readCache=encryptedReadCache();
let accountReader=null,refreshAccounts=null,stopAccountReads=null;
const sessionScope = new SessionScope();
let tracking=null,cloudCards=[],pendingRows=[],viewSequence=0;
let cleanupRunning=false;
let progressPage=null;
let uiPreferences=preferences();
let unreadableRecords=0;

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
const lockSection = document.getElementById("lock-section");
const lockSetup = document.getElementById("lock-setup");
const lockUnlock = document.getElementById("lock-unlock");
const lockSetupForm = document.getElementById("lock-setup-form");
const lockUnlockForm = document.getElementById("lock-unlock-form");
const lockSetupError = document.getElementById("lock-setup-error");
const lockUnlockError = document.getElementById("lock-unlock-error");
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
let editingBase = null;
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
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  initializeFirestore,
  collection,
  onSnapshot,
  doc,
  getDocFromCache,
  getDocFromServer,
  runTransaction,
  enableIndexedDbPersistence,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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

// ====== CLIENT-SIDE ENCRYPTION (Lock Mode) ======
// Card fields are encrypted in the browser with an AES-GCM key derived from a
// user passphrase (PBKDF2). Firestore only ever stores ciphertext, so even the
// project owner cannot read a user's data without their passphrase. The key
// lives in memory only and is cleared on sign-out / refresh (unlock per session).
let cryptoKey = null; // in-memory CryptoKey; null until unlocked this session
let currentCryptoMeta = null; // loaded meta doc for the signed-in user
const PBKDF2_ITERATIONS = 210000;
const VERIFY_TOKEN = "pdt-lock-mode-verify-v1";
const textEnc = new TextEncoder();
const textDec = new TextDecoder();

const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (str) => Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

async function deriveKey(passphrase, saltBytes) {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    textEnc.encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function metaDocRef(uid) {
  return doc(db, `artifacts/${appId}/users/${uid}/meta/crypto`);
}

async function loadCryptoMeta(uid) {
  const generation=sessionScope.generation;
  let storage;try{storage=localStorage;}catch{}
  const cache=metadataCache(storage,`${appId}:${uid}`);
  const read=async getter=>{const snap=await getter(metaDocRef(uid));return snap.exists()?snap.data():null;};
  const metadata=await loadLockMetadata({
    cached:async()=>cache.read()??await read(getDocFromCache),
    server:()=>fallbackAfter(read(getDocFromServer),()=>fetchCryptoMetadata({projectId:appId,uid,user:auth.currentUser})),
  });
  if(sessionScope.current(generation)&&userId===uid)cache.write(metadata);
  return metadata;
}

// First-time setup: generate a salt, derive the key, store salt + a verifier
// blob (encrypted known token) so future unlocks can validate the passphrase.
async function createCryptoMeta(uid, passphrase) {
  const generation = sessionScope.generation;
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(passphrase, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEnc.encode(VERIFY_TOKEN)
  );
  const metadata={
    v: 1,
    salt: toB64(saltBytes),
    verifier: { iv: toB64(iv), data: toB64(ct) },
  };
  await runTransaction(db,async transaction=>{
    const reference=metaDocRef(uid),existing=await transaction.get(reference);
    if(existing.exists())throw new Error('Encryption settings already exist. Reload to unlock using your existing passphrase.');
    if(!sessionScope.current(generation)||userId!==uid)throw new Error('Session changed. Sign in again.');
    transaction.set(reference,metadata);
  });
  if (!sessionScope.current(generation) || userId !== uid) throw new Error("Session changed. Sign in again.");
  cryptoKey = key;
}

// Returning session: derive the key and confirm the passphrase by decrypting
// the verifier. Returns true on success, false on wrong passphrase.
async function unlockWithPassphrase(meta, passphrase) {
  const generation = sessionScope.generation;
  const uid = userId;
  const saltBytes = fromB64(meta.salt);
  const key = await deriveKey(passphrase, saltBytes);
  try {
    const iv = fromB64(meta.verifier.iv);
    const ct = fromB64(meta.verifier.data);
    const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    if (textDec.decode(out) !== VERIFY_TOKEN) return false;
  } catch (e) {
    return false; // AES-GCM auth-tag mismatch => wrong passphrase
  }
  if (!sessionScope.current(generation) || !uid || userId !== uid) throw new Error("Session changed. Sign in again.");
  cryptoKey = key;
  return true;
}


// ====== LOCK MODE UI FLOW ======
function showLockSetup() {
  document.getElementById('lock-loading')?.classList.add('hidden');
  authSection?.classList.add("hidden");
  appLoading?.classList.add("hidden");
  mainApp?.classList.add("hidden");
  lockSection?.classList.remove("hidden");
  lockSetup?.classList.remove("hidden");
  lockUnlock?.classList.add("hidden");
  document.getElementById("lock-pass1")?.focus();
}

function showLockUnlock() {
  document.getElementById('lock-loading')?.classList.add('hidden');
  authSection?.classList.add("hidden");
  appLoading?.classList.add("hidden");
  mainApp?.classList.add("hidden");
  lockSection?.classList.remove("hidden");
  lockUnlock?.classList.remove("hidden");
  lockSetup?.classList.add("hidden");
  document.getElementById("lock-pass")?.focus();
}

let lockRequest=0;
async function loadLockScreen(uid,generation=sessionScope.generation){
 const attempt=++lockRequest;
 authSection?.classList.add('hidden');mainApp?.classList.add('hidden');appLoading?.classList.add('hidden');
 lockSection?.classList.remove('hidden');lockSetup?.classList.add('hidden');lockUnlock?.classList.add('hidden');
 document.getElementById('lock-loading')?.classList.remove('hidden');
 const status=document.getElementById('lock-loading-status'),retry=document.getElementById('lock-retry');
 if(status)status.textContent='Loading your encryption settings...';if(retry)retry.classList.add('hidden');
 try{
  const meta=await loadCryptoMeta(uid);
  if(attempt!==lockRequest||!sessionScope.current(generation)||userId!==uid)return;
  currentCryptoMeta=meta;if(meta)showLockUnlock();else showLockSetup();
 }catch(error){
  if(attempt!==lockRequest||!sessionScope.current(generation)||userId!==uid)return;
  if(status)status.textContent=error.code==='permission-denied'?'Could not read encryption settings. Check Firebase permissions and try again.':error.message;
  retry?.classList.remove('hidden');
 }
}
document.getElementById('lock-retry')?.addEventListener('click',()=>{if(userId)loadLockScreen(userId);});

// Called once the key is in memory: hide the lock screen, show loading, and
// start the (decrypting) Firestore listener.
function enterAppAfterUnlock() {
  try{uiPreferences=preferences(JSON.parse(localStorage.getItem(`pdt-preferences:${appId}:${userId}`)??'{}'));}catch{uiPreferences=preferences();}
  document.getElementById('utilization-targets').value=uiPreferences.targets.join(', ');
  document.getElementById('stale-days').value=uiPreferences.staleDays;
  document.getElementById('promotion-warning-days').value=uiPreferences.warningDays;
  const generation=sessionScope.generation,uid=userId,key=cryptoKey;
  accountReader=new FirestoreReadClient({projectId:appId,uid,getUser:()=>auth.currentUser,isActive:()=>sessionScope.current(generation)&&userId===uid&&cryptoKey===key});
  tracking?.close();
  tracking=new TrackingStore({namespace:`artifacts/${appId}/users/${uid}`,key,
    adapter:firestoreAdapter(db,accountReader),outbox:indexedOutbox(),
    isActive:()=>sessionScope.current(generation)&&userId===uid&&cryptoKey===key,
    onChange:()=>{refreshTrackingView().catch(()=>{});},
  });
  lockSection?.classList.add("hidden");
  lockSetup?.classList.add("hidden");
  lockUnlock?.classList.add("hidden");
  appLoading?.classList.remove("hidden");
  firstSnapshotReceived = false;
  setupFirestoreListener(userId);
  tracking.flush().catch(()=>{});
}

async function refreshTrackingView() {
  const store=tracking,sequence=++viewSequence;
  if(!store)return;
  const rows=await store.pending();
  if(store!==tracking||sequence!==viewSequence)return;
  pendingRows=rows;
  const blocked=new Set(rows.filter(row=>row.status==="conflict").map(row=>row.operation.accountId));
  const view=new Map(cloudCards.map(card=>[card.id,card]));
  for(const row of rows) {
    const op=row.operation;if(blocked.has(op.accountId)||op.type==='restore-history')continue;
    view.set(op.accountId,{...op.after,id:op.accountId,_revision:op.id,_pending:true});
    if(op.type==='transfer'&&op.details.other){const other=op.details.other;view.set(other.id,{...other.after,id:other.id,_revision:op.id,_pending:true});}
  }
  window.__latestCards=[...view.values()].filter(card=>!card.deletedAt);
  renderAll(window.__latestCards);
  renderSyncStatus();
  const notice=document.getElementById('data-quality-notice');if(notice)notice.textContent=unreadableRecords?`${unreadableRecords} account(s) could not be read. Totals are incomplete; update the app or restore a valid backup. No records were changed.`:'';
  cleanupDeletedAccounts().catch(()=>{});
}

async function cleanupDeletedAccounts(){
  const store=tracking;if(!store||cleanupRunning)return;cleanupRunning=true;
  try{
    for(const card of cloudCards.filter(card=>card.deletedAt)){
      store.active();if(pendingRows.some(row=>row.operation.accountId===card.id))continue;
      const remaining=8000-(Date.now()-Date.parse(card.deletedAt));
      if(remaining>0){setTimeout(()=>cleanupDeletedAccounts().catch(()=>{}),remaining+50);continue;}
      if(!card._purging){await store.enqueue(card,fieldsOf(card),'purge');await store.flush();setTimeout(()=>cleanupDeletedAccounts().catch(()=>{}),100);return;}
      await store.adapter.purge(cardPath(store.namespace,card.id),()=>!store.closed&&store.isActive());
    }
  }finally{cleanupRunning=false;}
}

function renderSyncStatus() {
  const box=document.getElementById("sync-status");if(!box)return;
  box.replaceChildren();
  if(!pendingRows.length){box.textContent="No local drafts pending. Balances reflect the last received observations.";return;}
  const title=document.createElement("p");title.textContent=`${pendingRows.length} encrypted change(s) saved on this device, waiting to sync.`;box.append(title);
  for(const row of pendingRows){
    const op=row.operation,line=document.createElement("div");line.className="tracker-sync-row";
    const text=document.createElement("span");
    const current=cloudCards.find(c=>c.id===op.accountId);
    text.textContent=row.error==="rules"?`${op.after.name}: server permissions/rules need attention; draft retained.`:row.status==="conflict"?`${op.after.name}: draft balance ${fmtMoney(op.after.balance)}; latest balance ${current?fmtMoney(current.balance):"account removed"}.`:op.after.name+": pending connection.";
    line.append(text);
    if(row.status==='conflict'){
      const details=document.createElement('details');details.className='tracker-details';const title=document.createElement('summary');title.textContent='Review all draft and latest fields';const values=document.createElement('pre');values.style.whiteSpace='pre-wrap';values.textContent=JSON.stringify({draft:op.after,linkedDraft:op.details?.other??null,latest:current?fieldsOf(current):null,linkedLatest:op.details?.other?cloudCards.find(card=>card.id===op.details.other.id)??null:null},null,2);details.append(title,values);line.append(details);
    }
    if(row.status==="conflict"&&op.type!=="transfer"){
      const apply=document.createElement("button");apply.className="tracker-button";apply.textContent="Apply my draft to latest";
      apply.onclick=async()=>{const store=tracking;if(!current||!store)return;try{await store.discard(op.accountId);await store.enqueue(current,op.after,"conflict-resolution",op.details);store.flush().catch(()=>{});}catch{showModal("Not saved","Could not apply the draft. Please try again.");}};line.append(apply);
    }
    const discard=document.createElement("button");discard.className="tracker-button";discard.textContent="Discard this account and linked drafts";
    discard.onclick=()=>tracking?.discard(op.accountId).catch(()=>showModal("Error","Could not discard the draft."));line.append(discard);box.append(line);
  }
  const retry=document.createElement("button");retry.className="tracker-button";retry.textContent="Retry sync";retry.onclick=()=>tracking?.flush().catch(()=>{});box.append(retry);
}

async function saveTracked(view,account,type="edit",details={}) {
  if(!tracking||!userId||!cryptoKey)throw new Error("Sign in and unlock before saving.");
  const store=tracking;
  const result=await store.enqueue(view,account,type,details);
  if(store!==tracking)throw new Error("Session changed.");
  await refreshTrackingView();store.flush().catch(()=>{});return result;
}
window.addEventListener("online",()=>tracking?.flush().catch(()=>{}));

lockSetupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const p1 = document.getElementById("lock-pass1").value;
  const p2 = document.getElementById("lock-pass2").value;
  const showErr = (msg) => {
    lockSetupError.textContent = msg;
    lockSetupError.classList.remove("hidden");
  };
  if (p1.length < 8) return showErr("Use at least 8 characters.");
  if (p1 !== p2) return showErr("Passphrases don't match.");
  if (!userId) return showErr("Please sign in again.");
  lockSetupError.classList.add("hidden");

  const btn = document.getElementById("lock-setup-btn");
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Setting up…";
  try {
    await createCryptoMeta(userId, p1);
    document.getElementById("lock-pass1").value = "";
    document.getElementById("lock-pass2").value = "";
    toast("Lock Mode enabled");
    enterAppAfterUnlock();
  } catch (err) {
    console.error("[Crypto] Setup failed:", err);
    showErr(err.message?.startsWith('Encryption settings already exist')?err.message:"Could not enable Lock Mode. Please try again.");
    btn.disabled = false;
    btn.textContent = prev;
  }
});

lockUnlockForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const pass = document.getElementById("lock-pass").value;
  const showErr = (msg) => {
    lockUnlockError.textContent = msg;
    lockUnlockError.classList.remove("hidden");
  };
  if (!pass) return showErr("Enter your passphrase.");
  if (!currentCryptoMeta) return showErr("Please refresh and try again.");
  lockUnlockError.classList.add("hidden");

  const btn = document.getElementById("lock-unlock-btn");
  const prev = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Unlocking…";
  try {
    const ok = await unlockWithPassphrase(currentCryptoMeta, pass);
    if (!ok) {
      showErr("Incorrect passphrase.");
      btn.disabled = false;
      btn.textContent = prev;
      return;
    }
    document.getElementById("lock-pass").value = "";
    enterAppAfterUnlock();
  } catch (err) {
    console.error("[Crypto] Unlock failed:", err);
    showErr("Could not unlock. Please try again.");
    btn.disabled = false;
    btn.textContent = prev;
  }
});

function clearUnlockedState() {
  stopAccountReads?.();stopAccountReads=null;refreshAccounts=null;accountReader=null;
  document.getElementById('account-connection')?.classList.add('hidden');
  lockRequest++;
  progressPage?.clear();
  unreadableRecords=0;
  tracking?.close();tracking=null;cloudCards=[];pendingRows=[];viewSequence++;
  document.querySelectorAll(".tracker-undo").forEach(element=>element.remove());
  document.querySelectorAll(".tracking-dialog").forEach(dialog=>{dialog.close();dialog.remove();});
  sessionScope.invalidate();
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  cryptoKey = null;
  currentCryptoMeta = null;
  window.__latestCards = [];
  firstSnapshotReceived = false;
  editingId = null;
  editingBase = null;
  searchQuery='';if(accountSearchInput)accountSearchInput.value='';
  for (const id of ["card-list", "avalanche-list", "snowball-list", "expensive-list", "fico-hints", "bt-output", "sim-output","upcoming-reminders","sync-status","data-quality-notice"]) {
    document.getElementById(id)?.replaceChildren();
  }
  for (const element of [totalDebtDisplay, totalCreditLineDisplay, totalMonthlyInterestDisplay, totalYearlyInterestDisplay]) {
    if (element) element.textContent = "$0.00";
  }
  if (accountsMeta) accountsMeta.textContent = "";
  if (overallUtilBar) overallUtilBar.style.width = "0%";
  if (overallUtilText) overallUtilText.textContent = "0%";
  btTargetSelect?.replaceChildren();
  for (const id of ["lock-pass", "lock-pass1", "lock-pass2", "sim-budget", "bt-limit", "bt-fee", "bt-months", "bt-cap", "bt-target-name"]) {
    const input = document.getElementById(id);
    if (input) input.value = "";
  }
  form?.reset();
  if(document.getElementById("observation-date"))document.getElementById("observation-date").value=localDate();
  closeModal();
  if (modalMessage) modalMessage.textContent = "";
  if (modalTitle) modalTitle.textContent = "";
  if (liveRegion) liveRegion.textContent = "";
  mainApp?.classList.add("hidden");
}

function initFirebase() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    // Close each network response promptly for proxies/antivirus that buffer
    // streaming WebChannel requests. No authentication or rules are bypassed.
    db = initializeFirestore(app,{experimentalForceLongPolling:true});

    // Offline-first Firestore (ignore multi-tab error)
    enableIndexedDbPersistence(db).catch(() => {});

    // Complete redirect sign-in if we came back from Google
    getRedirectResult(auth)
      .then((res) => {
        if (res?.user)
          console.log("[Auth] Redirect sign-in completed.");
      })
      .catch((err) => {
        console.warn("[Auth] Redirect error:", err?.code, err?.message);
        if (authStatus && err?.code === "auth/unauthorized-domain") {
          authStatus.textContent =
            "Add localhost / 127.0.0.1 to Authorized domains in Firebase Auth.";
        }
      });

    onAuthStateChanged(auth, async (user) => {
      clearUnlockedState();
      const generation = sessionScope.generation;
      if (user) {
        userId = user.uid;
        firstSnapshotReceived = false;
        cryptoKey = null; // require unlock each session
        currentCryptoMeta = null;
        authSection?.classList.add("hidden");
        mainApp?.classList.add("hidden");
        appLoading?.classList.add("hidden");
        lockSection?.classList.add("hidden");
        authStatus && (authStatus.textContent = "");
        setHeaderAuthUI(true, user.displayName);
        await loadLockScreen(user.uid,generation);
      } else {
        userId = null;
        cryptoKey = null;
        currentCryptoMeta = null;
        authSection?.classList.remove("hidden");
        lockSection?.classList.add("hidden");
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
  stopAccountReads?.();
  const generation=sessionScope.generation,listenerKey=cryptoKey,reader=accountReader;
  const namespace=`artifacts/${appId}/users/${uid}`;
  const active=()=>sessionScope.current(generation)&&userId===uid&&cryptoKey===listenerKey;
  let live=false,busy=false,stopped=false,remoteLoaded=false;
  const panel=document.getElementById('account-connection');
  const notice=message=>{if(!active())return;panel?.classList.toggle('hidden',!message);const label=document.getElementById('account-connection-message');if(label)label.textContent=message;};
  async function apply(rows,{cached=false,rejected:cachedRejected=0}={}) {
    if(!active()||stopped)return;
    const ticket=sessionScope.startRead(),decrypted=[],valid=[];let rejected=cachedRejected;
    for(const row of rows) {
      try {
        const fields=await decryptAccount(row.data,listenerKey,`${namespace}/cards/${row.id}`);
        if(!active()||!sessionScope.accepts(ticket))return;
        decrypted.push({...fields,id:safeId(row.id),_revision:revisionOf(row.data),_purging:row.data.purging??false});valid.push(row);
      }catch{rejected++;}
    }
    if(!active()||!sessionScope.accepts(ticket))return;
    cloudCards=decrypted;window.__latestCards=decrypted;unreadableRecords=rejected;
    if(editingId&&!decrypted.some(card=>card.id===editingId))editingId=null;
    firstSnapshotReceived=true;appLoading?.classList.add('hidden');mainApp?.classList.remove('hidden');
    if(tracking)await refreshTrackingView();else renderAll(decrypted);
    if(!cached&&active()&&sessionScope.accepts(ticket))readCache.write(namespace,valid,rejected).catch(()=>{});
  }
  refreshAccounts=async()=>{
    if(!active()||stopped||busy)return;
    busy=true;notice('Refreshing encrypted account data...');
    try {
      const rows=await reader.accounts();
      if(!active()||live||stopped)return;
      remoteLoaded=true;await apply(rows);notice('Accounts loaded through HTTPS. Live sync is unavailable; refresh to check for updates. Changes remain pending until sync confirms them.');
    }catch(error){
      if(!active()||live||stopped)return;
      if(!firstSnapshotReceived){
        try{const cached=await readCache.read(namespace);if(cached&&active())await apply(cached.rows,{cached:true,rejected:cached.rejected});}catch{}
      }
      if(!active())return;
      appLoading?.classList.add('hidden');
      notice(`${firstSnapshotReceived?'Showing previously loaded data. ':''}${error.message}`);
    }finally{busy=false;}
  };
  const timer=setTimeout(()=>{if(!live)refreshAccounts?.();},1500);
  const interval=setInterval(()=>{if(!live&&document.visibilityState==='visible')refreshAccounts?.();},60000);
  stopAccountReads=()=>{stopped=true;clearTimeout(timer);clearInterval(interval);};
  const refreshButton=document.getElementById('account-refresh');if(refreshButton)refreshButton.onclick=()=>{live=false;refreshAccounts?.();};
  unsubscribe=onSnapshot(collection(db,`${namespace}/cards`),{includeMetadataChanges:true},async snapshot=>{
    if(!active()||stopped)return;
    const cached=snapshot.metadata?.fromCache??false;
    if(cached&&(remoteLoaded||live||!snapshot.docs.length))return;
    if(!cached){live=true;remoteLoaded=true;notice('');}
    else notice('Showing cached accounts while connecting.');
    await apply(snapshot.docs.map(d=>({id:d.id,data:d.data()})),{cached});
  },()=>{if(active()){live=false;refreshAccounts?.();}});
}

// ====== HELPERS ======
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const fmtMoney = (n) => USD.format(+n || 0);
// Balances that would display as $0.00 (incl. float residue) count as paid off.
const hasBalance = (c) => (+c.balance || 0) >= 0.005;
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
    if(c.status!=="closed")limit += l;
    monthly += scenarioCost(c)??0;
  }
  const openDebt=cards.filter(c=>c.status!=="closed").reduce((sum,c)=>sum+(+c.balance||0),0);
  const util = limit > 0 ? (openDebt / limit) * 100 : 0;
  return { debt, limit, monthly, util,scenarioCount:cards.filter(c=>scenarioCost(c)!==null).length };
}
function computeCardUtilization(card) {
  const b = +card.balance || 0,
    l = +card.creditLimit || 0;
  return l > 0 ? (b / l) * 100 : 0;
}
function riskBadge(util) {
  if (util > 80)
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">&gt;80% utilization</span>';
  if (util > 50)
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">&gt;50% utilization</span>';
  if (util > 30)
    return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-950/50 text-yellow-700 dark:text-yellow-300">&gt;30% utilization</span>';
  return '<span class="inline-block text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">At or below 30%</span>';
}
function rankByInterestPer100(cards) {
  return cards
    .filter(hasBalance)
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
  const thresholds = uiPreferences.targets;
  let over80 = 0,
    over50 = 0,
    over30 = 0;
  const nudges = [];
  let sumTo80 = 0,
    sumTo50 = 0,
    sumTo30 = 0;

  for (const c of cards) {
    if(c.status==='closed')continue;
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
      const dollarsToDrop = paymentToTarget(bal, lim, next) / 100;
      if (dollarsToDrop > 0)
        nudges.push({
          name: c.name,
          currentUtil: util,
          nextThreshold: next,
          dollarsToDrop,
        });
    }
  }
  nudges.sort((a, b) => a.dollarsToDrop - b.dollarsToDrop);

  const { limit } = computeTotals(cards);
  const openDebt=cards.filter(card=>card.status!=='closed').reduce((sum,card)=>sum+card.balance,0);
  const to50Overall = limit>0?Math.max(0, openDebt - 0.5 * limit):null;
  const to30Overall = limit>0?Math.max(0, openDebt - 0.3 * limit):null;

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

function renderCardFicoHint(card) {
  if(card.status==='closed')return '<p class="tracker-help">Issuer-closed account: outstanding balance remains tracked; no open-credit utilization target is suggested.</p>';
  const nudge = computeFicoHints([card]).nudges[0];
  const message = nudge
    ? `<span class="font-semibold text-sky-700 dark:text-sky-400">Pay ${fmtMoney(nudge.dollarsToDrop)}</span> to reach ${nudge.nextThreshold}% utilization.`
    : +card.creditLimit > 0
    ? computeCardUtilization(card) <= 30
      ? "No payment needed for the selected utilization targets."
      : "At the next utilization target to within $0.01."
    : "Add a credit limit to see the threshold payment amount.";

  return `
    <div class="mt-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <p class="text-xs font-medium text-gray-700 dark:text-gray-300">Payments to utilization targets</p>
      <p class="mt-1 text-sm text-gray-700 dark:text-gray-300">${message}</p>
    </div>
  `;
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
  if(cards.some(card=>hasBalance(card)&&card.rateBasis&&card.rateBasis!=='single'))return {error:'Mixed or unknown APR categories need a single-rate scenario assumption before simulation.'};
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
      case "monthlyInterest":
        va = scenarioCost(a);
        vb = scenarioCost(b);
        if(va===null||vb===null)return va===vb?0:va===null?1:-1;
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
  try { moneyToCents(balance); } catch { errors.balance = "Enter a balance of 0 or more, with at most two decimal places."; }
  try { aprToBasisPoints(apr); } catch { errors.apr = "Enter an APR between 0 and 99.99, with at most two decimal places."; }
  try { moneyToCents(creditLimit); } catch { errors.creditLimit = "Enter a credit limit of 0 or more, with at most two decimal places."; }
  return errors;
}

function parseDecimalInput(value) {
  try { return moneyToCents(value) / 100; } catch { return NaN; }
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
  renderReminders(cards);
  progressPage?.refresh();
}

function renderCards(cards) {
  const currentEditor=cardList?.querySelector('.save-inline-btn')?.closest('.debt-card');
  const draft=currentEditor?Array.from(currentEditor.querySelectorAll('[data-field]')).map(input=>({field:input.dataset.field,value:input.value,checked:input.checked})):null;
  const { debt, limit, monthly, util,scenarioCount } = computeTotals(cards);
  if (totalDebtDisplay) totalDebtDisplay.textContent = fmtMoney(debt);
  if (totalCreditLineDisplay)
    totalCreditLineDisplay.textContent = fmtMoney(limit);
  if (totalMonthlyInterestDisplay)
    totalMonthlyInterestDisplay.textContent = scenarioCount||!cards.length?fmtMoney(monthly):'Not included';
  if (totalYearlyInterestDisplay)
    totalYearlyInterestDisplay.textContent = scenarioCount||!cards.length?fmtMoney(monthly * 12):'Not included';
  const coverage=document.getElementById('scenario-coverage');if(coverage)coverage.textContent=`Interest scenarios include ${scenarioCount} of ${cards.length} accounts. Opt in per account under Statement & planning. Constant balances/rates, before fees and compounding; not actual charges.`;
  if (overallUtilBar) {
    const pct = Math.max(0, Math.min(100, util));
    overallUtilBar.style.width = `${pct}%`;
    overallUtilBar.className =
      "h-2.5 rounded-full transition-all " +
      (pct <= 30 ? "bg-emerald-500" : pct <= 50 ? "bg-amber-500" : "bg-rose-500");
  }
  if (overallUtilText) overallUtilText.textContent = limit>0?`${util.toFixed(1)}%`:'Unavailable';
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

  const showArchived=document.getElementById('show-archived')?.checked;
  const staleOnly=document.getElementById('stale-only')?.checked;
  const staleDays=Number(document.getElementById('stale-days')?.value)||7;
  const visible=cards.filter(card=>(showArchived||!card.archived)&&(!staleOnly||!card.effectiveDate||(Date.now()-Date.parse(card.effectiveDate+'T00:00:00'))/86400000>=staleDays));
  const query = searchQuery.trim().toLowerCase();
  const filtered = query
    ? visible.filter((c) => (c.name || "").toLowerCase().includes(query))
    : visible;

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
    const monthlyInt = scenarioCost(card);
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
            <div class="mt-1">${creditLimit>0?riskBadge(utilization):'<span class="tracker-help">Utilization unavailable: no positive limit</span>'}</div>
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
              <p>Monthly cost scenario: <span class="font-semibold text-gray-900 dark:text-gray-100">${monthlyInt===null?'Not included':fmtMoney(monthlyInt)}</span></p>
            </div>
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">Hypothetical monthly cost per $100 at entered APR: ${card.rateBasis&&card.rateBasis!=='single'?'Unavailable':fmtMoney(interestPer100(apr))}</p>
            <p class="tracker-help">${card.entryMethod==='availableCredit'?'Estimated from available credit: '+fmtMoney(card.availableCredit):'Direct balance entry'} | ${card.effectiveDate?(card.provisional?'Provisional as of ':'Observed ')+escapeHtml(card.effectiveDate):'Observation date not recorded'}${card._pending?' | Pending sync':''}${card.provisional?' | Refresh issuer inputs to reconcile.':''}</p>
            <p class="tracker-help">${card.archived?'Archived (still included in totals). ':''}${card.status==='closed'?'Issuer-closed; outstanding balance remains tracked. ':''}${!card.effectiveDate||(Date.now()-Date.parse(card.effectiveDate+'T00:00:00'))/86400000>=Number(document.getElementById('stale-days')?.value||7)?'Balance needs an update.':''}</p>
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
            <p class="text-sm text-gray-700 dark:text-gray-300">Estimated utilization: <span class="font-semibold">${creditLimit>0?utilization.toFixed(1)+'%':'Unavailable'}</span></p>
            <p class="text-xs text-gray-400 dark:text-gray-500">View: ${utilView.toUpperCase()}</p>
          </div>

          ${
            creditLimit<=0?'':utilView === "pie"
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
          ${renderCardFicoHint(card)}
            <div class="tracker-actions">
              <button class="tracker-button" data-account-action="planning" data-id="${card.id}">Statement & planning</button>
              <button class="tracker-button" data-account-action="payment" data-id="${card.id}">Record payment</button>
              <button class="tracker-button" data-account-action="transfer" data-id="${card.id}">Record transfer</button>
              <button class="tracker-button" data-account-action="history" data-id="${card.id}">View history</button>
              <button class="tracker-button" data-account-action="archive" data-id="${card.id}">${card.archived?'Unarchive':'Archive'}</button>
              <button class="tracker-button" data-account-action="status" data-id="${card.id}">${card.status==='closed'?'Mark issuer-open':'Mark issuer-closed'}</button>
            </div>
            <button class="refresh-observation tracker-button" data-id="${card.id}">Record current values as observed today</button>

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
              ${renderEntryExtras(card)}
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
    if(isEditing){
      if(draft)for(const field of draft){const input=el.querySelector(`[data-field="${field.field}"]`);if(input){input.value=field.value;if(input.type==='checkbox')input.checked=field.checked;}}
      refreshEntry(el);
    }
  });
}

function renderEntryExtras(card){
  const method=card.entryMethod??'direct';
  return `<label class="block">Balance entry<select class="tracker-input" data-field="entryMethod"><option value="availableCredit" ${method==='availableCredit'?'selected':''}>Calculate from available credit</option><option value="direct" ${method==='direct'?'selected':''}>Enter balance directly</option></select></label>
    <label class="block">Available credit ($)<input class="tracker-input" data-field="availableCredit" type="number" step="0.01" min="0" value="${card.availableCredit??''}" /></label>
    <p class="balance-preview tracker-help"></p>
    <label class="block">Observed on<input class="tracker-input" data-field="effectiveDate" type="date" value="${localDate()}" /></label>
    <label class="block"><input data-field="confirmObservation" type="checkbox" /> I checked these balance inputs today (or on the selected date)</label>
    <label class="block">Reason (optional)<input class="tracker-input" data-field="reason" maxlength="120" value="" /></label>
    <label class="block">Note (optional)<textarea class="tracker-input" data-field="note" maxlength="1000">${escapeHtml(card.note??'')}</textarea></label>`;
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
      <svg width="56" height="56" viewBox="0 0 48 48" role="img" aria-label="Utilization: ${util.toFixed(1)}%">
        <circle cx="24" cy="24" r="${r}" stroke="${trackColor}" stroke-width="6" fill="none"/>
        <circle cx="24" cy="24" r="${r}" stroke="${color}" stroke-width="6" fill="none"
                stroke-dasharray="${filled} ${remaining}" transform="rotate(-90 24 24)"/>
      </svg>
      <span class="text-sm text-gray-700 dark:text-gray-300">${limit>0?util.toFixed(1)+'%':'Unavailable'}</span>
    </div>
  `;
}

function renderStrategy(cards, strategy) {
  const target = strategy === "avalanche" ? avalancheList : snowballList;
  // Paid-off accounts drop out of the payoff order.
  const owing = cards.filter(hasBalance);
  const sorted =
    strategy === "avalanche"
      ? owing.sort((a, b) => (+b.apr || 0) - (+a.apr || 0))
      : owing.sort((a, b) => (+a.balance || 0) - (+b.balance || 0));

  if (!target) return;
  target.innerHTML = "";
  if (!cards.length) {
    target.innerHTML =
      '<button type="button" onclick="focusAddForm()" class="text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">Add accounts to see the payoff plan.</button>';
    return;
  }
  if (!sorted.length) {
    target.innerHTML =
      '<p class="text-emerald-700 dark:text-emerald-400">All accounts are paid off. 🎉</p>';
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
  const ranked = cards
    .filter(hasBalance)
    .map((card) => ({
      ...card,
      monthlyCost: scenarioCost(card),
    }))
    .filter(card=>card.monthlyCost!==null)
    .sort((a, b) => b.monthlyCost - a.monthlyCost);
  expensiveList.innerHTML = "";
  if (!ranked.length && cards.length) {
    expensiveList.innerHTML =
      '<p class="text-gray-500 dark:text-gray-400">No eligible balances included. Opt into a single-rate scenario under Statement & planning.</p>';
    return;
  }
  if (!ranked.length) {
    expensiveList.innerHTML =
      '<button type="button" onclick="focusAddForm()" class="text-gray-500 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400 hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">Add accounts to see estimated monthly interest by account.</button>';
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
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">APR ${(+r.apr || 0).toFixed(
            2
          )}% • Balance ${fmtMoney(r.balance)}</p>
        </div>
      </div>
      <span class="text-sm font-semibold text-rose-700 dark:text-rose-400 shrink-0">${fmtMoney(
        r.monthlyCost
      )}/mo</span>
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
  const { util,limit } = computeTotals(cards);
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
            ? `<p class="text-xs mt-1 opacity-90">Amount to reach target: ${fmtMoney(minToTame)}</p>`
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
      <span>To reach 50% overall: <span class="font-semibold text-gray-700 dark:text-gray-300">${to50Overall===null?'Unavailable':fmtMoney(to50Overall)}</span></span>
      <span>To reach 30% overall: <span class="font-semibold text-gray-700 dark:text-gray-300">${to30Overall===null?'Unavailable':fmtMoney(to30Overall)}</span></span>
    </div>
  `;
  box.appendChild(summary);

  if (nudges.length) {
    const list = document.createElement("div");
    list.className = "mt-3 space-y-2";
    const title = document.createElement("p");
    title.className = "font-medium";
    title.textContent = "Payments to utilization targets:";
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
      "No open tracked cards exceed the selected planning targets.";
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
async function exportData(format = "csv") {
  if(!tracking||!cryptoKey){showModal('Locked','Sign in and unlock before exporting.');return;}
  if(format==='json'||format==='history'){
    if(unreadableRecords){showModal('Export unavailable','A complete backup cannot be created while accounts are unreadable. Resolve the data warning first.');return;}
    try{const store=tracking;const backup=await makeBackup(store,cloudCards.filter(c=>!c.deletedAt));store.active();if(store!==tracking)return;backup.settings=uiPreferences;
      downloadFile(format==='json'?'debt-tracker-backup.json':'debt-tracker-history.csv',format==='json'?'application/json':'text/csv',format==='json'?JSON.stringify(backup,null,2):historyCSV(backup.accounts));
      toast('Downloaded backup contains decrypted personal financial data. Store it privately.');
    }catch(error){showModal('Export unavailable',error.message);}return;
  }
  const rows = window.__latestCards.map((c) => ({
    id: c.id,
    name: c.name,
    balance: +c.balance || 0,
    apr: +c.apr || 0,
    creditLimit: +c.creditLimit || 0,
  }));
  const header=['id','name','balance','apr','creditLimit'];
  downloadFile('debt-tracker.csv','text/csv',[header,...rows.map(row=>header.map(key=>row[key]))].map(row=>row.map(csvCell).join(',')).join('\r\n'));

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
    const balance = parseDecimalInput(values[colIndex.balance]);
    const apr = parseDecimalInput(values[colIndex.apr]);
    const creditLimit = parseDecimalInput(values[colIndex.creditLimit]);
    const fieldErrors = validateCardInput({ name, balance, apr, creditLimit });
    if (Object.keys(fieldErrors).length) {
      errors.push(`Row ${i + 1}: ${Object.values(fieldErrors).join(" ")}`);
      continue;
    }
    rows.push({ name, balance, apr, creditLimit });
  }
  return { rows, errors };
}

// Parse the JSON export format (array of {name, balance, apr, creditLimit}),
// validating each entry with the same rules as manual entry.
function parseJson(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { rows: [], errors: ["File is not valid JSON."] };
  }
  const arr = Array.isArray(parsed) ? parsed : parsed?.cards;
  if (!Array.isArray(arr)) {
    return {
      rows: [],
      errors: ["Expected a JSON array of accounts (as produced by Export JSON)."],
    };
  }
  const rows = [];
  const errors = [];
  arr.forEach((entry, i) => {
    const name = (entry?.name ?? "").toString().trim();
    const balance = parseDecimalInput(entry?.balance);
    const apr = parseDecimalInput(entry?.apr);
    const creditLimit = parseDecimalInput(entry?.creditLimit);
    const fieldErrors = validateCardInput({ name, balance, apr, creditLimit });
    if (Object.keys(fieldErrors).length) {
      errors.push(`Item ${i + 1}: ${Object.values(fieldErrors).join(" ")}`);
      return;
    }
    rows.push({ name, balance, apr, creditLimit });
  });
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
  if (!cryptoKey) {
    showModal("Locked", "Please unlock with your passphrase before importing.");
    return;
  }

  const importStore=tracking;
  if(file.size>10*1024*1024){showModal('Import failed','Choose a backup smaller than 10 MB.');return;}
  const text = await file.text();
  if(!importStore||tracking!==importStore||!importStore.isActive())return;
  try{const raw=JSON.parse(text);if(raw?.format===BACKUP_FORMAT){
    const backup=validateBackup(raw);const {dialog,body}=trackingDialog('Review backup restore');
    body.append(uiElement('p',`${backup.accounts.length} accounts and ${backup.accounts.reduce((sum,row)=>sum+row.events.length,0)} history records. Existing conflicting accounts are skipped unless you explicitly replace them.`));
    for(const row of backup.accounts)body.append(uiElement('p',`${row.account.name}: ${fmtMoney(row.account.balance)}${cloudCards.some(c=>c.id===row.id)?' (already tracked)':''}`));
    const label=uiElement('label');const replace=uiElement('input');replace.type='checkbox';label.append(replace,document.createTextNode(' Replace current snapshots for matching account IDs'));body.append(label);
    body.append(uiButton('Restore reviewed backup',async()=>{try{const store=tracking;const result=await restoreBackup(store,backup,cloudCards,{replace:replace.checked});store.active();if(store!==tracking)return;uiPreferences=preferences(backup.settings);savePreferences();dialog.close();await refreshTrackingView();toast(`Restore queued: ${result.restored} accounts, ${result.skipped} conflicts skipped.`);}catch(error){showModal('Restore failed',error.message);}}));return;
  }}catch(error){if(text.includes('"format"')){showModal('Import failed',error.message);return;}}

  const isJson =
    /\.json$/i.test(file.name) ||
    file.type === "application/json" ||
    text.trim().startsWith("[") ||
    text.trim().startsWith("{");
  const { rows, errors } = isJson ? parseJson(text) : parseCsv(text);
  if(rows.length>1000){showModal('Import failed','Import at most 1,000 accounts at a time.');return;}

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
    if(tracking!==importStore||!importStore.isActive())return;
    try {
      await saveTracked(null,makeObservation(null,{...row,entryMethod:'direct',effectiveDate:localDate()}).account,'import');
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

// Add and edit through one encrypted mutation service.
function readEntry(root, prior=null) {
  const top=root===form;
  const ids={name:'card-name',balance:'balance',apr:'apr',creditLimit:'limit',availableCredit:'available-credit',entryMethod:'entry-method',effectiveDate:'observation-date',note:'account-note',reason:'account-reason'};
  const get=key=>top?document.getElementById(ids[key])?.value:root.querySelector(`[data-field="${key}"]`)?.value;
  return makeObservation(prior,{name:(get('name')??'').trim(),apr:get('apr'),creditLimit:get('creditLimit'),
    availableCredit:get('availableCredit'),balance:get('balance'),entryMethod:get('entryMethod')??'direct',
    effectiveDate:get('effectiveDate')||localDate(),note:get('note')??prior?.note??'',reason:get('reason')??'',
    confirmObservation:root.querySelector('[data-field="confirmObservation"]')?.checked===true,
  });
}
function refreshEntry(root) {
  const top=root===form;
  const find=key=>top?document.getElementById({entryMethod:'entry-method',balance:'balance',availableCredit:'available-credit',creditLimit:'limit'}[key]):root.querySelector(`[data-field="${key}"]`);
  const balance=find('balance'),available=find('availableCredit'),method=find('entryMethod')?.value??'direct';
  if(!balance)return;
  balance.readOnly=method==='availableCredit';available?.closest('label, .entry-available')?.classList.toggle('hidden',method!=='availableCredit');
  const preview=top?document.getElementById('balance-preview'):root.querySelector('.balance-preview');
  if(method==='availableCredit'){
    try{const estimate=estimateBalance(find('creditLimit').value,available.value);balance.value=(estimate.balanceCents/100).toFixed(2);if(preview)preview.textContent=estimate.availableExceedsLimit?'Available credit exceeds limit; verify issuer values.':estimate.atCapacity?'No available credit. An over-limit amount cannot be determined from this alone.':'Estimated balance = limit minus available credit.';}
    catch{balance.value='';if(preview)preview.textContent='Enter limit and available credit to preview the estimated balance.';}
  } else if(preview)preview.textContent='Direct balance entry. Use for legacy records or over-limit exceptions.';
}
form?.addEventListener('input',()=>refreshEntry(form));
form?.addEventListener('change',()=>refreshEntry(form));
form?.addEventListener('submit',async e=>{
  e.preventDefault();submitBtn.disabled=true;
  try{const result=readEntry(form);await saveTracked(null,result.account,'add');form.reset();document.getElementById('observation-date').value=localDate();refreshEntry(form);toast('Account saved; sync status shown above.');}
  catch(error){showModal('Not saved',error.message||'Could not save the account.');}
  finally{submitBtn.disabled=false;}
});
cardList?.addEventListener('input',e=>{const card=e.target.closest('.debt-card');if(card)refreshEntry(card);});
cardList?.addEventListener('change',e=>{const card=e.target.closest('.debt-card');if(card)refreshEntry(card);});
cardList?.addEventListener('click',async e=>{
  const button=e.target.closest('button[data-id]');if(!button)return;
  const id=button.dataset.id;
  const card=window.__latestCards.find(c=>c.id===id);if(!card)return;
  if(button.classList.contains('inline-edit-btn')){editingBase=structuredClone(card);editingId=id;renderCards(window.__latestCards);cardList.querySelector('.save-inline-btn')?.closest('.debt-card')?.querySelector('input')?.focus();return;}
  if(button.classList.contains('cancel-inline-btn')){editingId=null;editingBase=null;renderCards(window.__latestCards);return;}
  button.disabled=true;
  try{
    if(button.classList.contains('save-inline-btn')){
      const base=editingBase??card;const result=readEntry(button.closest('.debt-card'),base);
      await saveTracked(base,result.account,result.historical?'historical-observation':result.observed?'observation':'edit',result.historical?{observation:result.observation}:{});
      editingId=null;renderAll(window.__latestCards);toast(result.historical?'Historical observation saved; latest values retained.':'Update saved; sync status shown above.');
    }else if(button.classList.contains('nudge-btn')){
      const newBalance=Math.max(0,Math.round((card.balance+Number(button.dataset.delta))*100)/100);
      const input={...fieldsOf(card),entryMethod:card.entryMethod??'direct',effectiveDate:localDate(),confirmObservation:true,balance:newBalance};
      if(input.entryMethod==='availableCredit'){
        if(newBalance>card.creditLimit)throw new Error('This adjustment exceeds the limit. Use direct entry for the over-limit amount.');
        input.availableCredit=Math.round((card.creditLimit-newBalance)*100)/100;
      }
      const result=makeObservation(card,input);await saveTracked(card,result.account,'adjustment',{appliedChange:Math.round((newBalance-card.balance)*100)});
      toast('Balance adjustment saved.');
    }else if(button.classList.contains('refresh-observation')){
      const result=makeObservation(card,{...fieldsOf(card),entryMethod:card.entryMethod??'direct',effectiveDate:localDate(),confirmObservation:true});
      await saveTracked(card,result.account,'observation');toast('Current values recorded as observed today.');
    }else if(button.classList.contains('delete-btn')){
      const after={...trackingFields(card),deletedAt:new Date().toISOString()};
      const deleted=await saveTracked(card,after,'delete');
      const ownerStore=tracking;
      const undo=document.createElement('div');undo.className='tracker-undo';undo.textContent='Account removed. ';
      const restore=document.createElement('button');restore.className='tracker-button';restore.textContent='Undo';undo.append(restore);document.body.append(undo);
      restore.onclick=async()=>{if(ownerStore!==tracking)return;restore.disabled=true;try{await saveTracked(deleted,{...after,deletedAt:null},'restore');undo.remove();}catch(error){showModal('Restore failed',error.message);restore.disabled=false;}};
      setTimeout(()=>undo.remove(),8000);
    }
  }catch(error){showModal('Not saved',error.message||'Please try again.');}
  finally{if(button.isConnected)button.disabled=false;}
});
function trackingFields(card){
  if(card.schemaVersion===2)return fieldsOf(card);
  const result=makeObservation(card,{...fieldsOf(card),entryMethod:'direct',effectiveDate:localDate()});
  return result.account;
}
cardList?.addEventListener('click',async e=>{
 const button=e.target.closest('[data-account-action]');if(!button)return;
 const card=window.__latestCards.find(c=>c.id===button.dataset.id);if(!card||!tracking)return;
 try{
  const context={save:saveTracked,trackingFields,getCard:id=>window.__latestCards.find(c=>c.id===id),cards:()=>window.__latestCards};
  if(button.dataset.accountAction==='planning'){await showPlanning(tracking,card,context);return;}
  if(button.dataset.accountAction==='payment'){showPayment(tracking,card,context);return;}
  if(button.dataset.accountAction==='transfer'){showTransfer(tracking,card,context);return;}
  if(button.dataset.accountAction==='history')await showHistory(tracking,card,event=>correctObservation(card.id,event));
  else if(button.dataset.accountAction==='archive')await saveTracked(card,{...trackingFields(card),archived:!card.archived,updatedAt:new Date().toISOString()},'archive');
  else if(button.dataset.accountAction==='status')await saveTracked(card,{...trackingFields(card),status:card.status==='closed'?'open':'closed',updatedAt:new Date().toISOString()},'status');
 }catch(error){showModal('Not saved',error.message);}
});
function correctObservation(id,event){
 const observation=event.details?.observation??event.after;
 const {dialog,body}=trackingDialog('Correct an observation');
 body.append(uiElement('p','This replaces an incorrect historical entry. It is not a new balance reduction.'));
 const form=uiElement('form');
 for(const [key,label,type,value] of [['name','Account name','text',observation.name],['entryMethod','Entry method','select',observation.entryMethod??'direct'],['creditLimit','Credit limit','number',observation.creditLimit],['availableCredit','Available credit','number',observation.availableCredit??''],['balance','Direct balance','number',observation.balance],['apr','APR','number',observation.apr],['effectiveDate','Observed on','date',observation.effectiveDate??localDate()],['note','Note','text',observation.note??'']]){
  const wrap=uiElement('label',label);const input=uiElement(type==='select'?'select':'input');input.dataset.field=key;input.className='tracker-input';
  if(type==='select')for(const method of ['availableCredit','direct']){const option=uiElement('option',method==='direct'?'Enter balance directly':'Calculate from available credit');option.value=method;input.append(option);}else{input.type=type;if(type==='number'){input.min='0';input.step='0.01';}}
  input.value=String(value);wrap.append(input);form.append(wrap);
 }
 const confirm=uiElement('input');confirm.type='checkbox';confirm.checked=true;confirm.hidden=true;confirm.dataset.field='confirmObservation';form.append(confirm);
 const save=uiButton('Save correction',null);save.type='submit';form.append(save);form.oninput=()=>refreshEntry(form);refreshEntry(form);
 form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{
  const current=window.__latestCards.find(c=>c.id===id);if(!current)throw new Error('Account is no longer available.');
  const candidate=readEntry(form,observation).observation;
  const isLatest=current.balanceObservedAt===observation.balanceObservedAt&&current.effectiveDate===observation.effectiveDate;
  const after=isLatest?{...trackingFields(current),...candidate}:{...trackingFields(current),updatedAt:new Date().toISOString()};
  await saveTracked(current,after,'correction',{correctionOf:event.id,observation:candidate});dialog.close();
 }catch(error){showModal('Correction not saved',error.message);save.disabled=false;}};
 body.append(form);
}
function savePreferences(){
 uiPreferences=preferences(uiPreferences);
 try{localStorage.setItem(`pdt-preferences:${appId}:${userId}`,JSON.stringify(uiPreferences));}catch{}
 document.getElementById('utilization-targets').value=uiPreferences.targets.join(', ');
 document.getElementById('stale-days').value=uiPreferences.staleDays;
 document.getElementById('promotion-warning-days').value=uiPreferences.warningDays;
}
document.getElementById('save-utilization-targets')?.addEventListener('click',()=>{
 try{uiPreferences=preferences({...uiPreferences,targets:document.getElementById('utilization-targets').value.split(',').map(value=>value.trim())});savePreferences();renderAll(window.__latestCards);}catch(error){showModal('Invalid targets',error.message);}
});
for(const id of ['show-archived','stale-only','stale-days'])document.getElementById(id)?.addEventListener('change',()=>{try{uiPreferences=preferences({...uiPreferences,staleDays:Number(document.getElementById('stale-days').value)});savePreferences();renderCards(window.__latestCards);}catch(error){showModal('Invalid interval',error.message);}});
function renderReminders(cards){
 const box=document.getElementById('upcoming-reminders');if(!box)return;box.replaceChildren();
 const days=Number(document.getElementById('promotion-warning-days')?.value)||7;
 for(const card of cards)for(const reminder of reminders(card,localDate(),days)){
  const row=uiElement('div',null,'tracker-history-row');row.append(uiElement('p',`${card.name} | ${reminder.date} | ${reminder.text}`));
  row.append(uiButton('Review account',()=>showPlanning(tracking,card,{save:saveTracked,trackingFields,getCard:id=>window.__latestCards.find(c=>c.id===id),cards:()=>window.__latestCards})));box.append(row);
 }
 if(!box.childNodes.length)box.textContent='No statement deadlines or approaching promotion dates recorded. Add them under Statement & planning on an account.';
}
document.getElementById('promotion-warning-days')?.addEventListener('change',()=>{try{uiPreferences=preferences({...uiPreferences,warningDays:Number(document.getElementById('promotion-warning-days').value)});savePreferences();renderReminders(window.__latestCards);}catch(error){showModal('Invalid interval',error.message);}});
if(document.getElementById('observation-date'))document.getElementById('observation-date').value=localDate();
refreshEntry(form);

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
    clearUnlockedState();
    userId = null;
    // Tear down the live listener FIRST so it can't fire a post-sign-out
    // permission error that would re-show the data view.
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    // Clear in-memory state and keys.
    window.__latestCards = [];
    firstSnapshotReceived = false;
    editingId = null;
    cryptoKey = null;
    currentCryptoMeta = null;

    await signOut(auth);

    // Switch straight back to the sign-in screen immediately, rather than
    // waiting on the onAuthStateChanged callback.
    mainApp?.classList.add("hidden");
    lockSection?.classList.add("hidden");
    appLoading?.classList.add("hidden");
    authSection?.classList.remove("hidden");

    setHeaderAuthUI(false);
    if (noCardsMessage) {
      noCardsMessage.classList.remove("hidden");
      noCardsMessage.textContent =
        "No accounts added yet. Click to add your first account.";
    }
    cardList && (cardList.innerHTML = "");
    totalDebtDisplay && (totalDebtDisplay.textContent = `$0.00`);
    totalCreditLineDisplay && (totalCreditLineDisplay.textContent = `$0.00`);
    totalMonthlyInterestDisplay &&
      (totalMonthlyInterestDisplay.textContent = `$0.00`);
    accountsMeta && (accountsMeta.textContent = "");
    form?.reset();
    applyFieldErrors({}, TOP_FORM_FIELD_MAP);
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
    <p>Hypothetical monthly interest reduction: <span class="font-semibold">${fmtMoney(
      result.totalMonthlySaved
    )}</span></p>
    <p>Scenario over intro period (months ${months}) vs Fees: <span class="font-semibold">${fmtMoney(
    result.totalIntroSaved
  )} saved • ${fmtMoney(result.totalFees)} fees</span></p>
    <p class="${
      result.netIntroSavings >= 0
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-rose-700 dark:text-rose-400"
    }">Hypothetical net benefit over intro: <span class="font-semibold">${fmtMoney(
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
    <p>Simulated payoff time: <span class="font-semibold">${durationText}</span> <span class="text-xs text-gray-500 dark:text-gray-400">(~${payoffDateText})</span></p>
    <p>Simulated total interest: <span class="font-semibold text-rose-700 dark:text-rose-400">${fmtMoney(
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
  if(location.hash==='#progress')id='progress';
  navLinks.forEach((link) => {
    const isActive = link.getAttribute("href") === `#${id}`;
    NAV_ACTIVE_CLASSES.forEach((c) => link.classList.toggle(c, isActive));
    if(isActive)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  });
}
window.addEventListener('hashchange',()=>setActiveNav(location.hash==='#progress'?'progress':location.hash.slice(1)));

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
progressPage=new ProgressPage({getStore:()=>tracking,getCards:()=>cloudCards});
initFirebase();
