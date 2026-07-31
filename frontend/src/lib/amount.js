/**
 * Convert a human-readable decimal amount to token smallest units (BigInt).
 * Uses string math only — no floating-point arithmetic.
 */
export function parseTokenAmount(input, decimals = 7) {
  const trimmed = String(input).trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Invalid amount.');
  }

  const [whole, frac = ''] = trimmed.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  const paddedFrac = frac.padEnd(decimals, '0');
  const combined = `${whole}${paddedFrac}`.replace(/^0+(?=\d)/, '') || '0';
  const value = BigInt(combined);

  if (value <= 0n) {
    throw new Error('Enter an amount greater than zero.');
  }

  return value;
}

/** Format token smallest units for display (e.g. stroops → XLM). */
export function formatTokenAmount(units, decimals = 7) {
  const raw = BigInt(units);
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  const frac = abs % base;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const formatted = fracStr ? `${whole}.${fracStr}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}
