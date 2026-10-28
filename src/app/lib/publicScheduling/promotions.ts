export const winterPromotions = {
 WINTER25: {label:'$25 off sprinkler blowout service',terms:'One coupon per customer/property; scope and pricing confirmed.'},
 WINTER100: {label:'$100 off projects of $1,000 or more',terms:'One coupon per customer/property; scope and pricing confirmed.'},
} as const;
export type WinterPromotionCode = keyof typeof winterPromotions;
export function winterPromotionCode(value:unknown):WinterPromotionCode|undefined {
 if(typeof value!=='string')return;
 const code=value.trim().toUpperCase();
 return Object.hasOwn(winterPromotions,code)?code as WinterPromotionCode:undefined;
}
export function promotionRequestNote(code:WinterPromotionCode){
 return `Promotion requested: ${code} — ${winterPromotions[code].label}. Eligibility and pricing require owner review; no discount has been applied.`;
}
export function withPromotionNote(notes:string,code:WinterPromotionCode){
 const prefix=promotionRequestNote(code);
 return notes===prefix||notes.startsWith(prefix+'\n')?notes:prefix+(notes?'\n'+notes:'');
}
