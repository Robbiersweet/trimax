import assert from 'node:assert/strict';
import {upstashProvider,turnstileProvider} from '../src/app/lib/publicScheduling/providers.ts';
import {enforceProductionAbuse} from '../src/app/lib/publicScheduling/abuseProtection.ts';
import {reportSchedulingFailure} from '../src/app/lib/publicScheduling/diagnostics.ts';
const secret='DO_NOT_LOG_PROVIDER_SECRET_OR_BODY';
const input={businessSlug:'rnl-creations',challengeToken:secret,trustedClientIdentity:'192.0.2.41'};
const logs:string[]=[];const original=console.warn;
console.warn=(value:unknown)=>{logs.push(String(value));};
try{
 let challengeCalls=0;
 const successChallenge={verify:async()=>{challengeCalls++;return {verified:true};}};
 for(const [transport,code,status] of [
  [async()=>new Response(secret,{status:401}),'rate_http',401],
  [async()=>new Response(secret,{status:403}),'rate_http',403],
  [async()=>{throw Error(secret);},'rate_network',undefined],
  [async()=>new Response(secret),'rate_response',undefined],
  [async()=>Response.json({error:secret}),'rate_response',undefined],
  [async()=>Response.json({result:[1,-1]}),'rate_response',undefined],
 ] as const){
  logs.length=0;
  const result=await enforceProductionAbuse(input,{fingerprintSecret:secret,rateLimit:upstashProvider('https://test.upstash.io',secret,transport),challenge:successChallenge});
  assert.equal(result.allowed,false);assert.equal(challengeCalls,0);
  assert.deepEqual(JSON.parse(logs[0]),{event:'scheduling_failure',code,...(status?{status}:{})});
  assert.ok(!logs.join('').includes(secret));assert.ok(!logs.join('').includes(input.trustedClientIdentity));
 }
 for(const [transport,code] of [
  [async()=>new Response(secret,{status:502}),'challenge_http'],
  [async()=>{throw Error(secret);},'challenge_network'],
  [async()=>new Response(secret),'challenge_response'],
  [async()=>Response.json({success:false}),'challenge_rejected'],
 ] as const){
  logs.length=0;
  assert.equal((await enforceProductionAbuse(input,{fingerprintSecret:secret,rateLimit:{consume:async()=>({allowed:true})},challenge:turnstileProvider(secret,'test.invalid',transport)})).allowed,false);
  assert.equal(JSON.parse(logs[0]).code,code);assert.ok(!logs.join('').includes(secret));
 }
 logs.length=0;
 assert.equal((await enforceProductionAbuse({...input,challengeToken:''},{fingerprintSecret:secret,rateLimit:{consume:async()=>{throw Error('must not call');}},challenge:successChallenge})).allowed,false);
 assert.equal(JSON.parse(logs[0]).code,'abuse_prerequisite');
 logs.length=0;
 assert.equal((await enforceProductionAbuse(input,{fingerprintSecret:secret,rateLimit:{consume:async()=>({allowed:true})},challenge:successChallenge})).allowed,true);
 assert.equal(logs.length,0);
 for(const codes of [['invalid-input-secret'],[secret,'bad-request'],[secret],secret,null]){
  logs.length=0;
  const transport=async()=>Response.json({success:false,'error-codes':codes,secret,token:secret},{status:400});
  const result=await enforceProductionAbuse(input,{fingerprintSecret:secret,rateLimit:{consume:async()=>({allowed:true})},challenge:turnstileProvider(secret,'test.invalid',transport)});
  assert.equal(result.allowed,false);assert.equal(result.reason,'abuse_protection_unavailable');
  const expected=Array.isArray(codes)?codes.find(v=>v==='invalid-input-secret'||v==='bad-request'):undefined;
  assert.deepEqual(JSON.parse(logs[0]),{event:'scheduling_failure',code:'challenge_http',status:400,...(expected?{providerCode:expected}:{})});
  assert.ok(!logs.join('').includes(secret));
 }
 logs.length=0;reportSchedulingFailure('challenge_http',400,secret);reportSchedulingFailure('rate_http',401,'invalid-input-secret');
 assert.ok(logs.every(line=>!line.includes('providerCode')&&!line.includes(secret)));
 console.warn=()=>{throw Error('logger failure');};
 assert.equal((await enforceProductionAbuse(input)).allowed,false);
}finally{console.warn=original;}
console.log('PASS: sanitized provider diagnostics, ordering, fail-closed behavior and logger failure');
