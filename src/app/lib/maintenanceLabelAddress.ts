import {canonicalApartmentUnitLabel} from '../utils/unitLabels';
type Property={property:string;address:string|null};
type Label={property:string;unit:string|null;address:string;active:boolean;scope?:'unit'|'property'};
/** Resolve existing records for display; never write property or unit master data. */
export function savedLabelAddress(property:Property|undefined,labels:Label[],unit:string){
 if(!property)return {address:'',source:'Choose a property.',existingUnit:false,unitLabel:null};
 const normalize=(value:string)=>/^north creek apartments$/i.test(property.property.trim())?canonicalApartmentUnitLabel(value):value.trim().toLowerCase();
 const matches=unit.trim()?labels.filter(label=>label.active&&label.scope!=='property'&&label.unit&&label.property.trim().toLowerCase()===property.property.trim().toLowerCase()&&normalize(label.unit)===normalize(unit)):[];
 const exact=matches.filter(label=>label.unit===unit.trim());
 const candidates=exact.length?exact:matches;
 const addresses=[...new Set(candidates.map(label=>label.address.trim()).filter(Boolean))];
 if(addresses.length>1||candidates.length>1)return {address:'',source:'Saved unit addresses disagree. Review the existing records.',existingUnit:true,unitLabel:null};
 if(addresses.length===1)return {address:addresses[0],source:'Saved unit service address',existingUnit:true,unitLabel:candidates[0].unit};
 return {address:property.address?.trim()??'',source:'Saved property service address',existingUnit:false,unitLabel:null};
}
