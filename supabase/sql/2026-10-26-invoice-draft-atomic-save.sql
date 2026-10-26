-- Candidate only. Independent financial repair; NOT part of rc10's 15 migrations.
-- No data backfill, credential change, invoice reclassification, or payment write.
begin;
alter table public.invoices add column if not exists import_reviewed boolean not null default false;
create or replace function public.trimax_save_invoice_draft(
  p_business_id uuid, p_invoice_id uuid, p_expected_updated_at timestamptz,
  p_fields jsonb, p_items jsonb
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_before public.invoices%rowtype;
  v_old_items jsonb;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_total numeric;
  v_tax numeric;
  v_line numeric;
  v_count integer := 0;
  v_changed integer;
begin
  if auth.uid() is null or not public.trimax_has_business_role(p_business_id, array['owner','admin','accountant']) then
    raise exception 'Invoice editing is not authorized';
  end if;
  select * into v_before from public.invoices
    where id=p_invoice_id and business_id=p_business_id for update;
  if not found then raise exception 'Invoice not available'; end if;
  if lower(coalesce(v_before.status,'')) <> 'draft' then raise exception 'Issued invoices require a reviewed correction'; end if;
  if v_before.updated_at is distinct from p_expected_updated_at then raise exception 'Invoice changed; reload before saving'; end if;
  if exists(select 1 from public.invoices where business_id=p_business_id and split_parent_invoice_id=p_invoice_id) then
    raise exception 'Review the complete split invoice group before editing';
  end if;
  if coalesce(jsonb_typeof(p_fields),'') <> 'object' or coalesce(jsonb_typeof(p_items),'') <> 'array' or jsonb_array_length(p_items) not between 1 and 500 then
    raise exception 'Invalid invoice draft';
  end if;
  if p_fields ?| array['amount_paid','status','client_id','business_id','deposit_status','deposit_requested_amount'] then raise exception 'Protected invoice fields cannot be edited'; end if;
  if nullif(btrim(p_fields->>'customer_name'),'') is null or nullif(btrim(p_fields->>'project_title'),'') is null then raise exception 'Customer and project are required'; end if;
  if coalesce(p_fields->>'tax_mode','') not in ('taxable','no_tax','tax_exempt') then raise exception 'Invalid tax mode'; end if;
  v_tax := case when p_fields->>'tax_mode' in ('no_tax','tax_exempt') then 0 else (p_fields->>'tax_rate')::numeric end;
  if v_tax is null or v_tax::text in ('NaN','Infinity','-Infinity') or v_tax < 0 or v_tax > 100 then raise exception 'Invalid tax rate'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if nullif(btrim(v_item->>'description'),'') is null or (v_item->>'quantity')::numeric <= 0 then raise exception 'Invalid line item'; end if;
    v_line := round((v_item->>'quantity')::numeric * (v_item->>'unit_price')::numeric,2);
    if v_line is null or v_line::text in ('NaN','Infinity','-Infinity') or v_line is distinct from (v_item->>'line_total')::numeric then raise exception 'Line total mismatch'; end if;
    if v_line < 0 and btrim(v_item->>'description') !~* '^discount\M' then raise exception 'Negative lines must be identified as discounts'; end if;
    v_subtotal := v_subtotal + v_line;
    if v_line > 0 then v_count := v_count + 1; end if;
  end loop;
  if v_count=0 or v_subtotal < 0 then raise exception 'Invalid discounted subtotal'; end if;
  v_total := v_subtotal + round(v_subtotal*v_tax/100,2);
  if v_total < coalesce(v_before.amount_paid,0) then raise exception 'Total cannot be lower than recorded payments; review the credit separately'; end if;
  if v_total is distinct from regexp_replace(p_fields->>'invoice_amount','[^0-9.-]','','g')::numeric then raise exception 'Invoice total mismatch'; end if;
  select coalesce(jsonb_agg(to_jsonb(li) order by li.sort_order),'[]'::jsonb) into v_old_items
    from public.invoice_line_items li where business_id=p_business_id and invoice_id=p_invoice_id;
  update public.invoices set
    customer_name=btrim(p_fields->>'customer_name'), project_title=btrim(p_fields->>'project_title'),
    invoice_amount='$'||v_total::text,
    issue_date=nullif(p_fields->>'issue_date','')::date, due_date=nullif(p_fields->>'due_date','')::date,
    reference=p_fields->>'reference', service_address=p_fields->>'service_address',
    tax_mode=p_fields->>'tax_mode', tax_label=p_fields->>'tax_label', tax_rate=v_tax,
    tax_number=p_fields->>'tax_number', terms=p_fields->>'terms', notes=p_fields->>'notes',
    split_warning_enabled=coalesce((p_fields->>'split_warning_enabled')::boolean,false),
    split_target_amount=nullif(p_fields->>'split_target_amount','')::numeric,
    import_reviewed=true, updated_at=clock_timestamp()
    where id=p_invoice_id and business_id=p_business_id;
  get diagnostics v_changed = row_count;
  if v_changed <> 1 then raise exception 'Invoice update was denied'; end if;
  delete from public.invoice_line_items where business_id=p_business_id and invoice_id=p_invoice_id;
  if exists(select 1 from public.invoice_line_items where business_id=p_business_id and invoice_id=p_invoice_id) then raise exception 'Line replacement was denied'; end if;
  insert into public.invoice_line_items(invoice_id,business_id,description,quantity,unit_price,line_total,sort_order)
    select p_invoice_id,p_business_id,btrim(value->>'description'),(value->>'quantity')::numeric,
      (value->>'unit_price')::numeric,(value->>'line_total')::numeric,ordinality-1
    from jsonb_array_elements(p_items) with ordinality;
  insert into public.activity_logs(business_id,actor_user_id,action,entity_type,entity_id,entity_label,details)
    values(p_business_id,auth.uid(),'invoice.updated','invoice',p_invoice_id,v_before.display_id,
      jsonb_build_object('saveMethod','atomic-draft-v1','previousInvoice',to_jsonb(v_before),
        'previousLineItems',v_old_items,'previousAmount',v_before.invoice_amount,'amount',v_total,
        'paymentAmountPreserved',v_before.amount_paid,'lineItemCount',jsonb_array_length(p_items)));
  return jsonb_build_object('invoiceId',p_invoice_id,'total',v_total,'amountPaid',v_before.amount_paid);
end;
$$;
revoke all on function public.trimax_save_invoice_draft(uuid,uuid,timestamptz,jsonb,jsonb) from public, anon;
grant execute on function public.trimax_save_invoice_draft(uuid,uuid,timestamptz,jsonb,jsonb) to authenticated;
commit;
