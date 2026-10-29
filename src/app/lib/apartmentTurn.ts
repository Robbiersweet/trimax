import {paintTypeOptions,northCreekUnitLayoutOptions,turnPriorityOptions} from './queueTurnOptions';

/** Submitted job scope, never permission to dispatch, schedule or reorder work. */
export type ApartmentTurn = {
 building:string;unitLayout:string;carpet:'Keep'|'Replace'|'To Be Determined';vinyl:'Keep'|'Replace'|'To Be Determined';
 paintType:string;paintingScope:string;specialRequirements:string;smokedIn:boolean;primerRequested:boolean;
 wallPaintColor:string;paintCode:string;priority:string;priorRenovation:boolean;priorRenovationDetails:string;
 renovationNeeded:boolean;renovationNeededDetails:string;moveOutDate:string;
};
export const emptyApartmentTurn:ApartmentTurn={building:'',unitLayout:'',carpet:'To Be Determined',vinyl:'To Be Determined',paintType:'Classic',paintingScope:'',specialRequirements:'',smokedIn:false,primerRequested:false,wallPaintColor:'To Be Determined',paintCode:'',priority:'Normal',priorRenovation:false,priorRenovationDetails:'',renovationNeeded:false,renovationNeededDetails:'',moveOutDate:''};
export function validateApartmentTurn(input:unknown):{ok:true;value:ApartmentTurn}|{ok:false;error:string}{
 if(!input||typeof input!=='object'||Array.isArray(input))return {ok:false,error:'Check the apartment-turn details.'};
 const raw=input as Record<string,unknown>,value={...emptyApartmentTurn};
 if(Object.keys(raw).some(k=>!Object.hasOwn(value,k)))return {ok:false,error:'Unexpected apartment-turn field.'};
 for(const key of Object.keys(value) as (keyof ApartmentTurn)[]){
  const item=raw[key];
  if(typeof value[key]==='boolean'){if(typeof item!=='boolean')return {ok:false,error:'Check the turn options.'};Object.assign(value,{[key]:item});}
  else {if(typeof item!=='string')return {ok:false,error:'Check the turn details.'};const text=item.trim().replace(/\r\n/g,'\n'),max=['specialRequirements','priorRenovationDetails','renovationNeededDetails'].includes(key)?1000:key==='paintingScope'?500:key==='wallPaintColor'?200:100;if(text.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||(!['paintingScope','specialRequirements','priorRenovationDetails','renovationNeededDetails'].includes(key)&&/[\r\n\t]/.test(text)))return {ok:false,error:'Shorten the turn details or remove unsupported characters.'};Object.assign(value,{[key]:text});}
 }
 if(!paintTypeOptions.includes(value.paintType)||!turnPriorityOptions.includes(value.priority)||!['Keep','Replace','To Be Determined'].includes(value.carpet)||!['Keep','Replace','To Be Determined'].includes(value.vinyl)||(value.unitLayout&&!northCreekUnitLayoutOptions.includes(value.unitLayout)))return {ok:false,error:'Choose the available turn options.'};
 if(value.paintCode&&!/^SW ?\d{4}$/.test(value.paintCode))return {ok:false,error:'Use a Sherwin-Williams code such as SW 7562.'};
 if(value.moveOutDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(value.moveOutDate)||!Number.isFinite(Date.parse(value.moveOutDate))||new Date(value.moveOutDate).toISOString().slice(0,10)!==value.moveOutDate))return {ok:false,error:'Choose a valid move-out date.'};
 return {ok:true,value};
}
export function apartmentTurnEntries(t:ApartmentTurn):[string,string][]{return [
 ['Building',t.building||'Same as unit'],['Unit layout',t.unitLayout||'Not provided'],['Carpet',t.carpet],['Vinyl',t.vinyl],['Paint type',t.paintType],['Painting scope',t.paintingScope||'Confirm scope'],['Smoke / odor treatment',t.smokedIn?'Yes':'No'],['Primer requested',t.primerRequested?'Yes':'No'],['Wall paint color',t.wallPaintColor],['Sherwin-Williams code',t.paintCode||'Not provided'],['Requested priority',t.priority],['Special requirements',t.specialRequirements||'None provided'],['Prior renovation',t.priorRenovation?'Yes':'No'],['Prior renovation details',t.priorRenovationDetails||'None provided'],['Renovation needed',t.renovationNeeded?'Yes':'No'],['Renovation details',t.renovationNeededDetails||'None provided'],['Move-out date',t.moveOutDate||'Not provided']
 ];}
