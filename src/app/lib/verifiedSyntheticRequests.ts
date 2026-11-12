/** Exact, reviewed acceptance receipts only. Never classify by customer-supplied text.
 * Add future authorized acceptance IDs here after checking the saved receipt and links.
 * Display filtering only: records, audit, direct links and financials remain intact.
 */
export const syntheticBusinessId = 'f31adfa1-26ad-4e74-ad94-a4668d7ad57d';
export const verifiedSyntheticRequests = [
  {id:'e31ed066-b467-4696-abca-4d6c046e6722', evidence:'REQ-a3ad7c40ed00499eb2c60e09cb62fe44: explicit Stage B acceptance-only instructions'},
  {id:'9b5cf022-33ed-4136-b89b-5698f738da63', evidence:'scheduling-notifications/notification-acceptance.json'},
  {id:'c27947e5-168e-4876-8110-620f8662a190', queueId:'0a947bc1-802a-430f-8bb6-a0659783a125', evidence:'docs/handoffs/SERVICE_WORKFLOW_ACTIVE.md'},
  {id:'531a5c52-c100-4655-8792-fcaed3f58b10', evidence:'REQ-7e93ca77a92d4c239f4aebc493b842d2: explicit authorized branding acceptance, no conversion instructions'},
  {id:'ab9da6ac-9f1e-42f6-b76c-d01758a9393c', evidence:'docs/handoffs/QR_PRODUCTION_APPROVAL_PREPARATION.md'},
  {id:'bb74c3f6-647f-4303-9805-a0812424855d', queueId:'941cddc4-3b83-437f-8b4c-2094f376c83a', evidence:'docs/handoffs/QR_PRODUCTION_APPROVAL_PREPARATION.md'},
  {id:'db884fb9-f089-4ee5-8642-468c88dfb837', evidence:'docs/handoffs/OFFICE_COUPON_INTAKE_ACTIVE.md'},
  {id:'e1e4090c-221b-47c9-b8d0-d3defd340803', queueId:'da8194a0-6701-460b-829b-e7c5e7bad9b3', evidence:'docs/handoffs/OFFICE_COUPON_INTAKE_ACTIVE.md'},
  {id:'9655234a-9876-4f66-b6aa-848cb7bc30d4', evidence:'REQ-1d25b1bbbb034fe898c5d7060cd96e55: shared manager availability acceptance'},
  {id:'2cdb9bcb-a429-43fb-9eb5-07b212a4f6b6', evidence:'REQ-83dbdc11664649cfa759a112ce596493: shared manager availability acceptance'},
] as const;
export function syntheticRequestIds(businessId:string){return businessId===syntheticBusinessId?verifiedSyntheticRequests.map(r=>r.id):[];}
export function isVerifiedSyntheticRequest(businessId:string,id:string){return syntheticRequestIds(businessId).some(value=>value===id);}
export function isVerifiedSyntheticQueue(businessId:string,id:string){return businessId===syntheticBusinessId&&verifiedSyntheticRequests.some(r=>'queueId' in r&&r.queueId===id);}
