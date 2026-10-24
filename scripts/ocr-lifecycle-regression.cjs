/* eslint-disable @typescript-eslint/no-require-imports -- Real isolated SQL and deterministic process interruption. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const {supervise}=require('./ocr-worker-supervisor.cjs');
const {startWorkerHealth}=require('./ocr-worker-health.cjs');
async function health(){let tick,cleared=false;const requests=[];const worker=startWorkerHealth({supabaseUrl:'https://example.invalid',businessId:'business',workerKey:'test-only',anonKey:'anon-only'},'legacy',{fetcher:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return new Response(null,{status:204});},interval:fn=>{tick=fn;return 1;},clear:()=>{cleared=true;}});await worker.beat();await tick();await new Promise(resolve=>setImmediate(resolve));worker.stop();assert(cleared);assert.equal(requests.length,2);assert.equal(requests[0].body.p_instance,requests[1].body.p_instance);assert.equal(requests[0].body.p_engine,'legacy');assert(requests.every(x=>x.url.endsWith('/trimax_ocr_worker_heartbeat')));}
async function realRestart(){const os=require('node:os');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'trimax-supervisor-test-')),file=path.join(dir,'worker.cjs'),marker=path.join(dir,'started');fs.writeFileSync(file,"const fs=require('node:fs');if(!fs.existsSync(process.argv[2])){fs.writeFileSync(process.argv[2],'first');process.exit(42);}process.send({kind:'alive',engine:'legacy'});setInterval(()=>process.send({kind:'alive',engine:'legacy'}),100);process.on('disconnect',()=>process.exit());");const starts=[];let finished;const ready=new Promise(resolve=>{finished=resolve;});const worker=supervise({engine:'legacy',script:file,config:marker,out:'ignore',err:'ignore'},{schedule:fn=>setTimeout(fn,50),log:line=>{const event=JSON.parse(line);if(event.event==='started'){starts.push(event.pid);if(starts.length===2)finished();}}});try{await Promise.race([ready,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Real worker restart timed out')),5000);timer.unref();})]);assert.equal(starts.length,2);assert.notEqual(starts[0],starts[1]);}finally{worker.stop();await new Promise(resolve=>setTimeout(resolve,150));fs.unlinkSync(file);fs.unlinkSync(marker);fs.rmdirSync(dir);}}
async function sql(){
 const {PGlite}=require(path.join(process.env.TRIMAX_SQL_TEST_RUNTIME||path.join(process.env.LOCALAPPDATA,'Trimax/phase6-dbtest'),'node_modules/@electric-sql/pglite'));const db=new PGlite();
 // Reuse the actual persistence regression's database scaffold, not a mock queue.
 const scaffold=fs.readFileSync('scripts/ocr-evidence-persistence-regression.cjs','utf8').split(' await db.exec(`')[1].split('`);')[0];await db.exec(scaffold);
 await db.exec(fs.readFileSync('supabase/sql/2026-09-23-ocr-legacy-jobs.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/sql/2026-09-26-ocr-evidence-persistence.sql','utf8'));
 await db.exec('create table ocr_shadow_flags(business_id uuid,enabled boolean,worker_key_hash text);create table ocr_shadow_jobs(legacy_attempt_id uuid,shadow_attempt_id uuid,business_id uuid,state text,lease uuid,lease_until timestamptz,enqueued_at timestamptz,completed_at timestamptz);');
 const migration=fs.readFileSync('supabase/sql/2026-10-23-ocr-job-lifecycle.sql','utf8');await db.exec(migration);await db.exec(migration);
 const b=crypto.randomUUID(),other=crypto.randomUUID(),user=crypto.randomUUID(),key='local-test-only';
 await db.query('insert into businesses values($1),($2)',[b,other]);await db.query("insert into ocr_legacy_workers values($1,true,encode(extensions.digest($2,'sha256'),'hex'))",[b,key]);
 async function job(business=b){const id=crypto.randomUUID();await db.query("insert into ocr_attempts(id,business_id,created_by,phase,summary,result) values($1,$2,$3,0,'{}','processing')",[id,business,user]);await db.query("insert into ocr_attempt_diagnostics values($1,'{}')",[id]);await db.query("insert into ocr_legacy_jobs(attempt_id,business_id,source_reference,source_hash,input) values($1,$2,$1,$3,'{}')",[id,business,'0'.repeat(64)]);return id;}
 const claim=async()=> (await db.query('select trimax_claim_ocr_legacy($1,$2) as c',[b,key])).rows[0].c;
 const status=async id=>(await db.query('select trimax_ocr_legacy_status($1) as s',[id])).rows[0].s;
 await db.query("select set_config('test.uid',$1,false)",[user]);
 const id=await job();assert.equal((await status(id)).status,'queued');assert.equal((await status(id)).workerHealth.healthy,false);
 await db.query('select trimax_ocr_worker_heartbeat($1,$2,$3,$4)',[b,'legacy',key,crypto.randomUUID()]);assert.equal((await status(id)).workerHealth.healthy,true);
 await assert.rejects(db.query('select trimax_ocr_worker_heartbeat($1,$2,$3,$4)',[other,'legacy',key,crypto.randomUUID()]),/credential/);
 const first=await claim();assert.equal(first.job.claims,1);
 await db.query("update ocr_legacy_jobs set lease_until=now()-interval '1 second' where attempt_id=$1",[id]);assert.equal((await status(id)).processingState,'recoverable_stalled');
 const second=await claim();assert.notEqual(second.job.lease,first.job.lease);assert.equal(second.job.claims,2);
 await assert.rejects(db.query("select trimax_update_ocr_legacy($1,$2,$3,$4,'heartbeat','{}',null)",[b,key,id,first.job.lease]),/Stale/);
 await db.query("update ocr_legacy_jobs set claims=3,lease_until=now()-interval '1 second' where attempt_id=$1",[id]);assert.equal((await status(id)).status,'failed');assert.equal((await status(id)).response.failureCode,'OCR_RETRY_EXHAUSTED');assert.equal(await claim(),null);
 const queued=await job(),isolated=await job(other);
 await db.exec("update ocr_legacy_jobs set queued_at=now()-interval '31 minutes'");
 assert.equal((await status(queued)).response.failureCode,'OCR_WORKER_UNAVAILABLE');assert.equal((await db.query('select state from ocr_legacy_jobs where attempt_id=$1',[isolated])).rows[0].state,'queued');
 await db.exec('select trimax_reap_ocr_jobs(null)');assert.equal((await db.query('select state from ocr_legacy_jobs where attempt_id=$1',[isolated])).rows[0].state,'failed');
 const hanging=await job();const live=await claim();assert.equal(live.job.attempt_id,hanging);await db.query("update ocr_legacy_jobs set queued_at=now()-interval '31 minutes',evidence_manifest='{\"response_ready\":{\"hash\":\"missing\"}}' where attempt_id=$1",[hanging]);
 assert.equal((await status(hanging)).response.failureCode,'OCR_JOB_DEADLINE','Watchdog failure cannot resurrect successful OCR evidence');
 await assert.rejects(db.query("select trimax_update_ocr_legacy($1,$2,$3,$4,'heartbeat','{}',null)",[b,key,hanging,live.job.lease]),/Stale/);
 const orphan=crypto.randomUUID();await db.query("insert into ocr_attempts(id,business_id,created_by,created_at,phase,result,summary) values($1,$2,$3,now()-interval '31 minutes',0,'processing',jsonb_build_object('canonicalReference',($1::uuid)::text))",[orphan,b,user]);assert.equal((await status(orphan)).status,'not_enqueued');assert.equal((await db.query('select summary from ocr_attempts where id=$1',[orphan])).rows[0].summary.failureCode,'OCR_NOT_ENQUEUED');
 const shadow=crypto.randomUUID();await db.query("insert into ocr_attempts(id,business_id,created_by,phase,result,summary) values($1,$2,$3,0,'processing','{\"ocrEngine\":\"v2-shadow\"}')",[shadow,b,user]);await db.query("insert into ocr_shadow_jobs(legacy_attempt_id,shadow_attempt_id,business_id,state,enqueued_at) values($1,$1,$2,'running',now()-interval '31 minutes')",[shadow,b]);await db.exec('select trimax_reap_ocr_jobs(null)');assert.equal((await db.query('select state from ocr_shadow_jobs')).rows[0].state,'failed');
 await db.query("select set_config('test.uid',$1,false)",[crypto.randomUUID()]);await assert.rejects(status(id),/Owner/);
 const acl=(await db.query("select has_function_privilege('anon','trimax_reap_ocr_jobs(uuid)','execute') as reaper,has_function_privilege('anon','trimax_claim_ocr_legacy_before_lifecycle(uuid,text)','execute') as bypass")).rows[0];assert.equal(acl.reaper,false);assert.equal(acl.bypass,false);
 await db.close();
}
function processes(){let now=0,next;const children=[];const fork=()=>{const child=new EventEmitter();child.pid=children.length+1;child.kill=()=>{child.killed=true;};children.push(child);return child;};
 const worker=supervise({engine:'legacy'},{fork,now:()=>now,schedule:fn=>{next=fn;return 1;},cancel:()=>{next=null;},log:()=>{}});
 now=120001;worker.check();assert(children[0].killed);children[0].emit('exit',null,'SIGTERM');assert(next);next();assert.equal(children.length,2);
 now=200000;children[1].emit('message',{kind:'alive',engine:'legacy'});now=300000;worker.check();assert(!children[1].killed);worker.stop();assert(children[1].killed);children[1].emit('exit',0,null);assert.equal(children.length,2);
}
(async()=>{processes();await health();await realRestart();if(process.argv.includes('--sql')){await sql();console.log('PASS actual SQL: queued/running/stalled/terminal, crash reclaim, retry/deadline bounds, stale completion fencing, failed-result authority, tenant/owner isolation');}console.log('PASS real supervisor process restart, hang recovery and restricted health persistence');})().catch(error=>{console.error(error);process.exitCode=1;});
