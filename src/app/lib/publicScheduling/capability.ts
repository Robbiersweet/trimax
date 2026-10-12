import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
export function createStatusCapability(){const token=randomBytes(32).toString('base64url');return {token,hash:hashStatusCapability(token)};}
export function hashStatusCapability(token:string){if(!/^[A-Za-z0-9_-]{43}$/.test(token))throw new Error('Invalid status capability');return createHash('sha256').update(token).digest('hex');}
export function verifyStatusCapability(token:string,expectedHash:string,expiresAt:string,now=new Date()){try{if(!/^[a-f0-9]{64}$/.test(expectedHash)||!Number.isFinite(Date.parse(expiresAt))||now.getTime()>=Date.parse(expiresAt))return false;return timingSafeEqual(Buffer.from(hashStatusCapability(token),'hex'),Buffer.from(expectedHash,'hex'));}catch{return false;}}
export type CustomerRequestStatus='received'|'under_review'|'confirmed'|'needs_information'|'cancelled';
export function publicStatusProjection(request:{reference:string;status:string;submittedAt:string;confirmationStatus?:string}){
 const states:Record<string,CustomerRequestStatus>={pending_confirmation:'received',reviewing:'under_review',approved:'under_review',needs_information:'needs_information',cancelled:'cancelled',rejected:'cancelled'};
 return {reference:request.reference,status:request.status==='approved'&&request.confirmationStatus==='confirmed'?'confirmed':states[request.status]??'under_review',submittedAt:request.submittedAt};
}
