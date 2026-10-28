export type QrLocation={scope?:'unit'|'property';unit:string|null;address:string};
export function maintenanceRequestLocation(qr:QrLocation,input:Record<string,unknown>){
 const unit=qr.scope==='property'?(typeof input.unit==='string'?input.unit.trim():''):qr.unit??'';
 const area=qr.scope==='property'&&typeof input.specificArea==='string'?input.specificArea.trim():'';
 if(!unit||unit.length>100||area.length>100||/[\u0000-\u001f\u007f]/.test(unit+area))return null;
 const address=qr.address+', Unit '+unit;
 if(address.length>500)return null;
 return {unit,specificArea:area,address};
}
