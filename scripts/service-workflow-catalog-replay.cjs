/* eslint-disable @typescript-eslint/no-require-imports -- Disposable schema-only projection. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
module.exports=async function projectWorkflow(db,parts,base){
await db.exec(fs.readFileSync('supabase/migrations/20261017_scheduling_owner_notifications.sql','utf8').replace(/\r?\n/g,'\r\n'));
const catalogHashes=async()=>{const rows=(await db.query(parts+' select * from parts')).rows;return Object.fromEntries(Object.entries(Object.groupBy(rows,r=>r.kind)).map(([kind,items])=>{items.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));return [kind,{entries:items.length,sha256:crypto.createHash('sha256').update(items.map(x=>x.name+'='+x.value).join('\r\n')).digest('hex')}];}));};
await db.exec('create role trimax_scheduling_web;grant execute on function public.trimax_public_scheduling_config(text),public.trimax_submit_public_service_request(text,jsonb,text,text) to trimax_scheduling_web');
const liveExpected=JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA,'Trimax/scheduling-notifications/projected-fingerprints.json'),'utf8'));
assert.deepEqual(await catalogHashes(),liveExpected,'Current production notification baseline must reproduce before candidate migrations');
for(const name of ['20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+name,'utf8').replace(/\r?\n/g,'\r\n'));
fs.writeFileSync(path.join(base,'service-workflow-database.json'),JSON.stringify({fingerprints:await catalogHashes(),transport:'CRLF',migrations:['20261018_service_request_workflow.sql','20261018_service_request_delivery.sql','20261018_request_urgency.sql']},null,2));
console.log('PASS current production baseline and candidate workflow catalog projection');
const beforeProvisioning=await catalogHashes();
await db.exec(fs.readFileSync('supabase/sql/2026-10-19-scheduler-provisioning-install.sql','utf8'));
assert.equal((await db.query("select has_function_privilege('anon','public.trimax_provision_request_scheduler(text)','EXECUTE') as allowed")).rows[0].allowed,false);
await db.exec(fs.readFileSync('supabase/sql/2026-10-19-scheduler-provisioning-remove.sql','utf8'));
assert.deepEqual(await catalogHashes(),beforeProvisioning,'Temporary provisioning helper removal must restore every candidate fingerprint');
console.log('PASS provisioning helper cleanup restores all five candidate fingerprints');
};
