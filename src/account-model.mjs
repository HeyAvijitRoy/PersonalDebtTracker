import { moneyToCents, centsToMoney, aprToBasisPoints, estimateBalance, MAX_MONEY_CENTS } from "./money.mjs";

export const ACCOUNT_SCHEMA_VERSION = 2;

function record(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid account record.");
}
function text(value, maximum, label) {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError(`Invalid ${label}.`);
  return value;
}
function choice(value, allowed, label) {
  if (!allowed.includes(value)) throw new TypeError(`Invalid ${label}.`);
  return value;
}
export function dateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new TypeError("Invalid calendar date.");
  }
  return value;
}
function timestamp(value) {
  if (value == null) return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new TypeError("Invalid observation timestamp.");
  return value;
}
const monetary = value => centsToMoney(moneyToCents(value));

// Pick known fields explicitly. Untrusted fields cannot replace document identity,
// add prototypes, or supply executable markup. Rendering must still escape text.
export function readAccount(raw) {
  record(raw);
  const version = raw.schemaVersion ?? 1;
  if (![1, ACCOUNT_SCHEMA_VERSION].includes(version)) throw new TypeError("Unsupported account version. Update the app before editing.");
  const name = text(raw.name, 60, "account name");
  if (!name.trim()) throw new TypeError("An account name is required.");
  // Older clients accepted fractional cents. Preserve valid finite legacy values
  // on read; a later explicit edit/migration can request cent-accurate input.
  if (version === 1) {
    for (const field of ["balance", "creditLimit", "apr"]) {
      const maximum = field === "apr" ? 99.99 : MAX_MONEY_CENTS / 100;
      if (typeof raw[field] !== "number" || !Number.isFinite(raw[field]) || raw[field] < 0 || raw[field] > maximum) throw new TypeError("Invalid legacy account values.");
    }
    return { name, balance: raw.balance, apr: raw.apr, creditLimit: raw.creditLimit };
  }
  const supported = new Set(["schemaVersion", "name", "balance", "apr", "creditLimit", "entryMethod", "availableCredit", "balanceObservedAt", "updatedAt", "effectiveDate", "status", "archived", "note", "reason"]);
  if (Object.keys(raw).some(key => !supported.has(key))) throw new TypeError("Unrecognized account fields. Update the app before editing.");
  const creditLimit = monetary(raw.creditLimit);
  const apr = aprToBasisPoints(raw.apr) / 100;
  const balance = monetary(raw.balance);
  const common = { name, balance, apr, creditLimit };
  const entryMethod = choice(raw.entryMethod, ["availableCredit", "direct"], "entry method");
  const availableCredit = entryMethod === "availableCredit" ? monetary(raw.availableCredit) : null;
  if (entryMethod === "availableCredit") {
    if (creditLimit <= 0) throw new TypeError("A positive credit limit is required for calculated entry.");
    if (moneyToCents(balance) !== estimateBalance(creditLimit, availableCredit).balanceCents) throw new TypeError("Balance does not match the available-credit observation.");
  }
  const archived = raw.archived ?? false;
  if (typeof archived !== "boolean") throw new TypeError("Invalid archive state.");
  return {
    schemaVersion: ACCOUNT_SCHEMA_VERSION, ...common, entryMethod, availableCredit,
    balanceObservedAt: timestamp(raw.balanceObservedAt),
    updatedAt: timestamp(raw.updatedAt),
    effectiveDate: raw.effectiveDate == null ? null : dateOnly(raw.effectiveDate),
    status: choice(raw.status ?? "unknown", ["open", "closed", "unknown"], "issuer status"),
    archived,
    note: text(raw.note ?? "", 1000, "note"),
    reason: text(raw.reason ?? "", 120, "reason"),
  };
}

// This constructor prepares the new format. The UI will opt into it only after
// the history mutation service is ready; reading old records never writes them.
export function createAccount(input, { observedAt = null, effectiveDate = null } = {}) {
  record(input);
  const entryMethod = input.entryMethod ?? "availableCredit";
  const creditLimit = monetary(input.creditLimit);
  const balance = entryMethod === "availableCredit"
    ? centsToMoney(estimateBalance(creditLimit, input.availableCredit).balanceCents)
    : monetary(input.balance);
  return readAccount({
    ...input, schemaVersion: ACCOUNT_SCHEMA_VERSION, entryMethod, creditLimit, balance,
    balanceObservedAt: observedAt, updatedAt: observedAt, effectiveDate,
  });
}
