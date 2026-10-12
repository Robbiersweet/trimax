import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHmac} from 'node:crypto';
import {productionOwner} from '../src/app/lib/publicScheduling/productionOwner.ts';
import assert from 'node:assert/strict';
import {turnstileProvider,upstashProvider,trustedVercelIdentity} from '../src/app/lib/publicScheduling/providers.ts';
import {productionConfig,restrictedRpc,unusedCapabilityHash} from '../src/app/lib/publicScheduling/productionRuntime.ts';
import {productionSubmission} from '../src/app/lib/publicScheduling/productionHandler.ts';
import {getPublicBusiness} from '../src/app/lib/publicScheduling/domain.ts';
const reply=(body:unknown)=>Response.json(body);
const transport=(body:unknown)=>(async()=>reply(body)) as typeof fetch;
const challengeInput={token:'one-use-token',action:'public-scheduling' as const,businessSlug:'rnl-creations',requestFingerprint:'a'.repeat(64)};
for(const [body,expected] of [[{success:true,hostname:'app.test',action:'public-scheduling'},true],[{success:false},false],[{success:true,hostname:'wrong.test',action:'public-scheduling'},false],[{success:true,hostname:'app.test',action:'wrong'},false],[{success:false,'error-codes':['timeout-or-duplicate']},false]] as const){assert.equal((await turnstileProvider('secret','app.test',transport(body)).verify(challengeInput)).verified,expected);}
assert.equal((await turnstileProvider('secret','app.test',transport({success:true})).verify({...challengeInput,token:''})).verified,false);
await assert.rejects(turnstileProvider('secret','app.test',async()=>{throw new DOMException('timeout','TimeoutError');}).verify(challengeInput));
await assert.rejects(turnstileProvider('secret','app.test',async()=>new Response('',{status:503})).verify(challengeInput));
for(const count of [1,4,5,6])assert.equal((await upstashProvider('https://test.upstash.io','secret',transport({result:[count,599]})).consume({key:'a'.repeat(64),limit:5,windowSeconds:600})).allowed,count<=5);
await assert.rejects(upstashProvider('https://test.upstash.io','secret',async()=>{throw Error('offline');}).consume({key:'a'.repeat(64),limit:5,windowSeconds:600}));
await assert.rejects(upstashProvider('https://test.upstash.io','secret',transport({result:[1,-1]})).consume({key:'a'.repeat(64),limit:5,windowSeconds:600}));
const ingress={VERCEL:'1',VERCEL_ENV:'production'};
const req=(headers:Record<string,string>)=>new Request('https://app.test',{headers});
assert.equal(trustedVercelIdentity(req({'x-vercel-forwarded-for':'192.0.2.3','x-forwarded-for':'evil','x-real-ip':'evil'}),ingress),'192.0.2.3');
assert.throws(()=>trustedVercelIdentity(req({'x-forwarded-for':'192.0.2.3'}),ingress));
assert.throws(()=>trustedVercelIdentity(req({'x-vercel-forwarded-for':'192.0.2.3, 192.0.2.4'}),ingress));
assert.throws(()=>trustedVercelIdentity(req({'x-vercel-forwarded-for':'192.0.2.3'}),{}));
assert.equal(trustedVercelIdentity(req({'x-vercel-forwarded-for':'2001:0db8:0:0:0:0:0:1'}),ingress),'2001:db8::1');
const env={...ingress,PUBLIC_SCHEDULING_PRODUCTION_ENABLED:'enabled',NEXT_PUBLIC_TURNSTILE_SITE_KEY:'site',TURNSTILE_SECRET_KEY:'secret',UPSTASH_REDIS_REST_URL:'https://test.upstash.io',UPSTASH_REDIS_REST_TOKEN:'secret',SCHEDULING_FINGERPRINT_SECRET:'s'.repeat(32),PUBLIC_SCHEDULING_ORIGIN:'https://app.test',NEXT_PUBLIC_SUPABASE_URL:'https://project.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'anon',SCHEDULING_INTAKE_JWT:'header.'+Buffer.from(JSON.stringify({role:'trimax_scheduling_intake',ref:'project',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.test'};
assert.throws(()=>productionConfig({...env,SCHEDULING_FINGERPRINT_SECRET:''}));
assert.throws(()=>productionConfig({...env,PUBLIC_SCHEDULING_PRODUCTION_ENABLED:''}));
assert.throws(()=>productionConfig({...env,SCHEDULING_INTAKE_JWT:'invalid'}));
await assert.rejects(restrictedRpc(productionConfig(env),transport({})).rpc('apply_payment',{}));
assert.equal(unusedCapabilityHash('secret','rnl','retry-key'),unusedCapabilityHash('secret','rnl','retry-key'));
const savedEnv={...process.env},savedFetch=globalThis.fetch;
try{
 Object.assign(process.env,env);
 let writes=0,challengeValid=true,rateAllowed=true,conflict=false;
 const business=getPublicBusiness('rnl-creations')!;
 globalThis.fetch=async(url,init)=>{
  const target=String(url);
  if(target.includes('siteverify'))return reply({success:challengeValid,hostname:'app.test',action:'public-scheduling'});
  if(target.includes('upstash.io')){assert.ok(!String(init?.body).includes('192.0.2.3'));return reply({result:[rateAllowed?1:6,599]});}
  if(target.endsWith('trimax_public_scheduling_config'))return reply(business);
  if(target.endsWith('trimax_submit_public_service_request')){if(conflict)return Response.json({message:'Idempotency conflict'},{status:400});writes++;assert.ok(!String(init?.body).includes('192.0.2.3'));return reply({id:'id',reference:'TEST',status:'pending_confirmation',submittedAt:new Date().toISOString()});}
  throw Error('Unexpected transport');
 };
 const payload={requestTypeId:'repair',customerName:'Test',phone:'5555555555',email:'test@example.test',preferredContact:'phone',address:'Test only',description:'Test service request',preferredDate:'',timeWindowId:'',flexibility:'flexible',urgency:'routine',notes:'',consent:true,website:''};
 const submit=(extra:Record<string,string>={},body:unknown=payload)=>productionSubmission(new Request('https://app.test/api/public-scheduling/rnl-creations',{method:'POST',headers:{origin:'https://app.test','Content-Type':'application/json','Idempotency-Key':'test-request-00000001','X-Turnstile-Token':'token','x-vercel-forwarded-for':'192.0.2.3',...extra},body:JSON.stringify(body)}),'rnl-creations');
 assert.equal((await submit()).status,201);assert.equal(writes,1);
 conflict=true;assert.equal((await submit()).status,409);assert.equal(writes,1);conflict=false;
 challengeValid=false;assert.equal((await submit()).status,503);assert.equal(writes,1);
 challengeValid=true;rateAllowed=false;assert.equal((await submit()).status,503);assert.equal(writes,1);
 rateAllowed=true;assert.equal((await submit({'X-Turnstile-Token':''})).status,503);
 assert.equal((await submit({origin:'https://evil.test'})).status,403);
 assert.equal((await submit({}, {...payload,businessId:'injected'})).status,503);
 assert.equal((await submit({}, {...payload,description:'x'.repeat(20000)})).status,400);
 process.env.PUBLIC_SCHEDULING_PRODUCTION_ENABLED='';assert.equal((await submit()).status,503);assert.equal(writes,1);

 let role='owner',ownerWrites=0,revision=1;
 const ownerRow={id:'11111111-1111-1111-1111-111111111111',business_id:'workspace',request_type_id:'type',public_reference:'TEST',customer_name:'Test',phone:'5555555555',email:'test@example.test',preferred_contact:'phone',service_address:'Test only',description:'Test',preferred_date:null,time_window_id:null,flexibility:'flexible',urgency:'routine',customer_notes:'',internal_notes:'',status:'pending_confirmation',revision,submitted_at:new Date().toISOString(),contact_consent_at:new Date().toISOString()};
 globalThis.fetch=async(url,init)=>{
  const target=new URL(String(url));
  const headers=new Headers(init?.headers);assert.equal(headers.get('authorization'),'Bearer owner-token');
  if(target.pathname==='/auth/v1/user')return reply({id:'owner-user'});
  if(target.pathname.endsWith('/public_scheduling_settings'))return reply({business_id:'workspace',public_slug:'rnl-creations',display_name:'R&L',enabled:true,mode:'request-only',owner_approval_required:true,available_weekdays:[1],blocked_dates:[],appointment_windows:[]});
  if(target.pathname.endsWith('/business_users')){assert.equal(target.searchParams.get('business_id'),'eq.workspace');assert.equal(target.searchParams.get('user_id'),'eq.owner-user');return reply([{role}]);}
  if(target.pathname.endsWith('/public_service_request_types'))return reply([{id:'type',public_key:'repair'}]);
  if(target.pathname.endsWith('/public_service_requests')){assert.equal(target.searchParams.get('business_id'),'eq.workspace');return reply(target.searchParams.get('id')&&target.searchParams.get('id')!=='eq.'+ownerRow.id?[]:[{...ownerRow,revision}]);}
  if(target.pathname.endsWith('/public_request_activity'))return reply([{id:'event',created_at:new Date().toISOString(),actor_id:'owner-user',event_type:'review_updated',details:{note:'Test',fromStatus:'pending_confirmation',toStatus:'reviewing'}}]);
  if(target.pathname.endsWith('/trimax_review_public_service_request')){ownerWrites++;revision++;return reply({id:ownerRow.id,revision,status:'reviewing'});}
  throw Error('Unexpected owner endpoint');
 };
 const ownerRequest=new Request('https://app.test/api/public-scheduling/intake',{headers:{Authorization:'Bearer owner-token'}});
 const owner=await productionOwner(ownerRequest,'rnl-creations');assert.equal((await owner.list())[0].activity?.[0].note,'Test');
 await owner.review({requestId:ownerRow.id,expectedRevision:1,mutationId:'test-review-00000001',status:'reviewing',note:'Test'});assert.equal(ownerWrites,1);
 await assert.rejects(owner.review({requestId:'22222222-2222-2222-2222-222222222222',expectedRevision:1,mutationId:'test-review-00000002',status:'reviewing',note:'Test'}));assert.equal(ownerWrites,1);
 role='admin';assert.ok(await productionOwner(ownerRequest,'rnl-creations'));
 role='member';await assert.rejects(productionOwner(ownerRequest,'rnl-creations'));
 role='';await assert.rejects(productionOwner(ownerRequest,'rnl-creations'));
 await assert.rejects(productionOwner(new Request('https://app.test'),'rnl-creations'));
}finally{process.env=savedEnv;globalThis.fetch=savedFetch;}
const directory=mkdtempSync(join(tmpdir(),'trimax-token-test-'));
try{
 const source=join(directory,'test-secret'),output=join(directory,'test-token');writeFileSync(source,'test-only-'.repeat(8),{mode:0o600});
 const result=spawnSync(process.execPath,['scripts/provision-scheduling-token.mjs','abcdefghijklmnopqrst',source,output],{encoding:'utf8'});assert.equal(result.status,0);
 const token=readFileSync(output,'utf8'),[header,body,signature]=token.split('.');const claims=JSON.parse(Buffer.from(body,'base64url').toString());assert.equal(claims.role,'trimax_scheduling_intake');assert.equal(claims.exp-claims.iat,604800);
 assert.equal(signature,createHmac('sha256','test-only-'.repeat(8)).update(header+'.'+body).digest('base64url'));assert.ok(!result.stdout.includes(token));assert.ok(!result.stdout.includes('test-only-'));
 assert.notEqual(spawnSync(process.execPath,['scripts/provision-scheduling-token.mjs','abcdefghijklmnopqrst',source,output],{encoding:'utf8'}).status,0,'never overwrite credential file');
}finally{rmSync(directory,{recursive:true});}
console.log('Production scheduling provider/identity/fail-closed route regression PASS');
