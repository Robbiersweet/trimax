import type {Delivery} from './delivery';
export type DeliveryTransport={
 claim:(channel:Delivery['channel'])=>Promise<Delivery[]>;
 send:(row:Delivery)=>Promise<string>;
 finish:(row:Delivery,reference:string|null,error:string|null)=>Promise<boolean>;
};
/** Channel and row failures never prevent another recipient/channel from being tried. */
export async function dispatchDeliveries(channels:Delivery['channel'][],transport:DeliveryTransport){
 const counts={accepted:0,failed:0};
 await Promise.all(channels.map(async channel=>{
  let rows:Delivery[];
  try{rows=await transport.claim(channel);}catch{counts.failed++;return;}
  await Promise.all(rows.map(async row=>{
   let reference:string|null=null,error:string|null=null;
   try{reference=await transport.send(row);}catch{error='delivery_failed';}
   try{const finished=await transport.finish(row,reference,error);if(error||!finished)counts.failed++;else counts.accepted++;}
   catch{counts.failed++;} // The lease expires and can be retried after a database outage.
  }));
 }));
 return counts;
}
