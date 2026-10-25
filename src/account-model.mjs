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
const optionalDate=value=>value==null||value===""?null:dateOnly(value);
const optionalMoney=value=>value==null||value===""?null:monetary(value);
function statement(value){
  if(value==null)return null;record(value);
  if(Object.keys(value).some(key=>!['id','openingDate','closingDate','dueDate','balance','avoidInterestAmount','avoidInterestObservedAt','grace','priorPaid','cutoff','handled'].includes(key)))throw new TypeError("Unrecognized statement fields. Update the app before editing.");
  const id=text(value.id,80,"statement ID");if(!/^[A-Za-z0-9_-]+$/.test(id))throw new TypeError("Invalid statement ID.");
  const openingDate=optionalDate(value.openingDate),closingDate=optionalDate(value.closingDate),dueDate=optionalDate(value.dueDate);
  if(openingDate&&closingDate&&openingDate>closingDate)throw new TypeError("Statement opening date follows closing date.");
  if(closingDate&&dueDate&&dueDate<closingDate)throw new TypeError("Due date precedes statement closing date.");
  if(typeof (value.handled??false)!=="boolean")throw new TypeError("Invalid statement status.");
  return {id,openingDate,closingDate,dueDate,balance:optionalMoney(value.balance),avoidInterestAmount:optionalMoney(value.avoidInterestAmount),avoidInterestObservedAt:timestamp(value.avoidInterestObservedAt),
    grace:choice(value.grace??"unknown",["unknown","active","inactive"],"grace status"),priorPaid:choice(value.priorPaid??"unknown",["unknown","yes","no"],"prior statement status"),cutoff:text(value.cutoff??"",80,"payment cutoff"),handled:value.handled??false};
}
function promotion(value){
  if(value==null)return null;record(value);
  if(Object.keys(value).some(key=>!['type','endDate','startDate','balance','postApr','note'].includes(key)))throw new TypeError("Unrecognized promotion fields. Update the app before editing.");
  if(value.startDate&&value.endDate&&value.endDate<value.startDate)throw new TypeError("Promotion end date precedes its start date.");
  return {type:choice(value.type??"unknown",["zero","deferred","unknown"],"promotion type"),endDate:optionalDate(value.endDate),startDate:optionalDate(value.startDate),balance:optionalMoney(value.balance),postApr:value.postApr==null||value.postApr===""?null:aprToBasisPoints(value.postApr)/100,note:text(value.note??"",500,"promotion note")};
}

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
  const supported = new Set(["schemaVersion", "name", "balance", "apr", "creditLimit", "entryMethod", "availableCredit", "balanceObservedAt", "updatedAt", "effectiveDate", "status", "archived", "note", "reason", "deletedAt","statement","promotion","rateBasis","interestScenario","provisional"]);
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
  const interestScenario=raw.interestScenario??entryMethod==="direct";
  if(typeof interestScenario!=="boolean"||typeof (raw.provisional??false)!=="boolean")throw new TypeError("Invalid scenario flags.");
  return {
    schemaVersion: ACCOUNT_SCHEMA_VERSION, ...common, entryMethod, availableCredit,
    balanceObservedAt: timestamp(raw.balanceObservedAt),
    updatedAt: timestamp(raw.updatedAt),
    effectiveDate: raw.effectiveDate == null ? null : dateOnly(raw.effectiveDate),
    status: choice(raw.status ?? "unknown", ["open", "closed", "unknown"], "issuer status"),
    archived,
    deletedAt:timestamp(raw.deletedAt),
    statement:statement(raw.statement),promotion:promotion(raw.promotion),
    rateBasis:choice(raw.rateBasis??"single",["single","mixed","unknown"],"APR coverage"),interestScenario,provisional:raw.provisional??false,
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
