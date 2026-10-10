/* eslint-disable @typescript-eslint/no-require-imports -- Explicit reviewed prior contract and independently observed serving web; no deployment or inference. */
const fs=require('node:fs'),path=require('node:path');
const c=require('./contract.cjs');
function verifyWeb(manifest,observed,now=Date.now()){
 const errors=[];
 if(!((observed?.url==='https://app.rnlcreations.com/admin/ocr-attempts?business=rnl-creations'&&observed?.method==='authenticated-release-diagnostics')||(observed?.method==='authenticated-vercel-production-deployment'&&observed?.committedManifestVerified===true)))errors.push('Missing authenticated serving-web observation');
 const age=now-Date.parse(observed?.observedAt);
 if(!Number.isFinite(age)||age< -60000||age>1800000)errors.push('Serving-web observation stale or invalid');
 const expected={releaseId:manifest.releaseId,sourceCommit:manifest.components.web.commit,modelBundle:manifest.modelBundle.sha256,databaseFingerprint:manifest.database.fingerprints.schema.sha256};
 for(const [k,v] of Object.entries(expected))if(observed?.[k]!==v)errors.push('Serving web '+k+' mismatch');
 if(observed?.paymentWriteCapability===true)errors.push('Unsafe web evidence');
 return errors;
}
function load(manifest,mode){
 if(!['PREDEPLOYMENT','POSTDEPLOYMENT'].includes(mode))throw Error('Explicit runtime mode required');
 const context=manifest.upgradeContext;
 if(!context||context.candidateReleaseId!==manifest.releaseId)throw Error('Explicit candidate upgrade context missing');
 const approved=context.currentProductionRelease;
 if(!/^[a-f0-9]{40}$/.test(approved?.manifestCommit||''))throw Error('Approved prior manifest commit missing');
 const bytes=c.git(['show',approved.manifestCommit+':release/trimax-release-manifest.json']);
 const prior=JSON.parse(bytes);
 if(c.digest(prior)!==approved.manifestDigest||prior.releaseId!==approved.releaseId)throw Error('Approved prior manifest changed');
 if(c.git(['diff',prior.components.web.commit,approved.manifestCommit,'--',...c.sourcePaths]))throw Error('Prior seal changed executable source');
 const proofFile=process.env.TRIMAX_SERVING_WEB_EVIDENCE;
 if(!proofFile||path.resolve(proofFile).startsWith(c.root+path.sep))throw Error('Fresh independent serving-web evidence required outside checkout');
 let servingWeb=c.read(proofFile);const target=mode==='POSTDEPLOYMENT'?manifest:prior;
 if(servingWeb.method==='authenticated-vercel-production-deployment'){
  if(servingWeb.alias!=='app.rnlcreations.com'||servingWeb.state!=='Ready'||servingWeb.environment!=='Production'||servingWeb.latest!==true||!/^https:\/\/vercel\.com\/trimax-s-projects\/trimax\/[A-Za-z0-9]+$/.test(servingWeb.url)||!/^([a-f0-9]{40})$/.test(servingWeb.deploymentCommit||''))throw Error('Invalid current Vercel deployment observation');
  if(mode==='PREDEPLOYMENT'&&(servingWeb.deploymentCommit!==approved.deploymentCommit||servingWeb.deploymentId!==approved.deploymentId))throw Error('Serving deployment is not the approved prior deployment');
  const deployedManifest=JSON.parse(c.git(['show',servingWeb.deploymentCommit+':release/trimax-release-manifest.json']));
  if(c.digest(deployedManifest)!==c.digest(target)||c.git(['diff',target.components.web.commit,servingWeb.deploymentCommit,'--',...c.sourcePaths]))throw Error('Serving deployment source/manifest differs from expected release');
  servingWeb={...servingWeb,platformObservation:servingWeb,committedManifestVerified:true,releaseId:deployedManifest.releaseId,sourceCommit:deployedManifest.components.web.commit,modelBundle:deployedManifest.modelBundle.sha256,databaseFingerprint:deployedManifest.database.fingerprints.schema.sha256};
 }
 const errors=verifyWeb(target,servingWeb);
 if(errors.length)throw Error(errors.join('; '));
 // Preserve the exact operator observation in the private gate receipt. It is
 // authenticated UI evidence, not a local build claiming to be deployed.
 return{mode,currentProductionRelease:prior,candidateReleaseId:manifest.releaseId,servingWeb,servingWebEvidenceHash:c.hash(fs.readFileSync(proofFile))};
}
module.exports={load,verifyWeb};
