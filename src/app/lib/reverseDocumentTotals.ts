import { moneyCents, multiplyMoney, sumMoney } from "./money.ts";
import { calculateDiscountedDocumentTotals, type DiscountDraft } from "./documentDiscounts.ts";
export type ReverseTotalLineItem = {
    description: string;
    quantity: string | number;
    unitPrice: string | number;
};
export type ReverseTotalResult = {
    ok: true;
    selectedLineIndex: number;
    unitPrice: string;
    lineTotal: number;
    subtotal: number;
    taxAmount: number;
    discountAmount: number;
    total: number;
} | {
    ok: false;
    message: string;
};
// Search the exact four-decimal unit rate that will actually be saved. Every
// trial extends and rounds the line with the same calculator as the editor.
export function reverseCalculateFinalTotal({ desiredTotal, lineItems, selectedLineIndex, taxRate, discount = { enabled: false, type: "fixed", value: 0 } }: {
    desiredTotal: string | number;
    lineItems: ReverseTotalLineItem[];
    selectedLineIndex: number;
    taxRate: number;
    discount?: DiscountDraft;
}): ReverseTotalResult {
    const fail = (message: string): ReverseTotalResult => ({ ok: false, message });
    let target: number;
    try {
        target = moneyCents(desiredTotal);
    }
    catch {
        return fail("Enter a valid final total.");
    }
    if (target <= 0)
        return fail("Enter a final total greater than $0.00.");
    if (!lineItems.length)
        return fail("Add a line item before reverse calculating.");
    const selected = lineItems[selectedLineIndex];
    if (!selected)
        return fail("Choose the line item Trimax should adjust.");
    if (!Number.isFinite(Number(selected.quantity)) || Number(selected.quantity) <= 0)
        return fail("The adjustable line needs a quantity greater than zero.");
    const other = sumMoney(lineItems.filter((_, i) => i !== selectedLineIndex).map(item => multiplyMoney(item.quantity, item.unitPrice)));
    const rate = (units: number) => { const whole = Math.floor(units / 10000), fraction = String(units % 10000).padStart(4, "0"); return (whole + "." + fraction).replace(/\.?0+$/, ""); };
    const evaluate = (units: number) => { const lineTotal = multiplyMoney(selected.quantity, rate(units)); const totals = calculateDiscountedDocumentTotals({ lineSubtotal: sumMoney([other, lineTotal]), taxRate, discount }); return { lineTotal, totals, cents: moneyCents(totals.total) }; };
    let high = Math.max(target * 100, 10000);
    while (evaluate(high).cents < target && high < 1000000000)
        high *= 2;
    if (evaluate(high).cents < target)
        return fail("That total is outside the supported price range.");
    let low = 0;
    while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (evaluate(mid).cents < target)
            low = mid + 1;
        else
            high = mid;
    }
    const result = evaluate(low);
    if (result.cents !== target)
        return fail("Trimax could not land exactly on that final total with the selected line.");
    return { ok: true, selectedLineIndex, unitPrice: rate(low), lineTotal: result.lineTotal, subtotal: result.totals.lineSubtotal, taxAmount: result.totals.taxAmount, discountAmount: result.totals.discountAmount, total: result.totals.total };
}
