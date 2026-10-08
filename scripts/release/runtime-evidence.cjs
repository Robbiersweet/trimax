/* eslint-disable @typescript-eslint/no-require-imports -- Evaluate authentic read-only RPC evidence; never accept local startup as deployed evidence. */
const {compareDatabase}=require('./contract.cjs');
function classify(manifest,engine,config,response){
 const failure=reason=>({database:{status:'FAIL',failures:[reason]},runtime:{status:'FAIL',failures:[reason]}});
 if(response.error)return failure(response.error);
 if(response.status===404&&response.body?.code==='PGRST202')return{database:{status:'DEPLOYMENT_PREREQUISITE',failures:[],reason:'Reviewed attestation RPC is not installed'},runtime:{status:'DEPLOYMENT_PREREQUISITE',failures:[],reason:'Deployed attestation unavailable before RPC installation'}};
 if(response.status!==200)return failure('Read-only attestation HTTP '+response.status);
 if(config.supabaseUrl!==`https://${manifest.supabaseProjectId}.supabase.co`||config.businessId!==manifest.workerConfiguration.businessId)return failure('Project/business differs from sealed contract');
 const actual=response.body,errors=compareDatabase(manifest.database,actual,engine,config.businessId);
 if(errors.length)return failure(errors.join('; '));
 const database={status:'PASS',failures:[],observedAt:actual.observedAt};
 const deployed=actual[engine==='legacy'?'legacyRelease':'v2Release'];
 if(deployed==null)return{database,runtime:{status:'DEPLOYMENT_PREREQUISITE',failures:[],reason:'No deployed candidate worker attestation has been recorded'}};
 const expected={releaseId:manifest.releaseId,engine,sourceCommit:manifest.components[engine].commit,sourceBundle:manifest.sourceBundle.sha256,modelBundle:manifest.modelBundle.sha256,runtimeSources:manifest.runtimeSources.sha256,databaseFingerprint:manifest.database.fingerprints.schema.sha256,paymentWriteCapability:false};
 const mismatches=Object.entries(expected).filter(([k,v])=>deployed[k]!==v).map(([k])=>'Deployed '+engine+' '+k+' mismatch');
 if(!Number.isFinite(Date.parse(deployed.validatedAt))||Date.parse(deployed.validatedAt)>Date.now()+60000)mismatches.push('Invalid deployed validation timestamp');
 // The exact pinned validateStartup source validates sanitized config, project,
 // models and restricted scope before emitting this release record. The live RPC
 // revalidates credential/business/DB/flags. This is persisted job provenance,
 // not a heartbeat or proof an idle process is still alive.
 return{database,runtime:{status:mismatches.length?'FAIL':'PASS',failures:mismatches,evidence:deployed,provenance:'Authenticated read-only trimax_release_runtime persisted worker result'}};
}
function aggregate(results,key){const rows=results.map(r=>({engine:r.engine,...r[key]}));return{status:rows.some(r=>r.status==='FAIL')?'FAIL':rows.some(r=>r.status==='DEPLOYMENT_PREREQUISITE')?'DEPLOYMENT_PREREQUISITE':'PASS',failures:rows.flatMap(r=>r.failures||[]),engines:rows};}
module.exports={classify,aggregate};
