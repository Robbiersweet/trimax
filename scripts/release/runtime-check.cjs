/* eslint-disable @typescript-eslint/no-require-imports -- Read-only validation, never claim a job. */
const path=require('node:path');const {read,validateLocalRuntime,validateStartup}=require('./contract.cjs');
(async()=>{const results=[];for(const [engine,envName,directory] of [['legacy','TRIMAX_LEGACY_CONFIG','ocr-legacy-worker'],['v2-shadow','TRIMAX_SHADOW_CONFIG','ocr-shadow-worker']]){
 const file=process.env[envName]||path.join(process.env.LOCALAPPDATA,'Trimax',directory,'worker.json');
 try{const config=read(file);validateLocalRuntime(config,engine);console.log(engine+' candidate source/model/config validation PASS');
 const attestation=await validateStartup(config,engine);results.push({engine,status:'PASS',attestation});}
 catch(e){results.push({engine,status:e.code==='DEPLOYMENT_PREREQUISITE'?e.code:'FAIL',error:e.message});}}
 console.log(JSON.stringify({results}));process.exitCode=results.some(r=>r.status==='FAIL')?1:results.some(r=>r.status==='DEPLOYMENT_PREREQUISITE')?2:0;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
