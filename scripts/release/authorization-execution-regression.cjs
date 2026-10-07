/* eslint-disable @typescript-eslint/no-require-imports -- Executes actual source queries and actual RLS in an isolated database. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),ts=require('typescript');
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const source=fs.readFileSync('src/app/api/invoices/[id]/send-email/route.ts','utf8');
const ast=ts.createSourceFile('route.ts',source,ts.ScriptTarget.Latest,true);
const awaits=[];let access;function visit(n){if(ts.isAwaitExpression(n))awaits.push(n.expression.getText(ast));if(ts.isFunctionDeclaration(n)&&n.name?.text==='requireWorkspaceAccess')access=n.getText(ast);ts.forEachChild(n,visit);}visit(ast);
const query=kind=>{const q=awaits.filter(q=>q.includes('.from("'+kind+'")'));return kind==='invoices'?q.find(q=>q.includes('.update(')):q[0];};
function client(){const calls=[];const rows=[{id:'a',invoice_id:'a',business_id:'A',key:'email_settings',user_id:'user-A'},{id:'b',invoice_id:'b',business_id:'B',key:'email_settings',user_id:'user-B'}];return {calls,auth:{getUser:async token=>({data:{user:token==='valid'?{id:'user-A',email:'a@example.test'}:null},error:null})},from(table){let selected=rows.slice(),updates=null;const q={select(){return q;},eq(k,v){calls.push([table,'eq',k,v]);selected=selected.filter(r=>r[k]===v);return q;},in(k,v){calls.push([table,'in',k,v]);selected=selected.filter(r=>v.includes(r[k]));return q;},or(v){assert(v.includes('user-A'));selected=selected.filter(r=>r.user_id==='user-A');return q;},limit(){return q;},update(v){updates=v;return q;},returns(){return q;},maybeSingle(){return Promise.resolve({data:selected[0]??null,error:null});},then(resolve){if(updates)calls.push(['updated',selected.map(r=>r.id)]);return Promise.resolve({data:selected,error:null}).then(resolve);}};return q;}};}
async function execute(expression,db){const js=compile('async function execute(){return await '+expression+';}');return new Function('supabase','business','invoice','targetInvoiceIds','targetInvoices',js+';return execute();')(db,{id:'A'},{business_id:'A'},['a','b'],[{id:'a'},{id:'b'}]);}
(async()=>{
 const authorize=new Function(compile(access)+';return requireWorkspaceAccess;')();
 assert.equal((await authorize({supabase:client(),token:'valid',businessId:'A'})).ok,true);
 assert.equal((await authorize({supabase:client(),token:'valid',businessId:'B'})).ok,false);
 assert.equal((await authorize({supabase:client(),token:null,businessId:'A'})).ok,false);
 for(const kind of ['business_settings','invoice_line_items','invoices']){const db=client(),actual=await execute(query(kind),db);assert.deepEqual(Array.isArray(actual.data)?actual.data.map(r=>r.id):[actual.data.id],['a']);assert(db.calls.some(x=>x[1]==='eq'&&x[2]==='business_id'&&x[3]==='A'));}
 // Execute the unchanged membership RLS function/policy, not a copied JS approximation.
 const runtime=process.env.TRIMAX_SQL_TEST_RUNTIME||path.join(process.env.LOCALAPPDATA,'Trimax','phase6-dbtest');const {PGlite}=require(path.join(runtime,'node_modules/@electric-sql/pglite'));const db=new PGlite();
 try{await db.exec(`create role authenticated;create role anon;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('app.uid',true),'')::uuid$$;
 create function trimax_current_user_email() returns text language sql stable as $$select nullif(current_setting('app.email',true),'')$$;
 create table businesses(id uuid);create table business_users(business_id uuid,user_id uuid,email text);create table property_users(business_id uuid,user_id uuid,email text);
 alter table businesses enable row level security;grant select on businesses to authenticated;
 insert into businesses values('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
 insert into business_users values('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','member@example.test');
 insert into property_users values('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','property@example.test');`);
 await db.exec(fs.readFileSync('supabase/sql/2026-08-10-businesses-read-policy-hardening.sql','utf8'));
 for(const [user,email,last] of [['1','member@example.test','1'],['2','property@example.test','2'],['3','unknown@example.test',null]]){await db.exec('reset role');await db.query("select set_config('app.uid',$1,false),set_config('app.email',$2,false)",['10000000-0000-0000-0000-00000000000'+user,email]);await db.exec('set role authenticated');const got=(await db.query('select id from businesses')).rows;assert.deepEqual(got.map(r=>r.id),last?['00000000-0000-0000-0000-00000000000'+last]:[]);}
 await db.exec('reset role;set role anon');await assert.rejects(db.query('select * from businesses'),/permission denied/);
 }finally{await db.close();}
 console.log('Actual invoice authorization/settings/line-item/status queries and membership RLS cross-business cases PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
