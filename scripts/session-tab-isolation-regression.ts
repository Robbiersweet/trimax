import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {startSecureBrowserSession,restoreSecureBrowserSession,recordSecureActivity,getSessionSecurityStatus,clearSecureBrowserSession,expireSecureBrowserSession,SESSION_IDLE_TIMEOUT_MS,SESSION_ABSOLUTE_TIMEOUT_MS} from '../src/app/lib/sessionSecurity.ts';
const storage=()=>{const values=new Map<string,string>();return {getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>values.set(k,v),removeItem:(k:string)=>values.delete(k)};};
const shared=storage(),owner=storage(),stale=storage();
const setTab=(sessionStorage:ReturnType<typeof storage>)=>Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:shared,sessionStorage}});
let revocations=0;const signOut=async()=>{revocations++;};
try{
 setTab(owner);startSecureBrowserSession();assert.equal(getSessionSecurityStatus().valid,true);
 setTab(stale);assert.deepEqual(getSessionSecurityStatus(),{valid:false,reason:'new-browser-session'});
 // Reproduce old behavior: a marker-less tab destroys the owner's timestamps.
 clearSecureBrowserSession();setTab(owner);assert.equal(getSessionSecurityStatus().valid,false);
 startSecureBrowserSession();const started=shared.getItem('trimax.sessionStartedAt');
 setTab(stale);await expireSecureBrowserSession('new-browser-session',signOut);
 assert.equal(revocations,0);assert.equal(shared.getItem('trimax.sessionStartedAt'),started);
 assert.deepEqual(getSessionSecurityStatus(),{valid:false,reason:'new-browser-session'});
 setTab(owner);assert.equal(getSessionSecurityStatus().valid,true);
 // Existing idle and absolute limits and explicit revocation stay enforced.
 for(const reason of ['idle-timeout','session-expired','manual-lock']){
  startSecureBrowserSession();
  if(reason==='idle-timeout')shared.setItem('trimax.lastActivityAt',String(Date.now()-SESSION_IDLE_TIMEOUT_MS-1));
  if(reason==='session-expired')shared.setItem('trimax.sessionStartedAt',String(Date.now()-SESSION_ABSOLUTE_TIMEOUT_MS-1));
  if(reason!=='manual-lock')assert.deepEqual(getSessionSecurityStatus(),{valid:false,reason});
  await expireSecureBrowserSession(reason,signOut);
  assert.equal(shared.getItem('trimax.sessionStartedAt'),null);
  assert.equal(owner.getItem('trimax.activeBrowserSession'),null);
 }
 assert.equal(revocations,3);

 // A verified existing lease survives new tabs/reopen without extending either clock.
 setTab(owner);startSecureBrowserSession('owner');
 assert.deepEqual(getSessionSecurityStatus('other'),{valid:false,reason:'new-browser-session'},'An existing tab marker cannot adopt a different authenticated user');
 const originalStart=shared.getItem('trimax.sessionStartedAt'),originalActivity=shared.getItem('trimax.lastActivityAt');
 setTab(stale);stale.removeItem('trimax.activeBrowserSession');
 assert.equal(restoreSecureBrowserSession('other').valid,false,'Wrong user cannot adopt a lease');
 assert.equal(stale.getItem('trimax.activeBrowserSession'),null);
 assert.equal(restoreSecureBrowserSession('owner').valid,true);
 assert.equal(shared.getItem('trimax.sessionStartedAt'),originalStart);
 assert.equal(shared.getItem('trimax.lastActivityAt'),originalActivity);
 setTab(storage());assert.equal(restoreSecureBrowserSession('owner').valid,true,'Normal PWA/browser reopen');
 shared.setItem('trimax.lastActivityAt',String(Date.now()-SESSION_IDLE_TIMEOUT_MS-1));
 const expiredActivity=shared.getItem('trimax.lastActivityAt');recordSecureActivity();
 assert.equal(shared.getItem('trimax.lastActivityAt'),expiredActivity,'Input must not revive an expired lease');
 assert.deepEqual(restoreSecureBrowserSession('owner'),{valid:false,reason:'idle-timeout'});
 clearSecureBrowserSession();assert.equal(restoreSecureBrowserSession('owner').valid,false,'Manual logout/lock cannot be restored');
 startSecureBrowserSession();setTab(storage());assert.equal(restoreSecureBrowserSession('owner').valid,true,'Bind a valid pre-upgrade lease after verification');
 assert.equal(shared.getItem('trimax.sessionUserId'),'owner');
 const guard=readFileSync(new URL('../src/app/components/AuthGuard.tsx',import.meta.url),'utf8');
 assert.ok(guard.includes('status.reason === "new-browser-session" && isLoginPage'));
 assert.ok(!guard.includes('startSecureBrowserSession'));
 console.log('PASS: old cross-tab invalidation reproduced; unverified tab stays locked; owner state preserved; verified reopen keeps original clocks; expired input cannot revive lease; idle/absolute/manual revocation retained');
}finally{Reflect.deleteProperty(globalThis,'window');}
