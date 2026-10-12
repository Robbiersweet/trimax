import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {getPublicBusiness,validateRequest,isIntakeRole} from '../src/app/lib/publicScheduling/domain.ts';
import {submitDevelopmentRequest,listDevelopmentRequests,devStoreDirectory} from '../src/app/lib/publicScheduling/developmentStore.ts';
const business=getPublicBusiness('rnl-creations')!;
const input={requestTypeId:'repair',customerName:'Customer',phone:'555-123-4567',email:'a@example.com',preferredContact:'email',address:'100 Main Street',description:'Repair an interior door',preferredDate:'2026-10-13',timeWindowId:'morning',flexibility:'preferred',urgency:'routine',notes:'',consent:true};
const now=new Date('2026-10-09T12:00:00Z');
const valid=validateRequest(input,business,now);assert.equal(valid.ok,true);if(!valid.ok)throw Error('invalid fixture');
assert.equal(getPublicBusiness('guessed-workspace'),null);
assert.equal(validateRequest({...input,customerName:''},business,now).ok,false);
assert.equal(validateRequest({...input,description:'x'.repeat(3001)},business,now).ok,false);
assert.equal(validateRequest({...input,consent:false},business,now).ok,false);
assert.equal(validateRequest({...input,preferredDate:'2026-10-10'},business,now).ok,false);
assert.equal(validateRequest({...input,preferredDate:'2027-10-13'},business,now).ok,false);
assert.equal(validateRequest({...input,preferredDate:'2026-02-31'},business,now).ok,false);
const inactive=structuredClone(business);inactive.requestTypes[0].active=false;
assert.equal(validateRequest(input,inactive,now).ok,false);
for(const role of ['member','employee',null,undefined,'Owner'])assert.equal(isIntakeRole(role),false);
assert.equal(isIntakeRole('owner'),true);assert.equal(isIntakeRole('admin'),true);
assert.throws(()=>devStoreDirectory({NODE_ENV:'production',PUBLIC_SCHEDULING_DEV_ADAPTER:'enabled'}));assert.throws(()=>devStoreDirectory({NODE_ENV:'development'}));
assert.equal(validateRequest({...input,phone:'-------'},business,now).ok,false);
assert.equal(validateRequest(input,{...business,rules:{...business.rules,mode:'immediately-bookable'}},now).ok,false);
assert.equal(validateRequest({...input,website:'spam'},business,now).ok,false);
const directory=await mkdtemp(join(tmpdir(),'trimax-scheduling-test-'));
try{
 const key='same-request-key-12345';const first=await submitDevelopmentRequest(business,valid.value,key,directory);
 const second=await submitDevelopmentRequest(business,valid.value,key,directory);
 assert.equal(first.id,second.id);assert.equal(first.status,'pending_confirmation');assert.equal(first.notificationStatus,'not_configured');
 await assert.rejects(()=>submitDevelopmentRequest(business,{...valid.value,description:'Different'},key,directory));
 assert.equal((await listDevelopmentRequests(business.businessId,directory)).length,1);
 assert.equal((await listDevelopmentRequests('another-workspace',directory)).length,0);
 const other={...business,businessId:'dev:other',slug:'other'};const separate=await submitDevelopmentRequest(other,valid.value,key,directory);assert.notEqual(separate.id,first.id);
 assert.equal((await listDevelopmentRequests(other.businessId,directory)).length,1);
}finally{await rm(directory,{recursive:true,force:true});}
console.log('Public scheduling domain/storage regressions PASS');

