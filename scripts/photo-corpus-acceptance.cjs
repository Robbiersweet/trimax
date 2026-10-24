/* eslint-disable @typescript-eslint/no-require-imports -- A complete source-pinned physical corpus is a release prerequisite. */
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,['--experimental-strip-types','scripts/remittance-photo-corpus.cjs','--verify-receipt'],{cwd:process.cwd(),stdio:'inherit',windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
