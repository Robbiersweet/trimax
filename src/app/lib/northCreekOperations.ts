export const operationGroups = ['Awaiting approval','Approved, awaiting work','Underway','Needed within 7 days','Overdue / delayed','Blocked / waiting','Recently completed','Other recorded work','Earlier completion / date unknown'] as const;
export type OperationGroup = typeof operationGroups[number];
export type OperationJob = {id:string;unit:string|null;status:string|null;ready_date:string|null;completed_date:string|null;progress_stage?:string|null;percent_complete?:number|null;projected_completion_date?:string|null;delay_reason?:string|null};
export function businessDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
function date(value:string|null|undefined){return value&&/^\d{4}-\d{2}-\d{2}$/.test(value.slice(0,10))?value.slice(0,10):null;}
export function classifyOperation(job:OperationJob,{today,approved=false,active=false,worked=false}:{today:string;approved?:boolean;active?:boolean;worked?:boolean}){
 const status=job.status?.trim().toLowerCase(),progress=job.progress_stage?.trim().toLowerCase();
 const complete=Boolean(job.completed_date)||status==='completed'||progress==='complete';
 const needed=date(job.ready_date),finished=date(job.completed_date),projected=date(job.projected_completion_date);
 const days=(value:string)=>Math.round((Date.parse(value+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 const blocked=progress==='blocked / waiting';
 const started=active||worked||(job.percent_complete??0)>0||Boolean(progress&&!['not started','walked / reviewed','blocked / waiting'].includes(progress))||status==='in progress';
 const groups:OperationGroup[]=[];
 if(complete){if(finished&&days(finished)>=-30&&days(finished)<=0)groups.push('Recently completed');else groups.push('Earlier completion / date unknown');}
 else {
  if(blocked)groups.push('Blocked / waiting');
  if(started)groups.push('Underway');
  if(approved&&!started&&!blocked)groups.push('Approved, awaiting work');
  if(needed&&days(needed)>=0&&days(needed)<=7)groups.push('Needed within 7 days');
  if((needed&&needed<today)||job.delay_reason?.trim()||(needed&&projected&&projected>needed))groups.push('Overdue / delayed');
 }
 if(!groups.length)groups.push('Other recorded work');
 const next=complete?'Review recorded completion':blocked?'Resolve the recorded blocker':job.delay_reason?.trim()?'Review recorded delay':needed&&needed<today?'Review overdue work and confirm a new plan':active?'Review active Job Session':started?'Confirm remaining work and next visit':approved?'Plan work in the Queue':'Review details; approval is not recorded';
 return {groups,complete,needed,finished,next,status:job.progress_stage||job.status||'Status not recorded'};
}
