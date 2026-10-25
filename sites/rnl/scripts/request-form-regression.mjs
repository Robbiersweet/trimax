import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const load=createRequire(import.meta.url);
const source=fs.readFileSync(fileURLToPath(new URL('../../../src/app/book/RequestForm.tsx',import.meta.url)),'utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function harness(enabled){let slots=[],cursor=0,calls=[],resolve;const hook={useState(initial){const n=cursor++;if(!(n in slots))slots[n]=initial;return[slots[n],v=>{slots[n]=typeof v==='function'?v(slots[n]):v;}];},useRef(value){const n=cursor++;return slots[n]??=( {current:value});}};
const compiled={exports:{}};vm.runInNewContext(js,{exports:compiled.exports,module:compiled,require:name=>name==='react'?hook:name==='./RequestPhotos'?{default:()=>null}:name.includes('requestPhotos/clientCapability')?{createPhotoCapability:async()=>{throw Error('Photos gate must remain off');}}:name==='./TurnstileChallenge'?{default:()=>null}:name.includes('communications/consent')?{SMS_DISCLOSURE:'Optional SMS disclosure',SMS_DISCLOSURE_VERSION:'transactional-sms-2026-10-25'}:load(name),crypto:load('node:crypto'),requestAnimationFrame:fn=>fn(),fetch:async(url,options)=>{calls.push({url,...options});return new Promise(r=>{resolve=r;});}});
const render=()=>{cursor=0;return compiled.exports.default({business:{slug:'rnl-creations',displayName:'R&L',requestTypes:[],rules:{windows:[],timeZone:'America/Los_Angeles'}},smsConsentEnabled:enabled});};
function nodes(tree,type){if(!tree||typeof tree!=='object')return[];return [...(tree.type===type?[tree]:[]),...([tree.props?.children].flat(Infinity).flatMap(n=>nodes(n,type)))];}
const submit=tree=>nodes(tree,'form')[0].props.onSubmit({preventDefault(){}});return{render,nodes,submit,calls,finish:()=>resolve({ok:false,json:async()=>({error:'Synthetic retry'})})};}
(async()=>{for(const enabled of [false,true]){const h=harness(enabled);let tree=h.render();await h.submit(tree);tree=h.render();await h.submit(tree);tree=h.render();const checks=h.nodes(tree,'input').filter(n=>n.props.type==='checkbox');assert.equal(checks.length,enabled?2:1);if(enabled){assert.equal(checks[0].props.checked,false);assert.equal(checks[0].props.required,undefined);checks[0].props.onChange({target:{checked:true}});tree=h.render();}
const first=h.submit(tree);await h.submit(tree);assert.equal(h.calls.length,1,'synchronous double submit must not duplicate request');const body=JSON.parse(h.calls[0].body);assert.equal(Object.hasOwn(body,'smsConsent'),enabled);if(enabled)assert.equal(body.smsConsent,true);const key=h.calls[0].headers['Idempotency-Key'];h.finish();await first;tree=h.render();const retry=h.submit(tree);assert.equal(h.calls[1].headers['Idempotency-Key'],key,'retry retains same identity');h.finish();await retry;}
console.log('PASS actual RequestForm optional unchecked consent, gate-off payload omission, synchronous double-submit guard and retry idempotency.');})().catch(e=>{console.error(e);process.exitCode=1;});
