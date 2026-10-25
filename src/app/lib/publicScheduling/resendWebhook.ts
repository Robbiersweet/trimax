import {createHmac,timingSafeEqual} from 'node:crypto';
export function verifyResendWebhook(body:string,headers:Headers,secret:string,now=Date.now()){
 const id=headers.get('svix-id'),timestamp=headers.get('svix-timestamp'),signatures=headers.get('svix-signature');
 if(!id||id.length>200||!timestamp||!/^\d+$/.test(timestamp)||Math.abs(now/1000-Number(timestamp))>300||!signatures||signatures.length>2000||!/^whsec_[A-Za-z0-9+/=]+$/.test(secret))return false;
 const expected=createHmac('sha256',Buffer.from(secret.slice(6),'base64')).update(`${id}.${timestamp}.${body}`).digest();
 return signatures.split(' ').some(part=>{if(!part.startsWith('v1,'))return false;const got=Buffer.from(part.slice(3),'base64');return got.length===expected.length&&timingSafeEqual(got,expected);});
}
