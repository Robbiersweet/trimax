export type ServiceRequestType = { id: string; publicLabel: string; internalLabel: string; description: string; active: boolean; displayOrder: number; estimatedDurationMinutes: number | null; schedulingEligible: boolean };
export type PublicBusiness = { slug: string; businessId: string; displayName: string; description: string; phone: string | null; email: string | null; logoUrl: string | null; accent?: 'forest' | 'ocean' | 'clay'; enabled: boolean; requestTypes: ServiceRequestType[]; rules: { weekdays: number[]; blockedDates: string[]; minimumLeadHours: number; maximumHorizonDays: number; timeZone: string; businessHours: {start:string;end:string}; windows: {id:string;label:string;start:string;end:string}[]; ownerApprovalRequired: boolean; mode: 'request-only' | 'immediately-bookable' } };
// Explicit public allowlist. This foundation has no production workspace binding.
const initial: PublicBusiness = {slug:'rnl-creations',businessId:'dev:rnl-creations',displayName:'R&L Creations',description:'Thoughtful repairs, painting, and property care. Tell us what you need and we will help plan the next step.',phone:null,email:null,logoUrl:null,enabled:true,requestTypes:['Handyman / Repair','Painting','Carpentry','Apartment / Property Service','Estimate Request','Other'].map((label,i)=>({id:['repair','painting','carpentry','property','estimate','other'][i],publicLabel:label,internalLabel:label,description:'',active:true,displayOrder:i,estimatedDurationMinutes:null,schedulingEligible:true})),rules:{weekdays:[1,2,3,4,5],blockedDates:[],minimumLeadHours:24,maximumHorizonDays:90,timeZone:'America/Los_Angeles',businessHours:{start:'08:00',end:'17:00'},windows:[{id:'morning',label:'Morning · 8 am–12 pm',start:'08:00',end:'12:00'},{id:'afternoon',label:'Afternoon · 12–5 pm',start:'12:00',end:'17:00'}],ownerApprovalRequired:true,mode:'request-only'}};
export function getPublicBusiness(slug:string): PublicBusiness | null { return slug === initial.slug ? structuredClone(initial) : null; }
export function listPublicBusinesses() { return [structuredClone(initial)]; }
export type ServiceRequestInput = {requestTypeId:string;customerName:string;phone:string;email:string;preferredContact:'phone'|'email'|'sms';address:string;description:string;preferredDate:string;timeWindowId:string;flexibility:'flexible'|'preferred'|'fixed';urgency:'routine'|'soon'|'urgent';notes:string;consent:boolean;website?:string};
export type RequestStatus = 'pending_confirmation' | 'reviewing' | 'approved' | 'needs_information' | 'rejected' | 'cancelled';
export type RequestActivity = {id:string;at:string;actor:string;event:string;from?:RequestStatus;to?:RequestStatus;note?:string};
export type PublicServiceRequest = ServiceRequestInput & {id:string;businessId:string;businessSlug:string;reference:string;status:RequestStatus;revision?:number;activity?:RequestActivity[];submittedAt:string;source:'public-web';internalNotes:string;confirmationStatus:'unconfirmed';notificationStatus:'not_configured'};
export type ValidationResult = {ok:true;value:ServiceRequestInput}|{ok:false;fields:Record<string,string>};
export function validateRequest(input:unknown,business:PublicBusiness,now=new Date()):ValidationResult {
 const data = input && typeof input==='object' && !Array.isArray(input) ? input as Record<string,unknown> : {};
 const fields:Record<string,string>={};
 const read=(key:string,max:number,required=true)=>{const raw=data[key];if(typeof raw!=='string'){if(required)fields[key]='This field is required.';return '';}const value=raw.trim().replace(/\r\n/g,'\n');if((required&&!value)||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))fields[key]=`Enter ${required?'1–':''}${max} characters or fewer.`;return value;};
 const value={requestTypeId:read('requestTypeId',60),customerName:read('customerName',120),phone:read('phone',40,false),email:read('email',254,false).toLowerCase(),preferredContact:read('preferredContact',10),address:read('address',500),description:read('description',3000),preferredDate:read('preferredDate',10,false),timeWindowId:read('timeWindowId',40,false),flexibility:read('flexibility',20),urgency:read('urgency',20),notes:read('notes',2000,false),consent:data.consent===true} as ServiceRequestInput;
 if(!business.enabled||business.rules.mode!=='request-only'||!business.rules.ownerApprovalRequired)fields.business='Scheduling is unavailable.';
 if(!business.requestTypes.some(t=>t.id===value.requestTypeId&&t.active))fields.requestTypeId='Choose an available service.';
 if(!['phone','email','sms'].includes(value.preferredContact))fields.preferredContact='Choose a contact method.';
 if(value.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email))fields.email='Enter a valid email address.';
 if(value.phone&&(!/^\+?[\d () .-]{7,40}$/.test(value.phone)||value.phone.replace(/\D/g,'').length<7))fields.phone='Enter a valid phone number.';
 if(value.preferredContact==='email'&&!value.email)fields.email='Email is required for your contact preference.';
 if(['phone','sms'].includes(value.preferredContact)&&value.phone.replace(/\D/g,'').length<7)fields.phone='Phone is required for your contact preference.';
 if(!['flexible','preferred','fixed'].includes(value.flexibility))fields.flexibility='Choose your flexibility.';
 if(!['routine','soon','urgent'].includes(value.urgency))fields.urgency='Choose an urgency.';
 if(!value.consent)fields.consent='Please agree to be contacted about this request.';
 if(data.website)fields.website='Request could not be accepted.';
 if(value.timeWindowId&&!business.rules.windows.some(w=>w.id===value.timeWindowId))fields.timeWindowId='Choose an available time window.';
 if(value.preferredDate){
  const date=new Date(`${value.preferredDate}T00:00:00Z`);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:business.rules.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const diff=(date.getTime()-new Date(`${today}T00:00:00Z`).getTime())/86400000;
  // Conservative day-level lead rule: no window can precede the required lead time.
  const minDays=Math.ceil(business.rules.minimumLeadHours/24)+1;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value.preferredDate)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value.preferredDate||diff<minDays||diff>business.rules.maximumHorizonDays||!business.rules.weekdays.includes(date.getUTCDay())||business.rules.blockedDates.includes(value.preferredDate))fields.preferredDate=`Choose an available weekday ${minDays}–${business.rules.maximumHorizonDays} days ahead.`;
  if(!business.requestTypes.some(t=>t.id===value.requestTypeId&&t.schedulingEligible))fields.preferredDate='This service accepts requests without a date.';
 } else if(value.flexibility==='fixed')fields.preferredDate='Choose a preferred date or flexible scheduling.';
 return Object.keys(fields).length?{ok:false,fields}:{ok:true,value};
}
export function isIntakeRole(role:unknown){return role==='owner'||role==='admin';}

