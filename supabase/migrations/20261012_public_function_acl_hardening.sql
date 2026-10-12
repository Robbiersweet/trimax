-- Candidate only. Apply under coordinated release; function bodies unchanged.
-- Existing authenticated membership/RLS access is preserved.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.get_trimax_storage_health(text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_trimax_storage_health(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_can_access_property(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_can_access_property(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_can_create_property_queue(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_can_create_property_queue(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_can_manage_property_queue(uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_can_manage_property_queue(uuid,text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_can_read_business(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_can_read_business(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_current_user_email() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_current_user_email() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_has_business_access(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_has_business_access(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_has_business_role(uuid,text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_has_business_role(uuid,text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.trimax_is_business_admin(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.trimax_is_business_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.set_job_session_totals() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_property_units_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trimax_preserve_canonical_optical() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trimax_preserve_capture_handoff() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.trimax_preserve_capture_pair() FROM PUBLIC, anon, authenticated, service_role;
-- No direct service-role callers exist in the application/worker source audit.
-- Nested worker calls execute as postgres SECURITY DEFINER; trigger execution is tested separately.
COMMIT;
