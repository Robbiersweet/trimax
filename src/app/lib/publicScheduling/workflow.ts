export type WorkflowAction='convert'|'schedule'|'approve_schedule'|'cancel_appointment';
export type WorkflowChange={requestId:string;expectedRevision:number;mutationId:string;action:WorkflowAction;clientId:string|null;start:string|null;minutes:number|null;conflictReason?:string|null;propertyId?:string|null;unitId?:string|null;propertyName?:string|null;unitLabel?:string|null;noUnit?:boolean};
export type WorkflowContext={properties?:{id:string;name:string}[];units?:{id:string;property_id:string;unit_label:string}[];delivery?:{channel:string;event_type:string;status:string;attempts:number;last_error_code:string|null}[];clients:{id:string;name:string;email:string|null;phone:string|null}[];queue:{id:string;property:string;scheduled_date:string|null;appointment_start:string|null;appointment_end:string|null}[];linked:{id:string;request_client_id:string|null;appointment_start:string|null;appointment_end:string|null}|null};
export function validateWorkflowChange(input:unknown):WorkflowChange{
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid workflow action');
 const r=input as Record<string,unknown>;
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 if(Object.keys(r).some(k=>!['requestId','expectedRevision','mutationId','action','clientId','start','minutes','conflictReason','propertyId','unitId','propertyName','unitLabel','noUnit'].includes(k))||!uuid(r.requestId)||!Number.isInteger(r.expectedRevision)||Number(r.expectedRevision)<1||typeof r.mutationId!=='string'||!/^[A-Za-z0-9_-]{16,100}$/.test(r.mutationId)||!['convert','schedule','approve_schedule','cancel_appointment'].includes(String(r.action))||(r.clientId!==null&&!uuid(r.clientId)))throw Error('Invalid workflow action');
 if(['schedule','approve_schedule'].includes(String(r.action))){if(typeof r.start!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(r.start)||!Number.isFinite(Date.parse(r.start))||!Number.isInteger(r.minutes)||Number(r.minutes)<15||Number(r.minutes)>720)throw Error('Choose a start time and duration');}
 else if(r.start!==null||r.minutes!==null)throw Error('Unexpected appointment fields');
 if(r.conflictReason!=null&&(typeof r.conflictReason!=='string'||r.conflictReason.trim().length<5||r.conflictReason.length>500||!['schedule','approve_schedule'].includes(String(r.action))))throw Error('Provide a conflict override reason of 5 to 500 characters');
 for (const field of ['propertyId','unitId']) {
  if (r[field] != null && !uuid(r[field])) throw Error('Invalid property or unit selection');
 }
 for (const [field, maximum] of [['propertyName',120],['unitLabel',40]] as const) {
  const value = r[field];
  if (value != null && (typeof value !== 'string' || !value.trim() || value.length > maximum)) throw Error('Invalid property or unit name');
 }
 if (r.noUnit != null && typeof r.noUnit !== 'boolean') throw Error('Invalid unit selection');
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
