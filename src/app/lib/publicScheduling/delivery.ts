export type Delivery={created_at?:string;id:string;business_id:string;request_id:string;channel:'push'|'email';audience:string;recipient:string;event_type:string;idempotency_key:string;lease_token:string;consent_reference:string|null;parameters:Record<string,string|null>};
export function customerEmail(row:Delivery){
 if(row.channel!=='email'||row.audience!=='customer'||!row.consent_reference)throw Error('Invalid customer delivery');
 const p=row.parameters,brand=p.business||'R&L Creations',reference=p.reference||'';
 const appointment=()=>{if(!p.start||!p.end||!p.timeZone)throw Error('Appointment missing');return `${new Date(p.start).toLocaleString('en-US',{timeZone:p.timeZone})} to ${new Date(p.end).toLocaleTimeString('en-US',{timeZone:p.timeZone})} (${p.timeZone})`;};
 const content:Record<string,()=>string>={
  request_received:()=> 'We received your service request. It is awaiting review and is not a confirmed appointment.',
  approved:()=> 'Your request has been approved. Scheduling is pending; no appointment is confirmed yet.',
  reminder_24h:()=> `Reminder: your appointment is ${appointment()}.`,
  reminder_1h:()=> `Reminder: your appointment is ${appointment()}.`,
  appointment_scheduled:()=> `Your appointment is confirmed for ${appointment()}.`,
  appointment_rescheduled:()=> `Your appointment has been rescheduled to ${appointment()}.`,
  appointment_cancelled:()=> 'Your appointment has been cancelled. Please contact us to discuss another time.',
  declined:()=> 'We reviewed your request and are unable to accept it at this time. Thank you for considering us.'
 };
 if(!content[row.event_type])throw Error('Unsupported email event');
 // Explicit allowlist: no internal notes, addresses, customer free text, or admin data.
 return {subject:`${brand} — ${row.event_type.replaceAll('_',' ')} (${reference})`,text:`${content[row.event_type]()}\n\nRequest: ${reference}\n${brand}`};
}
export function deliveryChannels(env:Record<string,string|undefined>){
 if(env.VERCEL_ENV!=='production'||env.SERVICE_REQUEST_DELIVERY_ENABLED!=='enabled')return [] as ('push'|'email')[];
 const channels:('push'|'email')[]=[];
 if(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)channels.push('push');
 if(env.SERVICE_REQUEST_EMAIL_ENABLED==='enabled'&&env.RESEND_API_KEY&&env.SERVICE_REQUEST_EMAIL_FROM&&env.SERVICE_REQUEST_EMAIL_BUSINESS_ID)channels.push('email');
 return channels;
}
