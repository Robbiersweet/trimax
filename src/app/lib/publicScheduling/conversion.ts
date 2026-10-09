export type ConversionPlan={requestId:string;businessId:string;idempotencyKey:string;approvedBy:string;client:{kind:'attach';clientId:string}|{kind:'create_after_review';verifiedName:string};target:'queue'|'job'};
export type ConversionReceipt={requestId:string;businessId:string;clientId:string;queueItemId?:string;jobId?:string;activityId:string;idempotencyKey:string};
/** Future adapter must lock source request, recheck approved state and membership,
 * validate every existing relationship's tenant, create all records + audit event
 * atomically, and return the existing receipt on identical replay. Any failure
 * rolls back the entire transaction; changed-payload replay must fail. */
export interface ApprovedRequestConversion {convert(plan:ConversionPlan):Promise<ConversionReceipt>}
export function validateConversionPlan(plan:ConversionPlan){return Boolean(plan.requestId&&plan.businessId&&plan.approvedBy&&plan.idempotencyKey.length>=16&&(plan.target==='queue'||plan.target==='job')&&(plan.client.kind==='attach'?plan.client.clientId:plan.client.verifiedName.trim()));}
export const disabledConversion:ApprovedRequestConversion={async convert(){throw new Error('Public request conversion is not enabled');}};
