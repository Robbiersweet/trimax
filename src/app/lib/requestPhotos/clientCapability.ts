/** Browser-only memory capability. Never put secret in URLs, storage, or intake payloads. */
export async function createPhotoCapability(cryptoApi:Crypto=globalThis.crypto){
 const bytes=cryptoApi.getRandomValues(new Uint8Array(32));
 const secret=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(secret));
 return Object.freeze({secret,uploadCapabilityHash:Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')});
}
export function photoIntakePayload<T extends object>(payload:T,capability:{uploadCapabilityHash:string}){
 if(!/^[a-f0-9]{64}$/.test(capability.uploadCapabilityHash))throw Error('Invalid photo capability hash');
 return {...payload,uploadCapabilityHash:capability.uploadCapabilityHash};
}
