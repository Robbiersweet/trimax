import {PHOTO_LIMITS} from './server.ts';
export async function boundedPhotoBody(request:Request){
 const declared=request.headers.get('content-length');if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>PHOTO_LIMITS.inputBytes))throw Error('Photo size rejected');
 if(!request.body)throw Error('Photo required');const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;void reader.cancel();},15000);let complete=false;
 try{while(true){const result=await reader.read();if(result.done){complete=true;break;}length+=result.value.byteLength;if(length>PHOTO_LIMITS.inputBytes){await reader.cancel();throw Error('Photo size rejected');}chunks.push(result.value);}if(timedOut||!length||!complete||(declared!==null&&Number(declared)!==length))throw Error('Photo incomplete');return Buffer.concat(chunks);}
 finally{clearTimeout(timer);reader.releaseLock();}
}
