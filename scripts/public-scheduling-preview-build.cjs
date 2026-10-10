/* eslint-disable @typescript-eslint/no-require-imports -- Isolated scheduling review build; sealed production guard is unchanged. */
const cp=require('node:child_process');
const preview=process.env.VERCEL_ENV==='preview'&&process.env.VERCEL_GIT_COMMIT_REF==='codex/public-scheduling-foundation';
function run(command){cp.execSync(command,{stdio:'inherit'});}
if(!preview){throw Error('Scheduling review build requires the exact Preview branch. Use the normal sealed build elsewhere.');}
else {
 for(const key of ['PUBLIC_SCHEDULING_DEV_ADAPTER','PUBLIC_SCHEDULING_VISUAL_FIXTURE'])if(process.env[key]!=='enabled')throw Error('Preview flag missing: '+key);
 for(const key of ['SUPABASE_SERVICE_ROLE_KEY','RESEND_API_KEY','VAPID_PRIVATE_KEY','CRON_SECRET'])if(process.env[key]!=='preview-disabled')throw Error('Preview must not inherit live credential: '+key);
 console.log('SCHEDULING REVIEW PREVIEW ONLY: not a sealed rc10 production release; production guard unchanged.');
 run('npm run test:public-scheduling');run('npm run lint');run('node node_modules/typescript/bin/tsc --noEmit');run('node node_modules/next/dist/bin/next build');
}
