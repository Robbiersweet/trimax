/* eslint-disable @typescript-eslint/no-require-imports -- Execute real handler with isolated provider/transport dependencies. */
const fs=require('fs'),ts=require('typescript'),assert=require('assert/strict');
let calls=0,abuseAllowed=true,validated=0;
const qr={id:'88888888-8888-4888-8888-000000000727',businessId:'business',slug:'rnl-creations',address:'Trusted location',unit:'QR-01'},business={businessId:'business'};
const source=fs.readFileSync('src/app/lib/maintenanceQrHandler.ts','utf8');const mod={exports:{}};
const imports={
 './maintenanceQr':{maintenanceQrContext:async()=>qr,maintenanceQrLab:()=>false,maintenanceQrOrigins:()=>new Set(['https://rnlcreations.com']),maintenanceQrRuntime:()=>({rpc:async(name,args)=>{calls++;assert.equal(name,'trimax_submit_maintenance_qr');assert.equal(args.p_payload.address,'Trusted location, Unit QR-01');return {data:{reference:'SYNTHETIC'},error:null};}})},
 './publicScheduling/httpBody':{readBoundedJson:r=>r.json()},
 './publicScheduling/productionRuntime':{productionConfig:()=>{throw Error('JWT runtime must not be selected');},productionBusiness:async(slug,client)=>{assert.equal(slug,'rnl-creations');assert.equal(client.marker,'existing-Option-C');return business;},restrictedRpc:()=>{throw Error('JWT transport selected');},unusedCapabilityHash:()=> 'a'.repeat(64)},
 './publicScheduling/abuseProtection':{enforceProductionAbuse:async(input,providers)=>{assert.equal(providers.rateLimit.marker,'existing-rate-limit');return {allowed:abuseAllowed};}},
 './publicScheduling/providers':{trustedVercelIdentity:()=> 'synthetic-client',turnstileProvider:()=>({})},
 './publicScheduling/domain':{validateRequest:value=>{validated++;return {ok:true,value};}}
};
new Function('require','module','exports',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>imports[name]??require(name),mod,mod.exports);
(async()=>{const post=mod.exports.createMaintenanceQrPost(()=>({client:{marker:'existing-Option-C'},config:{fingerprintSecret:'x'.repeat(32),providers:{rateLimit:{marker:'existing-rate-limit'}}}}));
const request=(origin='https://rnlcreations.com')=>new Request('https://rnlcreations.com/api/maintenance-qr/'+qr.id,{method:'POST',headers:{origin,'Idempotency-Key':'synthetic-production-key','Content-Type':'application/json'},body:JSON.stringify({address:'tampered'})});const ctx={params:Promise.resolve({id:qr.id})};
assert.equal((await post(request(),ctx)).status,201);assert.equal(calls,1);assert.equal(validated,1);
abuseAllowed=false;assert.equal((await post(request(),ctx)).status,429);assert.equal(calls,1);
assert.equal((await post(request('https://other.invalid'),ctx)).status,403);assert.equal(calls,1);
console.log('PASS actual production QR handler: existing Option C transport; no JWT fallback; trusted location; unchanged rate/challenge gate; wrong-origin rejection; no write after denial.');})().catch(e=>{console.error(e);process.exitCode=1;});

// Execute the actual label API after the existing workspace guard normalizes IDs to slugs.
(async()=>{const file=fs.readFileSync('src/app/api/maintenance-qr/route.ts','utf8'),m={exports:{}};const id='88888888-8888-4888-8888-000000000101';let lookups=0,managed=0;
const db={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:table=>{assert.equal(table,'businesses');let selected;return {select(){return this;},eq(key,value){assert.equal(key,'slug');selected=value;return this;},async maybeSingle(){lookups++;return {data:selected==='rnl-creations'?{id}:null};}};},rpc:async(name,args)=>{assert.equal(name,'trimax_manage_maintenance_qr');assert.equal(args.p_business_id,id);managed++;return {data:{labels:[],properties:[]},error:null};}};
const deps={'@supabase/supabase-js':{createClient:()=>db},'../../lib/publicScheduling/httpBody':{readBoundedJson:r=>r.json()},'../../lib/maintenanceQr':{maintenanceQrRuntime:()=>({}),maintenanceQrSvg:async()=>'',maintenanceQrUrl:()=>''}};
new Function('require','module','exports',ts.transpileModule(file,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>deps[name]??require(name),m,m.exports);
const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='production';try{
assert.equal((await m.exports.GET(new Request('https://app.rnlcreations.com/api/maintenance-qr?business='+id,{headers:{authorization:'Bearer synthetic'}}))).status,200);
assert.equal((await m.exports.GET(new Request('https://app.rnlcreations.com/api/maintenance-qr?business=rnl-creations',{headers:{authorization:'Bearer synthetic'}}))).status,200);
assert.equal((await m.exports.POST(new Request('https://app.rnlcreations.com/api/maintenance-qr',{method:'POST',headers:{authorization:'Bearer synthetic','Content-Type':'application/json'},body:JSON.stringify({businessId:'rnl-creations',assignmentId:id,unit:'A-1',address:'Synthetic'})}))).status,200);
assert.equal((await m.exports.GET(new Request('https://app.rnlcreations.com/api/maintenance-qr?business=other-workspace',{headers:{authorization:'Bearer synthetic'}}))).status,403);assert.equal(managed,3);assert.equal(lookups,3);
console.log('PASS actual owner label API: UUID and workspace-slug resolution, create/find, unavailable workspace denied; RPC owner authorization retained.');
}finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}})().catch(e=>{console.error(e);process.exitCode=1;});
