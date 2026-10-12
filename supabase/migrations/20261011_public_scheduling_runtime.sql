-- Reviewed scheduling-only runtime projection. Does not enable any business.
begin;
create function public.trimax_public_scheduling_config(p_slug text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object(
 'slug',s.public_slug,'businessId',s.business_id,'displayName',s.display_name,
 'description',s.description,'phone',s.public_phone,'email',s.public_email,
 'logoUrl',s.logo_reference,'accent',s.accent_token,'enabled',s.enabled,
 'rules',jsonb_build_object('weekdays',s.available_weekdays,'blockedDates',s.blocked_dates,
 'minimumLeadHours',s.minimum_lead_hours,'maximumHorizonDays',s.maximum_horizon_days,
 'timeZone',s.time_zone,'businessHours',s.business_hours,'windows',s.appointment_windows,
 'ownerApprovalRequired',s.owner_approval_required,'mode',s.mode),
 'requestTypes',coalesce((select jsonb_agg(jsonb_build_object('id',t.public_key,
 'publicLabel',t.public_label,'internalLabel',t.public_label,'description',t.description,
 'active',t.active,'displayOrder',t.display_order,'estimatedDurationMinutes',t.estimated_duration_minutes,
 'schedulingEligible',t.scheduling_eligible) order by t.display_order)
 from public.public_service_request_types t where t.business_id=s.business_id and t.active),'[]'::jsonb))
 from public.public_scheduling_settings s where s.public_slug=p_slug and s.enabled
 and s.mode='request-only' and s.owner_approval_required
$$;
revoke all on function public.trimax_public_scheduling_config(text) from public,anon,authenticated;
grant execute on function public.trimax_public_scheduling_config(text) to trimax_scheduling_intake;
-- No login or token is created. PostgREST may assume only this dedicated role
-- when a project-signed JWT selects it. Never grant membership to anon.
grant trimax_scheduling_intake to authenticator;
notify pgrst,'reload schema';
commit;
