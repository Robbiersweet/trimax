import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { devStoreDirectory } from './developmentStore.ts';
import { getPublicBusiness, listPublicBusinesses, isIntakeRole, type PublicBusiness } from './domain.ts';
export type SchedulingSettings = { revision:number; business:PublicBusiness };
export function validateSettings(value:unknown, original:PublicBusiness):PublicBusiness {
  if(!value||typeof value!=='object')throw Error('Invalid settings.');
  const x=value as PublicBusiness;
  if(x.slug==='demo'||listPublicBusinesses().some(b=>b.businessId!==original.businessId&&b.slug===x.slug))throw Error('Public slug is reserved.');
  if(x.businessId!==original.businessId || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(x.slug) || x.slug.length>60 || !x.displayName?.trim() || x.displayName.length>120 || typeof x.description!=='string'||x.description.length>2000 || typeof x.enabled!=='boolean' || !['forest','ocean','clay'].includes(x.accent??'forest'))throw Error('Invalid branding or workspace.');
  if(x.logoUrl && (!/^\/branding\/[a-zA-Z0-9._-]+$/.test(x.logoUrl)))throw Error('Logo must be an approved local /branding/ asset.');
  if(x.phone && (x.phone.length>40 || x.phone.replace(/\D/g,'').length<7))throw Error('Invalid contact phone.');
  if(x.email && (x.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email)))throw Error('Invalid contact email.');
  const r=x.rules;
  if(!r || r.mode!=='request-only' || r.ownerApprovalRequired!==true || r.timeZone!==original.rules.timeZone || !Number.isInteger(r.minimumLeadHours)||r.minimumLeadHours<0||r.minimumLeadHours>720||!Number.isInteger(r.maximumHorizonDays)||r.maximumHorizonDays<1||r.maximumHorizonDays>365 || !Array.isArray(r.weekdays)||!r.weekdays.length||r.weekdays.some(d=>!Number.isInteger(d)||d<0||d>6)||new Set(r.weekdays).size!==r.weekdays.length)throw Error('Invalid scheduling rules. Owner approval remains required.');
  if(!Array.isArray(r.windows)||!r.windows.length||r.windows.length>8||new Set(r.windows.map(w=>w.id)).size!==r.windows.length||r.windows.some(w=>!/^[-a-z0-9]{1,40}$/.test(w.id)||!w.label||w.label.length>100||!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end)||w.start>=w.end))throw Error('Invalid time windows.');
  if(!Array.isArray(x.requestTypes)||!x.requestTypes.length||x.requestTypes.length>30||new Set(x.requestTypes.map(t=>t.id)).size!==x.requestTypes.length||x.requestTypes.some(t=>!/^[-a-z0-9]{1,60}$/.test(t.id)||!t.publicLabel?.trim()||t.publicLabel.length>100||!t.internalLabel?.trim()||t.internalLabel.length>100||typeof t.active!=='boolean'||!Number.isInteger(t.displayOrder)||t.description.length>500||typeof t.schedulingEligible!=='boolean'||(t.estimatedDurationMinutes!==null&&(!Number.isInteger(t.estimatedDurationMinutes)||t.estimatedDurationMinutes<=0||t.estimatedDurationMinutes>1440))))throw Error('Invalid request types.');
  // Only explicitly supported settings may persist; no injected integration authority.
  return {businessId:original.businessId,slug:x.slug,displayName:x.displayName.trim(),description:x.description.trim(),phone:x.phone,email:x.email,logoUrl:x.logoUrl,accent:x.accent??'forest',enabled:x.enabled,requestTypes:x.requestTypes.map(t=>({id:t.id,publicLabel:t.publicLabel,internalLabel:t.internalLabel,description:t.description,active:t.active,displayOrder:t.displayOrder,estimatedDurationMinutes:t.estimatedDurationMinutes,schedulingEligible:t.schedulingEligible})),rules:{...original.rules,weekdays:r.weekdays,minimumLeadHours:r.minimumLeadHours,maximumHorizonDays:r.maximumHorizonDays,windows:r.windows.map(w=>({id:w.id,label:w.label,start:w.start,end:w.end})),ownerApprovalRequired:true,mode:'request-only'}};
}
export async function loadDevelopmentSettings(slug:string,directory=devStoreDirectory()):Promise<SchedulingSettings>{
  const business=getPublicBusiness(slug);if(!business)throw Error('Unknown configured workspace.');
  try{return JSON.parse(await readFile(join(/* turbopackIgnore: true */ directory,`settings-${slug}.json`),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return {revision:0,business};}
}
export async function saveDevelopmentSettings(slug:string,actor:{role:string},expectedRevision:number,value:unknown,directory=devStoreDirectory()){
  if(!isIntakeRole(actor.role))throw Error('Owner/admin required.');
  const original=getPublicBusiness(slug);if(!original)throw Error('Unknown configured workspace.');
  const business=validateSettings(value,original);await mkdir(directory,{recursive:true,mode:0o700});
  const file=join(/* turbopackIgnore: true */ directory,`settings-${slug}.json`),lock=file+'.lock';await writeFile(lock,'settings',{flag:'wx',mode:0o600});
  try{const current=await loadDevelopmentSettings(slug,directory);if(current.revision!==expectedRevision)throw Error('Settings changed. Reload before saving.');const next={revision:current.revision+1,business};const temporary=file+'.tmp-'+randomUUID();await writeFile(temporary,JSON.stringify(next),{flag:'wx',mode:0o600});await rename(temporary,file);return next;}finally{await unlink(lock);}
}
export async function resolvePublicBusiness(slug:string){
  if(process.env.NODE_ENV==='production'||process.env.PUBLIC_SCHEDULING_DEV_ADAPTER!=='enabled')return getPublicBusiness(slug);
  for(const configured of listPublicBusinesses()){const settings=await loadDevelopmentSettings(configured.slug);if(settings.business.slug===slug)return settings.business;}
  return null;
}
