/* eslint-disable @typescript-eslint/no-require-imports -- Release states only; never inference or worker processing. */
const path=require('node:path');
const scripts=require('./gate-checks.cjs');
const prerequisites=new Set(['production-runtime-attestation','live-database-attestation']);
function mode(value){if(!['predeployment','postdeployment'].includes(value))throw Error('Explicit --mode=predeployment or --mode=postdeployment is required');return value.toUpperCase();}
function requiredChecks(corpus){return ['clean-manifest-source-start','frozen-corpus-integrity','clean-dependency-install','production-runtime-attestation','model-bundle','runtime-source-bundles','live-database-attestation','sql-test-runtime',...scripts.map(f=>path.basename(f).replace(/\.(cjs|ts)$/, '')),'frozen-business-snapshot',...corpus.documents.flatMap(d=>['legacy','v2-shadow'].map(e=>'retained-'+d.id+'-'+e)),'lint','typescript','production-build','clean-manifest-source-end'];}
function evaluate(report,corpus){
 const errors=[];if(!['PREDEPLOYMENT','POSTDEPLOYMENT'].includes(report.mode))errors.push('Missing/invalid gate mode');
 const checks=report.checks||[],required=requiredChecks(corpus);
 for(const name of required)if(checks.filter(c=>c.name===name).length!==1)errors.push('Missing/duplicate check: '+name);
 for(const c of checks){if(!required.includes(c.name))errors.push('Unknown check: '+c.name);if(c.failures?.length||!['PASS','FAIL','DEPLOYMENT_PREREQUISITE'].includes(c.status)||c.status==='FAIL')errors.push('Failed check: '+c.name);
 if(c.status==='DEPLOYMENT_PREREQUISITE'&&(!prerequisites.has(c.name)||report.mode!=='PREDEPLOYMENT'))errors.push('Unmet prerequisite: '+c.name);}
 const retained=report.retained||[];
 const retainedPass=retained.length===corpus.documents.length&&corpus.documents.every(d=>retained.filter(r=>r.id===d.id&&r.status==='PASS'&&!r.failures?.length).length===1);
 if(!retainedPass)errors.push('Frozen retained acceptance failed/incomplete');
 const codePass=!errors.some(e=>e!=='Frozen retained acceptance failed/incomplete');
 const status=errors.length?'FAIL':report.mode==='PREDEPLOYMENT'?'READY_FOR_CONTROLLED_DEPLOYMENT':'PASS';
 return {status,codeGate:codePass?'CODE_GATE_PASSED':'CODE_GATE_FAILED',retainedGate:retainedPass?'RETAINED_REAL_GATE_PASSED':'RETAINED_REAL_GATE_FAILED',physicalAcceptance:'PHYSICAL_ACCEPTANCE_PENDING',stateErrors:errors};
}
function authorize(manifest,report,corpus,sourceBundle,localErrors=[]){
 const failures=[...localErrors],decision=evaluate(report,corpus);
 if(!report.finishedAt||report.releaseId!==manifest.releaseId||report.sourceBundle!==sourceBundle||report.corpusHash!==manifest.acceptance.sha256)failures.push('Receipt is incomplete or not for the sealed release');
 if(report.status!==decision.status||report.codeGate!==decision.codeGate||report.retainedGate!==decision.retainedGate||decision.status==='FAIL')failures.push('Gate receipt does not authorize this exact release');
 if(report.physicalAcceptance!=='PHYSICAL_ACCEPTANCE_PENDING')failures.push('Build receipt cannot assert physical acceptance');
 return failures;
}
module.exports={mode,requiredChecks,evaluate,authorize};
