// Query at action time: the server-rendered session prop may predate Start Session.
export async function assertNoActiveJobSession(read:()=>PromiseLike<{count:number|null;error:unknown}>,businessId?:string|null){
 if(!businessId)throw new Error('Unable to verify Job Sessions. Reload the job before marking it complete.');
 const result=await read();
 if(result.error||result.count===null)throw new Error('Unable to verify Job Sessions. Reload the job before marking it complete.');
 if(result.count>0)throw new Error('Finish the active Job Session before marking this job complete.');
}
