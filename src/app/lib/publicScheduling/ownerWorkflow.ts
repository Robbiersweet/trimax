import { randomUUID } from 'node:crypto';
import { readFile, writeFile, readdir, rename, unlink, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { devStoreDirectory } from './developmentStore.ts';
import { isIntakeRole, type PublicServiceRequest, type RequestStatus } from './domain.ts';

export const requestStatuses: RequestStatus[] = ['pending_confirmation','reviewing','approved','needs_information','rejected','cancelled'];
export type ReviewChange = { requestId: string; expectedRevision: number; mutationId: string; status: RequestStatus; note: string };
export function validateReviewChange(value: unknown): ReviewChange {
  if (!value || typeof value !== 'object') throw Error('Invalid review update.');
  const x = value as Record<string,unknown>;
  if (Object.keys(x).some(key => !['requestId','expectedRevision','mutationId','status','note'].includes(key)) || typeof x.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(x.requestId) || !Number.isSafeInteger(x.expectedRevision) || Number(x.expectedRevision)<0 || typeof x.mutationId !== 'string' || !/^[a-z0-9-]{16,100}$/i.test(x.mutationId) || !requestStatuses.includes(x.status as RequestStatus) || typeof x.note !== 'string' || x.note.length>2000) throw Error('Invalid review update.');
  return x as ReviewChange;
}
export async function updateDevelopmentRequest(businessId: string, actor: {id:string;role:string}, value: unknown, directory=devStoreDirectory()) {
  if (!isIntakeRole(actor.role)) throw Error('Owner/admin required.');
  const change = validateReviewChange(value);
  await mkdir(directory,{recursive:true,mode:0o700});
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const file=join(/* turbopackIgnore: true */ directory,name);
    const record=JSON.parse(await readFile(file,'utf8'));
    if(record.request.id!==change.requestId || record.request.businessId!==businessId) continue;
    const lock=file+'.lock'; await writeFile(lock,'review',{flag:'wx',mode:0o600});
    try {
      const current=JSON.parse(await readFile(file,'utf8'));
      const request=current.request as PublicServiceRequest;
      const prior=request.activity?.find(event=>event.id===change.mutationId);
      if(prior){if(prior.to!==change.status||(prior.note??'')!==change.note.trim())throw Error('Review key already used for different content.');return request;}
      if((request.revision??0)!==change.expectedRevision) throw Error('Request changed. Reload before saving.');
      if(['rejected','cancelled'].includes(request.status)&&change.status!==request.status)throw Error('Terminal request cannot be reopened.');
      const activity={id:change.mutationId,at:new Date().toISOString(),actor:actor.id,event:'review_updated',from:request.status,to:change.status,...(change.note.trim()?{note:change.note.trim()}:{})};
      request.activity=[...(request.activity??[]),activity]; request.revision=(request.revision??0)+1;
      request.status=change.status; request.internalNotes=[request.internalNotes,change.note.trim()].filter(Boolean).join('\n');
      const temporary=file+'.tmp-'+randomUUID(); await writeFile(temporary,JSON.stringify(current),{flag:'wx',mode:0o600}); await rename(temporary,file);
      return request;
    } finally {await unlink(lock);}
  }
  throw Error('Request not found.');
}
