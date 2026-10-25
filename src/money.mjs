// Money enters through this boundary; calculations use cents, never formatted strings.
export const MAX_MONEY_CENTS = 999_999_999_999;

export function moneyToCents(value, { signed = false } = {}) {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new TypeError("Enter a monetary amount.");
  }
  if (typeof value === "string") {
    value = value.trim();
    // Explicit US decimal input. Reject separators, exponents and partial numbers.
    const pattern = signed ? /^-?(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/ : /^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/;
    if (!pattern.test(value)) throw new TypeError("Use a decimal amount with at most two decimal places.");
    const negative = value.startsWith("-");
    const [whole, fraction = ""] = value.replace(/^-/, "").split(".");
    const cents = Number(whole || "0") * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(cents) || cents > MAX_MONEY_CENTS) throw new RangeError("Amount is too large.");
    return cents === 0 ? 0 : negative ? -cents : cents;
  }
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(cents) || Math.abs(cents) > MAX_MONEY_CENTS || (!signed && value < 0)) {
    throw new RangeError("Enter a finite monetary amount within the supported range.");
  }
  // Permit floating-point representation noise, but not fractional cents.
  if (Math.abs(value * 100 - cents) > 0.000001) throw new RangeError("Use at most two decimal places.");
  return cents === 0 ? 0 : cents;
}

export function centsToMoney(cents) {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_MONEY_CENTS) throw new RangeError("Invalid cents.");
  return cents / 100;
}

export function aprToBasisPoints(value) {
  const points = moneyToCents(value);
  if (points > 9999) throw new RangeError("Enter an APR between 0 and 99.99.");
  return points;
}

export function estimateBalance(limit, available) {
  const limitCents = moneyToCents(limit);
  const availableCents = moneyToCents(available);
  const difference = limitCents - availableCents;
  return {
    balanceCents: Math.max(0, difference),
    availableExceedsLimit: difference < 0,
    atCapacity: availableCents === 0,
    utilization: limitCents > 0 ? Math.max(0, difference) / limitCents * 100 : null,
  };
}

// Targets are planning goals, not credit-score thresholds. Strictly below is optional.
export function paymentToTarget(balance, limit, target, { below = false } = {}) {
  const balanceCents = moneyToCents(balance);
  const limitCents = moneyToCents(limit);
  const percentPoints = moneyToCents(target);
  if (percentPoints > 10000) throw new RangeError("Target must be between 0 and 100 percent.");
  if (limitCents === 0) return null;
  if (below && percentPoints === 0) return null;
  const product = BigInt(limitCents) * BigInt(percentPoints);
  const targetCents = Number((below ? product - 1n : product) / 10000n);
  return Math.max(0, balanceCents - targetCents);
}

export function balanceChange(start, end) {
  if (start == null || end == null) return null;
  const startCents = moneyToCents(start);
  const endCents = moneyToCents(end);
  const changeCents = endCents - startCents;
  return {
    startCents, endCents, changeCents,
    direction: changeCents > 0 ? "increase" : changeCents < 0 ? "reduction" : "unchanged",
    percentage: startCents === 0 ? null : changeCents / startCents * 100,
  };
}
