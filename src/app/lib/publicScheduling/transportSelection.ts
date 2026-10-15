// Production selection is deliberately closed until a separately reviewed release.
// An environment typo or unsupported direct selection must never fall back to JWT.
export const reviewedDirectReleaseApproved=false;
export function assertSchedulingTransport(value:string|undefined){
 if(value===undefined||value==='static-jwt')return 'static-jwt' as const;
 if(value==='direct-postgres')throw Error('DIRECT_RELEASE_NOT_APPROVED');
 throw Error('UNKNOWN_SCHEDULING_TRANSPORT');
}
