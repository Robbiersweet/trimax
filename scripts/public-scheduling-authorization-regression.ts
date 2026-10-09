import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {authorizeIntake,type IntakeAuthVerifierFactory} from '../src/app/lib/publicScheduling/authorization.ts';
const workspace='11111111-1111-1111-1111-111111111111',otherWorkspace='22222222-2222-2222-2222-222222222222';
const environment={NEXT_PUBLIC_SUPABASE_URL:'https://example.test',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public-key',PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS:JSON.stringify({'rnl-creations':workspace,'other':otherWorkspace})};
const request=new Request('https://example.test/api/public-scheduling/intake?business=rnl-creations',{headers:{authorization:'Bearer verified-token'}});
const verifiedTokens:string[]=[],membershipCalls:{workspace:string;userId:string}[]=[];
const factory=(role:string,userValid=true):IntakeAuthVerifierFactory=>async({token})=>{assert.equal(token,'verified-token');return {
 async getUser(candidate){verifiedTokens.push(candidate);return userValid?{id:'verified-user'}:null;},
 async getMembershipRoles(selectedWorkspace,userId){membershipCalls.push({workspace:selectedWorkspace,userId});return selectedWorkspace===workspace?[role]:[];}
};};
for(const role of ['owner','admin'])assert.equal(await authorizeIntake(request,'rnl-creations',environment,factory(role)),true);
for(const role of ['member','employee','viewer','pending','Owner'])assert.equal(await authorizeIntake(request,'rnl-creations',environment,factory(role)),false);
assert.equal(await authorizeIntake(request,'other',environment,factory('owner')),false);
assert.equal(await authorizeIntake(request,'guessed-workspace',environment,factory('owner')),false);
assert.equal(await authorizeIntake(request,'rnl-creations',environment,factory('owner',false)),false);
assert.equal(await authorizeIntake(request,'rnl-creations',{...environment,PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS:'null'},factory('owner')),false);
assert.equal(await authorizeIntake(request,'rnl-creations',{...environment,PUBLIC_SCHEDULING_DEV_WORKSPACE_BINDINGS:'not-json'},factory('owner')),false);
const before=verifiedTokens.length;
assert.equal(await authorizeIntake(new Request(request.url),'rnl-creations',environment,factory('owner')),false);
assert.equal(verifiedTokens.length,before,'anonymous access must not reach verifier');
assert.ok(membershipCalls.every(call=>call.userId==='verified-user'),'membership uses verified user, not supplied identity');
assert.equal(await authorizeIntake(request,'rnl-creations',environment,async()=>{throw Error('offline');}),false);
const file=(relative:string)=>readFile(new URL('../'+relative,import.meta.url),'utf8');
const submission=await file('src/app/api/public-scheduling/[slug]/route.ts');
assert.match(submission,/export async function POST/);assert.doesNotMatch(submission,/export (?:async )?function GET/,'public endpoint must not list requests');
const intake=await file('src/app/api/public-scheduling/intake/route.ts');
assert.ok(intake.indexOf('if(!await authorizeIntake')<intake.indexOf('await listDevelopmentRequests'),'authorize before reading requests');
const authorization=await file('src/app/lib/publicScheduling/authorization.ts');
assert.match(authorization,/\.from\('business_users'\)/);
for(const source of [submission,intake,authorization])assert.doesNotMatch(source,/\.from\(['"](?:clients|invoices|jobs|payments)['"]\)/,'no access to private business data');
const sql=await file('supabase/migrations/20261009_public_scheduling_foundation.sql');
assert.match(sql,/revoke all[\s\S]+from anon,authenticated/);
assert.doesNotMatch(sql,/grant\s+[^;]+\s+to\s+anon\b/i);
assert.doesNotMatch(sql,/create policy[^;]+to anon/i);
assert.equal((sql.match(/enable row level security/g)||[]).length,4);
assert.equal((sql.match(/create policy/g)||[]).length,4);
assert.ok((sql.match(/m\.user_id=auth\.uid\(\) and m\.role in \('owner','admin'\)/g)||[]).length===4);
console.log('Public scheduling authorization/security regressions PASS');

