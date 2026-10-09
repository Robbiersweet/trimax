/* eslint-disable @typescript-eslint/no-require-imports -- Exact sealed receipt authorization; predeployment readiness is not final PASS. */
const {read,localFailures,digest,sourceHashes}=require('./contract.cjs');
const {authorize}=require('./gate-state.cjs');
console.log('Release build diagnostics',JSON.stringify(require('./build-diagnostics.cjs').record('prebuild')));
const manifest=read('release/trimax-release-manifest.json'),failures=localFailures(manifest);
if(!process.env.TRIMAX_RELEASE_GATE_RESULT)failures.push('TRIMAX_RELEASE_GATE_RESULT is required for production build');
else{const result=read(process.env.TRIMAX_RELEASE_GATE_RESULT);failures.push(...authorize(manifest,result,read(manifest.acceptance.corpus),digest(sourceHashes())));}
if(failures.length)throw Error('Release build blocked: '+failures.join('; '));
console.log('Exact sealed release authorized for build; predeployment readiness is not final release PASS; physical acceptance remains separate');
