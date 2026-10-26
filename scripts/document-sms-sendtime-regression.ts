import assert from 'node:assert/strict';
import {currentSmsDocument,type SmsCurrentDocument} from '../src/app/lib/communications/documentEligibility.ts';
const message={entity_id:'document',entity_type:'invoice',business_id:'tenant',client_id:'client'};
let current:SmsCurrentDocument|null={id:'document',business_id:'tenant',client_id:'client',status:'Sent'},calls=0;
const read=async()=>{calls++;return current;};
assert.equal(await currentSmsDocument(message,read),true);
// A document revoked after claim must be read again, not approved from a cached lease snapshot.
current={...current!,status:'Voided'};assert.equal(await currentSmsDocument(message,read),false);assert.equal(calls,2);
for(const patch of [{client_id:'replacement'},{business_id:'other'},{id:'other'},{status:null},{status:'Draft'}]){current={id:'document',business_id:'tenant',client_id:'client',status:'Sent',...patch};assert.equal(await currentSmsDocument(message,read),false);}
current=null;assert.equal(await currentSmsDocument(message,read),false);
await assert.rejects(currentSmsDocument(message,async()=>{throw Error('database unavailable');}));
assert.equal(await currentSmsDocument({...message,entity_type:'unknown'},read),false);
assert.equal(await currentSmsDocument({...message,entity_id:null},async()=>{throw Error('not a document');}),true);
for(const status of ['Sent','Partial','Paid','Overdue']){current={id:'document',business_id:'tenant',client_id:'client',status};assert.equal(await currentSmsDocument(message,read),true);}
for(const status of ['Sent','Accepted','Approved']){current={id:'document',business_id:'tenant',client_id:'client',status};assert.equal(await currentSmsDocument({...message,entity_type:'estimate'},read),true);}
console.log('PASS 19 send-time document eligibility assertions');
