/** Server-only review environment. Production can never opt into this adapter. */
export function isSchedulingPreview(env:NodeJS.ProcessEnv=process.env){
 return env.VERCEL_ENV==='preview' && env.VERCEL_GIT_COMMIT_REF==='codex/public-scheduling-foundation';
}
export function schedulingDevelopmentEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.PUBLIC_SCHEDULING_DEV_ADAPTER==='enabled' && (isSchedulingPreview(env)||(!env.VERCEL_ENV&&env.NODE_ENV!=='production'));
}
export function schedulingVisualFixtureEnabled(env:NodeJS.ProcessEnv=process.env){
 return env.PUBLIC_SCHEDULING_VISUAL_FIXTURE==='enabled' && (isSchedulingPreview(env)||(!env.VERCEL_ENV&&env.NODE_ENV!=='production'));
}
