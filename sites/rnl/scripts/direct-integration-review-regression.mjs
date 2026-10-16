import assert from 'node:assert/strict';
import {createReviewedDirectIntegration,scopeSql,directProductionEnabled} from '../lib/credentialLifecycle/directIntegrationReview.ts';
let options,calls=[],releases=[],bad=false,failCommit=false,connections=0;
const driver={Pool:class{constructor(o){options=o;}on(){}async end(){}async connect(){connections++;return {async query(sql,values){calls.push({sql,values});if(sql===scopeSql)return {rows:[{role:'trimax_scheduling_web',session_role:'trimax_scheduling_web',safe_role:true,no_memberships:true,required_rpcs:!bad,no_other_rpcs:true,no_tables:true,no_create:true}]};if(sql==='COMMIT'&&failCommit)throw Error('private');return {rows:sql.startsWith('SELECT public.')?[{result:{reference:'SYNTHETIC',status:'pending_confirmation'}}]:[]};},release(destroy){releases.push(destroy);}};}}};
const cfg={mode:'offline-review',project:'gqknefosisnsjuzmhvts',host:'aws-1-us-west-2.pooler.supabase.com',verifiedHost:'aws-1-us-west-2.pooler.supabase.com',port:6543,role:'trimax_scheduling_web',database:'postgres',password:'synthetic-password-not-real-000',ca:'synthetic-ca'};
const integration=createReviewedDirectIntegration(driver,cfg);assert.equal(directProductionEnabled,false);assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.max,1);assert.equal(options.connectionTimeoutMillis,5000);
const args={p_slug:'synthetic',p_payload:{description:"'; DROP TABLE x; --"},p_idempotency_hash:'a'.repeat(64),p_capability_hash:'b'.repeat(64)};
assert.equal((await integration.rpc.rpc('trimax_submit_public_service_request',args)).error,null);assert.ok(calls.find(c=>c.sql.includes('$2::jsonb')));assert.ok(calls.every(c=>!c.sql.includes('DROP TABLE')));
await assert.rejects(integration.rpc.rpc('apply_payment',args),/NOT_ALLOWED/);
bad=true;const n=calls.filter(c=>c.sql.startsWith('SELECT public.')).length;assert.ok((await integration.rpc.rpc('trimax_public_scheduling_config',{p_slug:'synthetic'})).error);assert.equal(calls.filter(c=>c.sql.startsWith('SELECT public.')).length,n);assert.equal(releases.at(-1),true);bad=false;
failCommit=true;const before=connections;assert.ok((await integration.rpc.rpc('trimax_submit_public_service_request',args)).error);assert.equal(connections,before+1);failCommit=false;assert.equal((await integration.rpc.rpc('trimax_public_scheduling_config',{p_slug:'synthetic'})).error,null);
// Hold an independent caller at acquisition; a second request must not allocate a connection.
let unblock;let acquisitions=0;
const bounded=createReviewedDirectIntegration({Pool:class{on(){}async end(){}async connect(){acquisitions++;await new Promise(resolve=>{unblock=resolve;});throw Error('synthetic outage');}}},cfg);
const pending=bounded.rpc.rpc('trimax_public_scheduling_config',{p_slug:'synthetic'});
assert.ok((await bounded.rpc.rpc('trimax_public_scheduling_config',{p_slug:'synthetic'})).error);
assert.equal(acquisitions,1);unblock();assert.ok((await pending).error);assert.equal(bounded.status().inFlight,0);await bounded.stop();
assert.match(scopeSql,/rolconnlimit=1/);
await integration.stop();const last=connections;assert.ok((await integration.rpc.rpc('trimax_public_scheduling_config',{p_slug:'synthetic'})).error);assert.equal(connections,last);
for(const change of [{role:'postgres'},{project:'unknown'},{verifiedHost:'different'},{mode:'production'},{password:''}])assert.throws(()=>createReviewedDirectIntegration(driver,{...cfg,...change}),/REJECTED/);
console.log('PASS offline reviewed transport: fixed two RPCs, TLS/pool bounds, privilege health fail closed, parameterization, uncertain commit no retry, recovery, shutdown; network calls ZERO');

