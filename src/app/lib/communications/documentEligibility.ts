export type SmsDocumentMessage={entity_id?:string|null;entity_type?:string|null;business_id:string;client_id?:string|null};
export type SmsCurrentDocument={id:string;business_id:string;client_id:string|null;status:string|null};
export async function currentSmsDocument(message:SmsDocumentMessage,read:(kind:'estimate'|'invoice',id:string,businessId:string)=>Promise<SmsCurrentDocument|null>):Promise<boolean>{
 if(!message.entity_id)return true;
 if(message.entity_type!=='estimate'&&message.entity_type!=='invoice')return false;
 const document=await read(message.entity_type,message.entity_id,message.business_id);
 const allowed=message.entity_type==='estimate'?['sent','accepted','approved']:['sent','partial','paid','overdue'];
 return !!document&&document.id===message.entity_id&&document.business_id===message.business_id&&document.client_id===message.client_id&&!!document.client_id&&allowed.includes((document.status||'').toLowerCase());
}
