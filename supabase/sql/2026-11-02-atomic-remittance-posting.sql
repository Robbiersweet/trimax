-- Additive only: no existing invoices, payments, audit rows or OCR evidence change.
create table public.remittance_posting_receipts (
 business_id uuid not null references public.businesses(id),
 request_key text not null check (request_key ~ '^[a-f0-9]{64}$'),
 actor_user_id uuid not null references auth.users(id),
 result jsonb not null,
 created_at timestamptz not null default now(),
 primary key (business_id,request_key)
);
alter table public.remittance_posting_receipts enable row level security;
revoke all on public.remittance_posting_receipts from public,anon,authenticated,service_role;
grant select,insert on public.remittance_posting_receipts to service_role;

create function public.trimax_payment_cents(v text) returns bigint
language plpgsql immutable set search_path=public as $$
declare n numeric;
begin
 if v is null or btrim(v)='' then return 0; end if;
 n:=regexp_replace(v,'[^0-9.\-]','','g')::numeric;
 if n<>round(n,2) then raise exception 'Money requires exact cents' using errcode='22023'; end if;
 return (n*100)::bigint;
end $$;
revoke all on function public.trimax_payment_cents(text) from public,anon,authenticated;
grant execute on function public.trimax_payment_cents(text) to service_role;

create function public.trimax_commit_remittance(p_business uuid,p_actor uuid,p_key text,p_plan jsonb,p_verified_activities jsonb,p_validate_only boolean default false)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 actor_email text; actor_role text; prior jsonb; current_audits jsonb;
 entry jsonb; inv public.invoices; ids uuid[]; paid bigint; total bigint; due bigint;
 allocation bigint; sum_allocations bigint:=0; check_cents bigint; next_paid bigint;
 requested bigint; status_key text; deposit_active boolean; full_paid boolean;
 payor_key text; customer_key text; selected_customer text;
 source_job public.ocr_legacy_jobs; source_id uuid;
 check_number text; check_day text; receipt_day date; audit_details jsonb;
 result jsonb; applied jsonb:='[]'; line_snapshot jsonb;
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Payment service required' using errcode='42501'; end if;
 select lower(email) into actor_email from auth.users where id=p_actor;
 select role into actor_role from public.business_users where business_id=p_business
  and (user_id=p_actor or lower(email)=actor_email)
  and role in ('owner','admin','accountant') order by (user_id=p_actor) desc limit 1;
 if actor_email is null or actor_role is null then raise exception 'Financial workspace access required' using errcode='42501'; end if;
 if p_business is null or p_actor is null or p_key is null or p_key !~ '^[a-f0-9]{64}$' or (p_plan->>'approved') is distinct from 'true' or jsonb_typeof(p_plan->'allocations') is distinct from 'array'
  or jsonb_array_length(p_plan->'allocations') not between 1 and 1000 then
  raise exception 'Complete approved allocation required' using errcode='22023'; end if;
 -- Serialize check posting in this workspace, including duplicate revalidation.
 perform pg_advisory_xact_lock(hashtextextended('trimax-payment:'||p_business::text,0));
 select r.result into prior from public.remittance_posting_receipts r where r.business_id=p_business and r.request_key=p_key;
 if prior is not null then return prior; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'entityId',entity_id,'entityLabel',entity_label,'details',coalesce(details,'{}')) order by id),'[]')
 into current_audits from public.activity_logs where business_id=p_business and action='invoice.batch_payment_applied';
 if current_audits is distinct from p_verified_activities then
  raise exception 'Payment history changed; review this complete check again' using errcode='40001'; end if;
 select array_agg((value->>'invoiceId')::uuid order by value->>'invoiceId') into ids from jsonb_array_elements(p_plan->'allocations');
 if cardinality(ids)<>(select count(distinct v) from unnest(ids) v) then raise exception 'Duplicate allocation reference' using errcode='22023'; end if;
 if (p_plan->>'intendedCount')::integer is distinct from cardinality(ids) then raise exception 'An intended allocation is missing' using errcode='22023'; end if;
 perform 1 from public.invoices where business_id=p_business and id=any(ids) order by id for update;
 if (select count(*) from public.invoices where business_id=p_business and id=any(ids))<>cardinality(ids) then
  raise exception 'Every invoice must exist in this workspace' using errcode='22023'; end if;
 perform 1 from public.invoice_line_items where business_id=p_business and invoice_id=any(ids) for share;
 check_cents:=(p_plan->>'checkCents')::bigint;
 if check_cents is null or check_cents<=0 or check_cents>9007199254740991 then raise exception 'Invalid check amount' using errcode='22023'; end if;
 if p_plan->>'documentCents' is not null and (p_plan->>'documentCents')::bigint<>check_cents then
  raise exception 'Document total does not reconcile' using errcode='22023'; end if;
 if lower(coalesce(p_plan->'audit'->>'paymentType','')) not in ('check','cash','ach','card','other') then raise exception 'Verified payment type required' using errcode='22023'; end if;
 check_number:=regexp_replace(coalesce(p_plan->'audit'->>'paymentReference',''),'\D','','g');
 check_number:=regexp_replace(check_number,'^0+(?=\d)','','g');
 check_day:=p_plan->'audit'->>'checkDate'; receipt_day:=(p_plan->'audit'->>'receivedDate')::date;
 if receipt_day is null then raise exception 'Received date required' using errcode='22023'; end if;
 if lower(p_plan->'audit'->>'paymentType')='check' and (check_number='' or check_day is null or check_day='' or (check_day::date)::text<>check_day) then
  raise exception 'Verified check number and date required' using errcode='22023'; end if;
 payor_key:=btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(p_plan->'audit'->>'payor',''),NFKC)),'[^[:alnum:] ]',' ','g'),'\s+',' ','g'));
 payor_key:=regexp_replace(regexp_replace(payor_key,'^the\s+','','g'),'\s+at\s+',' ','g');
 if payor_key='' then raise exception 'Verified payor required' using errcode='22023'; end if;
 source_id:=nullif(p_plan->'audit'->>'sourceOcrAttemptId','')::uuid;
 if source_id is not null then
  select * into source_job from public.ocr_legacy_jobs where attempt_id=source_id and business_id=p_business;
  if source_job.attempt_id is null or source_job.state<>'review' then raise exception 'Saved remittance must be in Review' using errcode='22023'; end if;
  if coalesce((source_job.input->>'diagnosticReplay')::boolean,false) and (actor_role not in ('owner','admin') or (p_plan->'audit'->>'savedDiagnosticReviewConfirmed') is distinct from 'true') then
   raise exception 'Owner/admin saved diagnostic approval required' using errcode='42501'; end if;
  if coalesce((source_job.terminal_summary->>'rowsDetected')::integer,0)>cardinality(ids)
   or (source_job.terminal_summary->>'documentTotal' is not null and public.trimax_payment_cents(source_job.terminal_summary->>'documentTotal')<>check_cents)
   or (coalesce(source_job.terminal_summary->>'checkNumber','')<>'' and regexp_replace(source_job.terminal_summary->>'checkNumber','^0+(?=\d)','','g')<>check_number)
   or (coalesce(source_job.terminal_summary->>'checkDate','')<>'' and source_job.terminal_summary->>'checkDate' is distinct from check_day) then
   raise exception 'Saved check references or complete allocation do not agree' using errcode='22023'; end if;
 end if;
 -- Validate the entire locked set before the first financial mutation.
 for entry in select value from jsonb_array_elements(p_plan->'allocations') loop
  select * into inv from public.invoices where business_id=p_business and id=(entry->>'invoiceId')::uuid;
  total:=public.trimax_payment_cents(inv.invoice_amount); paid:=public.trimax_payment_cents(inv.amount_paid::text);
  requested:=public.trimax_payment_cents(inv.deposit_requested_amount::text);
  status_key:=regexp_replace(lower(btrim(coalesce(inv.status,'draft'))),'[_-]+',' ','g');
  deposit_active:=lower(coalesce(inv.deposit_status,''))='requested' and requested>0;
  due:=case when deposit_active then requested-paid else total-paid end;
  allocation:=(entry->>'amountCents')::bigint;
  if allocation is null or total<=0 or paid<0 or total<=paid or allocation<=0 or allocation>due or allocation>total-paid
   or status_key in ('paid','void','voided','cancelled','canceled','superseded','corrected','archived')
   or (status_key='draft' and not deposit_active)
   or exists(select 1 from public.invoices where split_parent_invoice_id=inv.id and business_id=p_business) then
   raise exception 'Every intended invoice must be collectible with a valid allocation' using errcode='22023'; end if;
  if status_key='draft' and not exists(select 1 from public.invoice_line_items where invoice_id=inv.id and business_id=p_business
   and btrim(coalesce(description,''))<>'' and greatest(coalesce(line_total,0),coalesce(quantity,0)*coalesce(unit_price,0))>0) then
   raise exception 'Incomplete draft cannot receive payment' using errcode='22023'; end if;
  if total is distinct from (entry->'expected'->>'totalCents')::bigint or paid is distinct from (entry->'expected'->>'paidCents')::bigint
   or inv.status is distinct from entry->'expected'->>'status'
   or inv.deposit_status is distinct from entry->'expected'->>'depositStatus'
   or requested is distinct from (entry->'expected'->>'depositRequestedCents')::bigint
   or inv.client_id is distinct from nullif(entry->'expected'->>'clientId','')::uuid
   or inv.customer_name is distinct from entry->'expected'->>'customerName'
   or inv.display_id is distinct from entry->'expected'->>'invoiceNumber'
   or inv.due_date is distinct from entry->'expected'->>'dueDate' then
   raise exception 'Invoice changed after review' using errcode='40001'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'description',description,'quantity',quantity,'unit_price',unit_price,'line_total',line_total) order by id),'[]')
   into line_snapshot from public.invoice_line_items where business_id=p_business and invoice_id=inv.id;
  if line_snapshot is distinct from entry->'expected'->'lineItems' then raise exception 'Invoice line items changed after review' using errcode='40001'; end if;
  customer_key:=btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(inv.customer_name,''),NFKC)),'[^[:alnum:] ]',' ','g'),'\s+',' ','g'));
  customer_key:=regexp_replace(regexp_replace(customer_key,'^the\s+','','g'),'\s+at\s+',' ','g');
  if customer_key='' or not (starts_with(customer_key,payor_key) or starts_with(payor_key,customer_key||' ') or customer_key=payor_key)
   or (selected_customer is not null and selected_customer<>customer_key) then raise exception 'All allocations must belong to the verified payor' using errcode='22023'; end if;
  selected_customer:=customer_key;
  if inv.client_id is not null and not exists(select 1 from public.clients where id=inv.client_id and business_id=p_business) then
   raise exception 'Invoice client is outside this workspace' using errcode='22023'; end if;
  sum_allocations:=sum_allocations+allocation;
 end loop;
 if selected_customer<>payor_key and (with customers as (
  select distinct regexp_replace(regexp_replace(btrim(regexp_replace(regexp_replace(lower(normalize(coalesce(customer_name,''),NFKC)),'[^[:alnum:] ]',' ','g'),'\s+',' ','g')),'^the\s+','','g'),'\s+at\s+',' ','g') name
  from public.invoices where business_id=p_business
 ) select count(*) from customers where name<>'' and (starts_with(name,payor_key) or starts_with(payor_key,name||' ') or name=payor_key))<>1 then
  raise exception 'Payor is ambiguous; verify the complete customer name' using errcode='22023'; end if;
 if sum_allocations<>check_cents then raise exception 'Entire check must reconcile before posting' using errcode='22023'; end if;
 -- A prior active check cannot be split into another batch with disjoint IDs.
 if check_number<>'' and exists(select 1 from public.activity_logs l where l.business_id=p_business and l.action='invoice.batch_payment_applied'
  and regexp_replace(regexp_replace(coalesce(l.details->>'paymentReference',''),'\D','','g'),'^0+(?=\d)','','g')=check_number
  and coalesce(l.details->>'checkDate','')=coalesce(check_day,'')
  and lower(coalesce(l.details->>'customerName',''))=lower((p_plan->'allocations'->0)->'expected'->>'customerName')
  and coalesce(l.details->>'paymentReversed','false')<>'true' and lower(coalesce(l.details->>'paymentOutcome',''))<>'reversed' and coalesce(l.details->>'reversedAt','')='' and coalesce(l.details->>'reversalDate','')='') then
  raise exception 'This check already has an active application; review the entire remittance' using errcode='23505'; end if;
 if p_validate_only then return jsonb_build_object('validated',true,'paymentApplied',false,'selectedTotal',check_cents::numeric/100,'invoiceIds',to_jsonb(ids)); end if;
 if p_plan->'overrideAudit' is not null and p_plan->'overrideAudit'<>'null'::jsonb then
  if actor_role not in ('owner','admin') then raise exception 'Owner/admin duplicate review required' using errcode='42501'; end if;
  insert into public.activity_logs(business_id,actor_user_id,actor_email,action,entity_type,entity_label,details)
   values(p_business,p_actor,actor_email,'payment.duplicate_override','payment',p_plan->'audit'->>'paymentReference',p_plan->'overrideAudit');
 end if;
 for entry in select value from jsonb_array_elements(p_plan->'allocations') loop
  select * into inv from public.invoices where id=(entry->>'invoiceId')::uuid and business_id=p_business;
  paid:=public.trimax_payment_cents(inv.amount_paid::text); total:=public.trimax_payment_cents(inv.invoice_amount);
  allocation:=(entry->>'amountCents')::bigint; next_paid:=paid+allocation; full_paid:=next_paid=total;
  deposit_active:=lower(coalesce(inv.deposit_status,''))='requested' and public.trimax_payment_cents(inv.deposit_requested_amount::text)>0;
  update public.invoices set amount_paid=next_paid::numeric/100,status=case when full_paid then 'Paid' else coalesce(inv.status,'Sent') end,
   deposit_status=case when deposit_active and not full_paid and next_paid>=public.trimax_payment_cents(inv.deposit_requested_amount::text) then 'paid' else inv.deposit_status end
   where id=inv.id and business_id=p_business;
  audit_details:=p_plan->'audit'||jsonb_build_object('atomicRequestKey',p_key,'invoiceId',inv.id,'businessId',p_business,'clientId',inv.client_id,
   'customerName',inv.customer_name,'invoiceNumber',inv.display_id,'dueDateAtPayment',inv.due_date,'checkAmount',check_cents::numeric/100,
   'amountApplied',allocation::numeric/100,'resultingAmountPaid',next_paid::numeric/100,'paymentOutcome',case when full_paid then 'paid' else 'partial' end,
   'paymentCompletedInvoice',full_paid,'depositPayment',deposit_active,'batchInvoiceCount',cardinality(ids));
  if full_paid and entry->'timeliness' is not null and entry->'timeliness'<>'null'::jsonb then audit_details:=audit_details||(entry->'timeliness'); end if;
  insert into public.activity_logs(business_id,actor_user_id,actor_email,action,entity_type,entity_id,entity_label,details)
   values(p_business,p_actor,actor_email,'invoice.batch_payment_applied','invoice',inv.id,coalesce(inv.display_id,inv.project_title,'Invoice'),audit_details);
  applied:=applied||jsonb_build_array(jsonb_build_object('invoiceId',inv.id,'displayId',inv.display_id,'amountApplied',allocation::numeric/100,
   'resultingAmountPaid',next_paid::numeric/100,'status',case when full_paid then 'Paid' else coalesce(inv.status,'Sent') end));
 end loop;
 result:=jsonb_build_object('ok',true,'paymentApplied',true,'appliedCount',cardinality(ids),'appliedInvoices',applied,'checkAmount',check_cents::numeric/100,
  'paymentReference',p_plan->'audit'->>'paymentReference','payor',p_plan->'audit'->>'payor','requestKey',p_key);
 insert into public.remittance_posting_receipts(business_id,request_key,actor_user_id,result) values(p_business,p_key,p_actor,result);
 return result;
end $$;
revoke all on function public.trimax_commit_remittance(uuid,uuid,text,jsonb,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.trimax_commit_remittance(uuid,uuid,text,jsonb,jsonb,boolean) to service_role;
