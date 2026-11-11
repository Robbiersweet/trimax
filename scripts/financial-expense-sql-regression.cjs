/* eslint-disable @typescript-eslint/no-require-imports -- Isolated SQL permission and audit regression. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const runtime = process.env.TRIMAX_SQL_TEST_RUNTIME || path.join(process.env.LOCALAPPDATA, "Trimax", "phase6-dbtest");
const { PGlite } = require(path.join(runtime, "node_modules/@electric-sql/pglite"));

async function run() {
  const db = new PGlite();
  const business = "10000000-0000-0000-0000-000000000001";
  const other = "10000000-0000-0000-0000-000000000002";
  const owner = "20000000-0000-0000-0000-000000000001";
  const member = "20000000-0000-0000-0000-000000000002";
  const key = "a".repeat(64);
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table public.businesses(id uuid primary key);
      insert into public.businesses values ('${business}'),('${other}');
      create function public.trimax_is_business_admin(target_business_id uuid) returns boolean language sql stable as
      $$ select auth.uid() = '${owner}'::uuid and target_business_id = '${business}'::uuid $$;`);
    await db.exec(fs.readFileSync("supabase/sql/2026-11-10-financial-reports.sql","utf8"));
    const setUser = id => db.query("select set_config('test.uid',$1,false)", [id]);
    const insert = "insert into public.financial_expenses(business_id,business_date,vendor,classification,category,amount_cents,source_key) values ($1,'2026-11-01','Vendor','expense','tools',101,$2)";
    await setUser(owner);
    await db.exec("set role authenticated");
    const { rows } = await db.query(insert + " returning id,revision", [business,key]);
    const id = rows[0].id;
    assert.equal(rows[0].revision,1);
    assert.equal((await db.query(insert + " on conflict (business_id,source_key) do nothing returning id", [business,key])).rows.length,0);
    await assert.rejects(db.query(insert,[other,key]), /row-level security/);
    await assert.rejects(db.query("update public.financial_expenses set source_key=null where id=$1",[id]), /permission denied/);
    await assert.rejects(db.query("delete from public.financial_expenses where id=$1",[id]), /permission denied/);
    await assert.rejects(db.query("update public.financial_expense_history set previous=null where expense_id=$1",[id]), /permission denied/);
    const edited = await db.query("update public.financial_expenses set amount_cents=155 where id=$1 and revision=1 returning revision",[id]);
    assert.equal(edited.rows[0].revision,2);
    assert.equal((await db.query("update public.financial_expenses set amount_cents=999 where id=$1 and revision=1 returning id",[id])).rows.length,0);
    const history = (await db.query("select previous,current,changed_by from public.financial_expense_history where expense_id=$1 order by id",[id])).rows;
    assert.equal(history.length,2);
    assert.equal(history[1].previous.amount_cents,101);
    assert.equal(history[1].current.amount_cents,155);
    assert.equal(history[1].changed_by,owner);
    await db.query("insert into public.financial_report_coverage(business_id,period_start,period_end) values ($1,'2026-01-01','2026-11-10')",[business]);
    await setUser(member);
    assert.equal((await db.query("select id from public.financial_expenses")).rows.length,0);
    assert.equal((await db.query("select id from public.financial_expense_history")).rows.length,0);
    assert.equal((await db.query("select id from public.financial_report_coverage")).rows.length,0);
    await assert.rejects(db.query(insert,[business,key]), /row-level security/);
    await db.exec("set role anon");
    await assert.rejects(db.query("select id from public.financial_expenses"), /permission denied/);
    console.log("PASS expense deduplication, stale corrections, append-only history, coverage and tenant isolation");
  } finally { await db.close(); }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
