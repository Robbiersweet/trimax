import assert from 'node:assert/strict';
import {isSchedulingPreview,schedulingDevelopmentEnabled,schedulingVisualFixtureEnabled} from '../src/app/lib/publicScheduling/reviewEnvironment.ts';
import {devStoreDirectory} from '../src/app/lib/publicScheduling/developmentStore.ts';
const preview={NODE_ENV:'production',VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'codex/public-scheduling-foundation',PUBLIC_SCHEDULING_DEV_ADAPTER:'enabled',PUBLIC_SCHEDULING_VISUAL_FIXTURE:'enabled'} as NodeJS.ProcessEnv;
assert.equal(isSchedulingPreview(preview),true);assert.equal(schedulingDevelopmentEnabled(preview),true);assert.equal(schedulingVisualFixtureEnabled(preview),true);
for(const env of [{...preview,VERCEL_ENV:'production'},{...preview,VERCEL_GIT_COMMIT_REF:'main'},{...preview,VERCEL_ENV:undefined},{...preview,PUBLIC_SCHEDULING_DEV_ADAPTER:undefined}])assert.throws(()=>devStoreDirectory(env));
assert.ok(!devStoreDirectory({...preview,PUBLIC_SCHEDULING_DEV_DIRECTORY:'/production/data'}).includes('production/data'));
assert.equal(schedulingVisualFixtureEnabled({...preview,VERCEL_ENV:'production'}),false);
console.log('Scheduling Preview isolation PASS');
