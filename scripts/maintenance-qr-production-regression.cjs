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
