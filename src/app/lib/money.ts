/** USD money contract: decimal half away from zero, integer cents internally.
 * Round each extended line once; sum line cents; round discount and document tax
 * once; add/subtract cents. Numbers/legacy currency strings are boundary inputs.
 * BigInt intermediates prevent binary multiplication and unsafe-integer loss.
 */
export type MoneyInput = string | number | null | undefined;
function decimal(input: MoneyInput): [
    bigint,
    bigint
] {
    if (input == null || input === "")
        return [0n, 1n];
    if (typeof input === "number" && !Number.isFinite(input))
        throw Error("Money must be finite");
    const text = String(input).trim().replace(/[$,\s]/g, "");
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !(match[2] || match[3]))
        throw Error("Invalid decimal money");
    const exponent = Number(match[4] || 0) - (match[3]?.length || 0);
    if (Math.abs(exponent) > 100)
        throw Error("Money precision out of range");
    let numerator = BigInt((match[2] || "0") + (match[3] || ""));
    if (match[1] === "-")
        numerator = -numerator;
    return exponent >= 0 ? [numerator * 10n ** BigInt(exponent), 1n] : [numerator, 10n ** BigInt(-exponent)];
}
function rounded(n: bigint, d: bigint): number {
    const magnitude = n < 0n ? -n : n;
    const value = (magnitude + d / 2n) / d * (n < 0n ? -1n : 1n);
    const result = Number(value);
    if (!Number.isSafeInteger(result))
        throw Error("Money exceeds safe cent range");
    return result;
}
export function moneyCents(input: MoneyInput): number {
    const [n, d] = decimal(input);
    return rounded(n * 100n, d);
}
export function centsToMoney(cents: number): number {
    if (!Number.isSafeInteger(cents))
        throw Error("Expected integer cents");
    return cents / 100;
}
export function roundMoney(input: MoneyInput): number { return centsToMoney(moneyCents(input)); }
export function sumMoney(inputs: readonly MoneyInput[]): number {
    return centsToMoney(rounded(inputs.reduce<bigint>((sum, value) => sum + BigInt(moneyCents(value)), 0n), 1n));
}
/** Round once at a document boundary, e.g. sum raw imported tax observations.
 * Booked line amounts must instead use sumMoney so each line remains cents.
 */
export function roundDecimalSum(inputs: readonly MoneyInput[]): number {
    let numerator = 0n, denominator = 1n;
    for (const input of inputs) {
        const [n, d] = decimal(input);
        if (d > denominator) {
            numerator *= d / denominator;
            denominator = d;
        }
        numerator += n * (denominator / d);
    }
    return centsToMoney(rounded(numerator * 100n, denominator));
}
export function subtractMoney(a: MoneyInput, b: MoneyInput): number { return centsToMoney(moneyCents(a) - moneyCents(b)); }
export function multiplyMoney(quantity: MoneyInput, unitPrice: MoneyInput): number {
    const [a, ad] = decimal(quantity), [b, bd] = decimal(unitPrice);
    return centsToMoney(rounded(a * b * 100n, ad * bd));
}
export function percentCents(cents: number, percentage: MoneyInput): number {
    if (!Number.isSafeInteger(cents))
        throw Error("Expected integer cents");
    const [n, d] = decimal(percentage);
    return rounded(BigInt(cents) * n, d * 100n);
}
export function percentMoney(amount: MoneyInput, percentage: MoneyInput): number {
    return centsToMoney(percentCents(moneyCents(amount), percentage));
}
/** Imported tax amounts are authoritative. Do not truncate a reconstructed
 * rate to four decimals and silently change its tax by a cent. Verify the
 * numeric storage adapter reproduces the imported integer tax exactly.
 */
export function taxRateForAmounts(subtotal: MoneyInput, tax: MoneyInput): number {
    const base = moneyCents(subtotal), taxValue = moneyCents(tax);
    if (base <= 0) {
        if (taxValue !== 0)
            throw Error("Tax requires a positive subtotal");
        return 0;
    }
    if (taxValue < 0)
        throw Error("Negative imported tax requires review");
    const scale = 10n ** 18n;
    const scaled = BigInt(taxValue) * 100n * scale / BigInt(base);
    const rate = Number(`${scaled / scale}.${String(scaled % scale).padStart(18, "0")}`);
    if (percentCents(base, rate) !== taxValue)
        throw Error("Imported tax cannot be represented safely; review required");
    return rate;
}
export function moneyFixed(amount: MoneyInput): string {
    const cents = moneyCents(amount), absolute = Math.abs(cents);
    return `${cents < 0 ? "-" : ""}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}
export function formatMoney(amount: MoneyInput): string {
    const fixed = moneyFixed(amount);
    return fixed.startsWith("-") ? `-$${fixed.slice(1)}` : `$${fixed}`;
}
