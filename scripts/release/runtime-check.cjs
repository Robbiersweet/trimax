/* eslint-disable @typescript-eslint/no-require-imports -- Read-only validation, never claim a job. */
const fs=require('node:fs'),path=require('node:path');
const {read,validateLocalRuntime}=require('./contract.cjs');
const {classify,aggregate}=require('./runtime-evidence.cjs');
(async()=>{const results=[];for(const [engine,envName,directory] of [['legacy','TRIMAX_LEGACY_CONFIG','ocr-legacy-worker'],['v2-shadow','TRIMAX_SHADOW_CONFIG','ocr-shadow-worker']]){
 const file=process.env[envName]||path.join(process.env.LOCALAPPDATA,'Trimax',directory,'worker.json');
 try{const config=read(file),manifest=validateLocalRuntime(config,engine);
 const response=await fetch(config.supabaseUrl+'/rest/v1/rpc/trimax_release_runtime',{method:'POST',headers:{apikey:config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_business:config.businessId,p_key:config.workerKey,p_engine:engine}),signal:AbortSignal.timeout(15000)});
 const body=await response.json();results.push({engine,...classify(manifest,engine,config,{status:response.status,body})});
 }catch(e){results.push({engine,database:{status:'FAIL',failures:[e.message]},runtime:{status:'FAIL',failures:[e.message]}});}}
 const report={observedAt:new Date().toISOString(),database:aggregate(results,'database'),runtime:aggregate(results,'runtime')};
 if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));process.exitCode=[report.database,report.runtime].some(r=>r.status==='FAIL')?1:[report.database,report.runtime].some(r=>r.status==='DEPLOYMENT_PREREQUISITE')?2:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
