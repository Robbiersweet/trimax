/* eslint-disable @typescript-eslint/no-require-imports -- Production npm build requires a matching completed gate receipt. */
const {read,localFailures,digest,sourceHashes}=require('./contract.cjs');
const manifest=read('release/trimax-release-manifest.json'),failures=localFailures(manifest);
if(!process.env.TRIMAX_RELEASE_GATE_RESULT)failures.push('TRIMAX_RELEASE_GATE_RESULT is required for production build');
else{const result=read(process.env.TRIMAX_RELEASE_GATE_RESULT);if(result.status!=='PASS'||result.releaseId!==manifest.releaseId||result.sourceBundle!==digest(sourceHashes())||result.corpusHash!==manifest.acceptance.sha256)failures.push('Gate receipt does not authorize this exact release');}
if(failures.length)throw Error('Release build blocked: '+failures.join('; '));
console.log('Exact release gate receipt verified; physical acceptance remains a separate production gate');
