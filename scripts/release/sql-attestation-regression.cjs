/* eslint-disable @typescript-eslint/no-require-imports -- Disposable in-memory SQL only, never production. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const runtime=process.env.TRIMAX_SQL_TEST_RUNTIME||path.join(process.env.LOCALAPPDATA,'Trimax','phase6-dbtest');const {PGlite}=require(path.join(runtime,'node_modules/@electric-sql/pglite'));
(async()=>{const db=new PGlite();try{const source=fs.readFileSync('scripts/ocr-v2/shadow-sql-regression.cjs','utf8');const setup=source.match(/await db.exec\(`([\s\S]*?)`\);/)[1];await db.exec(setup);await db.exec(fs.readFileSync('supabase/sql/2026-09-21-ocr-shadow.sql','utf8'));
 await db.exec('create table ocr_legacy_workers(business_id uuid,enabled boolean,worker_key_hash text);create table ocr_legacy_jobs(business_id uuid,terminal_summary jsonb,queued_at timestamptz);');
 const sql=fs.readFileSync('supabase/sql/2026-10-01-release-attestation.sql','utf8');
 // Independently hash catalog records in JS. Never reuse the RPC digest expression:
 // the historical baseline contract is UTF-8 with CRLF (0D 0A), not LF (0A).
 const parts=sql.slice(sql.indexOf(' with tables as ('),sql.indexOf(' ), hashes as ('))+') select kind,name,value from parts';
 const catalog=async()=>{const rows=(await db.query(parts)).rows;const groups={};for(const row of rows)(groups[row.kind]??=[]).push(row);
  return Object.fromEntries(Object.entries(groups).map(([kind,items])=>{items.sort((a,b)=>Buffer.compare(Buffer.from(a.name),Buffer.from(b.name)));return[kind,{entries:items.length,sha256:crypto.createHash('sha256').update(items.map(x=>x.name+'='+x.value).join('\r\n'),'utf8').digest('hex')}];}));};
 const baseline=await catalog();await db.exec(sql);assert.deepEqual(await catalog(),baseline,'Installing the excluded RPC must not change catalog fingerprints');
 const b=crypto.randomUUID(),key='isolated-test-only';await db.query('insert into businesses values($1)',[b]);await db.query("insert into ocr_legacy_workers values($1,true,encode(extensions.digest($2,'sha256'),'hex'))",[b,key]);
 await assert.rejects(db.query("select trimax_release_runtime($1,'legacy','wrong')",[b]),/Invalid legacy credential/);await assert.rejects(db.query("select trimax_release_runtime($1,'diagnostics',null)",[b]),/Owner\/admin required/);
 const before=(await db.query('select count(*)::int n from ocr_legacy_jobs')).rows[0].n;await db.exec('set role anon');const result=(await db.query("select trimax_release_runtime($1,'legacy',$2) r",[b,key])).rows[0].r;assert.equal(result.credentialScope,'ocr-only');assert.equal(result.engine,'legacy');assert.deepEqual(result.fingerprints,baseline);await db.exec('reset role');
 await db.query("insert into ocr_shadow_flags(business_id,enabled,worker_key_hash) values($1,true,encode(extensions.digest($2,'sha256'),'hex'))",[b,key]);
 const u=crypto.randomUUID();await db.query("insert into members values($1,$2,'owner')",[b,u]);await db.query("select set_config('test.uid',$1,false)",[u]);await db.exec('set role authenticated');assert.deepEqual((await db.query("select trimax_release_runtime($1,'diagnostics',null) r",[b])).rows[0].r.fingerprints,baseline);await db.exec('reset role');
 await db.query("select set_config('test.uid','',false)");await db.exec('set role anon');assert.deepEqual((await db.query("select trimax_release_runtime($1,'v2-shadow',$2) r",[b,key])).rows[0].r.fingerprints,baseline);await assert.rejects(db.query("select trimax_release_runtime($1,'v2-shadow','wrong')",[b]),/Invalid shadow credential/);await db.exec('reset role');
 // SQL-file line endings do not define the record separator anymore.
 for(const eol of ['\n','\r\n']){await db.exec(sql.replace(/\r\n/g,'\n').replace(/\n/g,eol));assert.deepEqual((await db.query("select trimax_release_runtime($1,'legacy',$2) r",[b,key])).rows[0].r.fingerprints,baseline);}
 // Negative control: the old LF implementation must fail this baseline check.
 await db.exec(sql.replace('chr(13)||chr(10)','chr(10)'));assert.notDeepEqual((await db.query("select trimax_release_runtime($1,'legacy',$2) r",[b,key])).rows[0].r.fingerprints,baseline);await db.exec(sql);
 assert.equal((await db.query('select count(*)::int n from ocr_legacy_jobs')).rows[0].n,before);console.log('Read-only attestation SQL: independent CRLF baseline, install self-exclusion, LF negative control, file-newline invariance, owner/engine scope and no queue writes PASS');}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
