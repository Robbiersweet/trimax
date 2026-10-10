/* eslint-disable @typescript-eslint/no-require-imports -- Evaluate authentic read-only RPC evidence; never accept local startup as deployed evidence. */
const {compareDatabase,digest}=require('./contract.cjs');
function identity(manifest,engine){return{releaseId:manifest.releaseId,engine,sourceCommit:manifest.components[engine].commit,sourceBundle:manifest.sourceBundle.sha256,modelBundle:manifest.modelBundle.sha256,runtimeSources:manifest.runtimeSources.sha256,databaseFingerprint:manifest.database.fingerprints.schema.sha256,paymentWriteCapability:false};}
function classify(manifest,engine,config,response,context={mode:'PREDEPLOYMENT'}){
 const failure=reason=>({database:{status:'FAIL',failures:[reason]},runtime:{status:'FAIL',failures:[reason]}});
 if(!['PREDEPLOYMENT','POSTDEPLOYMENT'].includes(context.mode))return failure('Explicit runtime gate mode required');
 const prerequisite=reason=>({status:context.mode==='PREDEPLOYMENT'?'DEPLOYMENT_PREREQUISITE':'FAIL',failures:context.mode==='PREDEPLOYMENT'?[]:[reason],reason});
 if(response.error)return failure(response.error);
 if(response.status===404&&response.body?.code==='PGRST202')return{database:prerequisite('Reviewed attestation RPC is not installed'),runtime:prerequisite('Deployed attestation unavailable before RPC installation')};
 if(response.status!==200)return failure('Read-only attestation HTTP '+response.status);
 if(config.supabaseUrl!==`https://${manifest.supabaseProjectId}.supabase.co`||config.businessId!==manifest.workerConfiguration.businessId)return failure('Project/business differs from sealed contract');
 const actual=response.body,errors=compareDatabase(manifest.database,actual,engine,config.businessId);
 if(errors.length)return failure(errors.join('; '));
 const database={status:'PASS',failures:[],observedAt:actual.observedAt};
 if([actual.legacyRelease,actual.v2Release].some(r=>r?.paymentWriteCapability===true))return failure('Deployed worker declares payment-write capability');
 const safeConfig=Object.fromEntries(Object.entries(config).filter(([k])=>!['anonKey','workerKey','releaseAttestation'].includes(k)));
 if(manifest.workerConfiguration.configHashes?.[engine]&&digest(safeConfig)!==manifest.workerConfiguration.configHashes[engine])return failure('Worker configuration differs from candidate contract');
 const deployed=actual[engine==='legacy'?'legacyRelease':'v2Release'];
 if(deployed==null)return{database,runtime:prerequisite('No deployed candidate worker attestation has been recorded')};
 let expected=identity(manifest,engine),prior=false;
 if(context.mode==='PREDEPLOYMENT'&&deployed.releaseId!==manifest.releaseId&&context.currentProductionRelease){
  const approved=context.currentProductionRelease;
  if(context.servingWeb?.releaseId!==approved.releaseId||context.servingWeb?.sourceCommit!==approved.components.web.commit)return failure('Serving web does not match approved prior release');
  if(deployed.releaseId!==approved.releaseId)return failure('Unknown or unapproved deployed release');
  if(compareDatabase(approved.database,actual,engine,config.businessId).length)return failure('Prior release database/configuration is no longer valid');
  if(digest(safeConfig)!==approved.workerConfiguration.configHashes?.[engine])return failure('Prior worker configuration differs from approved contract');
  expected=identity(approved,engine);prior=true;
 }
 const mismatches=Object.entries(expected).filter(([k,v])=>deployed[k]!==v).map(([k])=>'Deployed '+engine+' '+k+' mismatch');
 if(!Number.isFinite(Date.parse(deployed.validatedAt))||Date.parse(deployed.validatedAt)>Date.now()+60000)mismatches.push('Invalid deployed validation timestamp');
 // The exact pinned validateStartup source validates sanitized config, project,
 // models and restricted scope before emitting this release record. The live RPC
 // revalidates credential/business/DB/flags. This is persisted job provenance,
 // not a heartbeat or proof an idle process is still alive.
 return{database,runtime:{...(prior&&!mismatches.length?prerequisite('Known approved serving prior release; candidate cutover pending'):{status:mismatches.length?'FAIL':'PASS',failures:mismatches}),evidence:deployed,provenance:'Authenticated read-only trimax_release_runtime persisted worker result'}};
}
function aggregate(results,key){const rows=results.map(r=>({engine:r.engine,...r[key]}));return{status:rows.some(r=>r.status==='FAIL')?'FAIL':rows.some(r=>r.status==='DEPLOYMENT_PREREQUISITE')?'DEPLOYMENT_PREREQUISITE':'PASS',failures:rows.flatMap(r=>r.failures||[]),engines:rows};}
module.exports={classify,aggregate,identity};
