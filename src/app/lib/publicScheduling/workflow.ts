export type WorkflowAction='convert'|'approve_queue'|'schedule'|'approve_schedule'|'cancel_appointment';
export type WorkflowChange={requestId:string;expectedRevision:number;mutationId:string;action:WorkflowAction;clientId:string|null;start:string|null;minutes:number|null;bufferBefore?:number;bufferAfter?:number;kind?:'job'|'site_visit';conflictReason?:string|null};
export type WorkflowContext={blocks?:{id:string;starts_at:string;ends_at:string;label:string}[];delivery?:{channel:string;event_type:string;status:string;attempts:number;last_error_code:string|null}[];clients:{id:string;name:string;email:string|null;phone:string|null}[];queue:{id:string;property:string;scheduled_date:string|null;appointment_start:string|null;appointment_end:string|null}[];linked:{appointment_revision?:number;appointment_status?:string;appointment_previous_start?:string|null;appointment_previous_end?:string|null;appointment_changed_at?:string|null;id:string;request_client_id:string|null;appointment_start:string|null;appointment_end:string|null}|null};
export function validateWorkflowChange(input:unknown):WorkflowChange{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid workflow action');
 const r=input as Record<string,unknown>;
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 if(Object.keys(r).some(k=>!['requestId','expectedRevision','mutationId','action','clientId','start','minutes','conflictReason','bufferBefore','bufferAfter','kind'].includes(k))||!uuid(r.requestId)||!Number.isInteger(r.expectedRevision)||Number(r.expectedRevision)<1||typeof r.mutationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(r.mutationId)||!['convert','approve_queue','schedule','approve_schedule','cancel_appointment'].includes(String(r.action))||(r.clientId!==null&&!uuid(r.clientId)))throw Error('Invalid workflow action');
 if(['schedule','approve_schedule'].includes(String(r.action))){if(typeof r.start!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(r.start)||!Number.isFinite(Date.parse(r.start))||!Number.isInteger(r.minutes)||Number(r.minutes)<15||Number(r.minutes)>10080)throw Error('Choose a start time and duration');}
 else if(r.start!==null||r.minutes!==null)throw Error('Unexpected appointment fields');
 if(r.conflictReason!=null&&(typeof r.conflictReason!=='string'||r.conflictReason.trim().length<5||r.conflictReason.length>500||!['schedule','approve_schedule'].includes(String(r.action))))throw Error('Provide a conflict override reason of 5 to 500 characters');
 for(const key of ['bufferBefore','bufferAfter'])if(r[key]!==undefined&&(!Number.isInteger(r[key])||Number(r[key])<0||Number(r[key])>240))throw Error('Buffers must be 0 to 240 minutes');
 if(r.kind!==undefined&&!['job','site_visit'].includes(String(r.kind)))throw Error('Invalid appointment kind');
 return r as WorkflowChange;
}
/** Convert a wall-clock choice in the workspace timezone, rejecting DST gaps/ambiguity. */
export function appointmentInstant(date:string,time:string,zone:string){
 if(!/^\d{4}-\d\d-\d\d$/.test(date)||!/^\d\d:\d\d$/.test(time))throw Error('Choose a date and time');
 const base=Date.parse(`${date}T${time}:00Z`);if(!Number.isFinite(base))throw Error('Invalid date');
 const format=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const matches:string[]=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){const candidate=new Date(base+offset*60000);if(format.format(candidate)===`${date} ${time}`)matches.push(candidate.toISOString());}
 if(matches.length!==1)throw Error('That local time is unavailable or ambiguous due to daylight saving time. Choose another time.');
 return matches[0];
}
