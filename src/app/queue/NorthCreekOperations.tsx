import Link from 'next/link';
import {createSupabaseServerClient} from '../lib/supabaseServer';
import {isVerifiedSyntheticQueue,isVerifiedSyntheticRequest} from '../lib/verifiedSyntheticRequests';
import {businessDate,classifyOperation,operationGroups,type OperationJob,type OperationGroup} from '../lib/northCreekOperations';

/** Read-only owner view inside Work Queue. All queries use caller cookies and RLS. */
export default async function NorthCreekOperations({businessId,businessSlug,group}:{businessId:string;businessSlug:string;group?:string}){
 const db=await createSupabaseServerClient();
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return <p>Sign in as the workspace owner to view operations.</p>;
 const membership=await db.from('business_users').select('role').eq('business_id',businessId).eq('user_id',user.id);
 if(membership.error||!membership.data?.some(row=>row.role==='owner'))return <p>This operations view requires the workspace owner.</p>;
 const [queue,requests,sessions]=await Promise.all([
  db.from('queue_items').select('id,property,unit,status,ready_date,completed_date,source_request_id,linked_estimate_id').eq('business_id',businessId).eq('property','North Creek Apartments'),
  db.from('public_service_requests').select('id,status,integration_references,preferred_date,queue_item_id').eq('business_id',businessId),
  db.from('job_sessions').select('queue_item_id,started_at,ended_at').eq('business_id',businessId),
 ]);
 if(queue.error||requests.error||sessions.error)return <p role="alert">Operations could not be loaded. No empty counts are shown. Reopen the Queue after checking your session.</p>;
 // Optional progress columns are not installed in every workspace. Missing means unknown.
 const progress=await db.from('queue_items').select('id,progress_stage,percent_complete,projected_completion_date,delay_reason').eq('business_id',businessId).eq('property','North Creek Apartments');
 if(progress.error&&progress.error.code!=='42703')return <p role="alert">Progress information could not be checked. Reopen the Queue.</p>;
 const progressById=new Map((progress.data??[]).map(row=>[row.id,row]));
 const estimateIds=(queue.data??[]).map(row=>row.linked_estimate_id).filter((id):id is string=>Boolean(id));
 const approvals=estimateIds.length?await db.from('estimates').select('id,status').eq('business_id',businessId).in('id',estimateIds):{data:[],error:null};
 if(approvals.error)return <p role="alert">Approval information could not be checked. Reopen the Queue.</p>;
 const approvedEstimates=new Set((approvals.data??[]).filter(row=>['approved','accepted'].includes(row.status?.toLowerCase())).map(row=>row.id));
 const today=businessDate();
 type Entry={id:string;unit:string;status:string;needed:string|null;next:string;groups:OperationGroup[];href:string;kind:string;detail?:string};
 const entries:Entry[]=[];
 const requestRows=(requests.data??[]).filter(row=>!isVerifiedSyntheticRequest(businessId,row.id));
 for(const row of queue.data??[]){
  if(isVerifiedSyntheticQueue(businessId,row.id))continue;
  const linked=requestRows.find(r=>r.id===row.source_request_id||r.queue_item_id===row.id);
  const work=(sessions.data??[]).filter(s=>s.queue_item_id===row.id);
  const state=classifyOperation({...row,...progressById.get(row.id)} as OperationJob,{today,approved:linked?.status==='approved'||approvedEstimates.has(row.linked_estimate_id)||row.status?.toLowerCase()==='approved',active:work.some(s=>!s.ended_at),worked:work.length>0});
  entries.push({id:row.id,unit:row.unit||'Unit not recorded',status:state.status,needed:state.needed,next:state.next,groups:state.groups,href:`/queue/${encodeURIComponent(row.id)}?business=${encodeURIComponent(businessSlug)}`,kind:linked?.integration_references?.apartmentTurn?'Apartment turn':'Queue work',detail:state.complete&&!state.finished?'Completion date not recorded':progressById.get(row.id)?.delay_reason||undefined});
 }
 for(const row of requestRows){
  const refs=row.integration_references;
  if(!refs||typeof refs!=='object'||!refs.apartmentTurn||refs.property!=='North Creek Apartments'||['rejected','cancelled'].includes(row.status))continue;
  if((queue.data??[]).some(q=>q.id===row.queue_item_id||q.source_request_id===row.id))continue;
  const timing=classifyOperation({id:row.id,unit:null,status:null,ready_date:row.preferred_date,completed_date:null},{today});
  entries.push({id:row.id,unit:typeof refs.propertyUnit==='string'?refs.propertyUnit:'Unit not recorded',status:row.status.replaceAll('_',' '),needed:row.preferred_date||null,next:row.status==='approved'?'Review approved request and convert once to Queue':'Review request and confirm apartment-turn details',groups:[row.status==='approved'?'Approved, awaiting work':'Awaiting approval',...timing.groups.filter(g=>g==='Needed within 7 days'||g==='Overdue / delayed')],href:`/admin/service-requests?business=${encodeURIComponent(businessSlug)}&request=${row.id}`,kind:'Apartment turn request'});
 }
 const selected=operationGroups.find(value=>value===group);
 const visible=entries.filter(e=>selected?e.groups.includes(selected):!e.groups.includes('Earlier completion / date unknown')).sort((a,b)=>(a.needed||'9999').localeCompare(b.needed||'9999')||a.unit.localeCompare(b.unit));
 const base=`/queue?business=${encodeURIComponent(businessSlug)}&view=operations`;
 return <section className="space-y-4" aria-label="North Creek operations"><header><h2 className="text-2xl font-bold">North Creek operations</h2><p className="text-sm text-zinc-300">Owner view · {today} Pacific · recorded Queue work and apartment-turn requests</p><p className="text-sm text-zinc-400">Needed soon: next 7 days. Recent completion: past 30 days with a recorded date. Categories can overlap. Invoicing does not mark work complete.</p>{progress.error&&<p className="text-sm text-amber-200">Detailed progress and blocker fields are not installed. Status, completion dates and Job Sessions are shown where recorded; interruptions are not inferred.</p>}</header><nav className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Operations categories"><Link className="rounded-xl border p-3" aria-current={!selected?'page':undefined} href={base}>Active and recent ({entries.filter(e=>!e.groups.includes('Earlier completion / date unknown')).length})</Link>{operationGroups.map(value=><Link className="rounded-xl border p-3" aria-current={selected===value?'page':undefined} key={value} href={`${base}&group=${encodeURIComponent(value)}`}>{value} ({entries.filter(e=>e.groups.includes(value)).length})</Link>)}</nav>{visible.length===0?<p className="rounded-xl border p-4">No matching recorded work. Missing information is not treated as completed or approved.</p>:<ul className="grid gap-3 sm:grid-cols-2">{visible.map(entry=><li key={entry.id} className="rounded-xl border border-zinc-600 p-4"><p className="text-xs text-zinc-400">{entry.kind}</p><h3 className="text-xl font-bold">{entry.unit}</h3><p>Status: {entry.status}</p><p>Needed by: {entry.needed||'Not recorded'}</p>{entry.detail&&<p>{entry.detail}</p>}<p className="mt-2">Next: {entry.next}</p><Link className="mt-3 inline-block underline" href={entry.href}>Open existing {entry.kind==='Apartment turn request'?'request':'Queue item'} →</Link></li>)}</ul>}<Link className="inline-block underline" href={`/queue?business=${encodeURIComponent(businessSlug)}&property=north-creek-apartments`}>Back to North Creek Queue</Link></section>;
}
