BEGIN;
-- Candidate only: new requests only; no historical backfill or customer delivery.
CREATE TABLE public.scheduling_owner_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_id uuid NOT NULL,
 request_id uuid NOT NULL,
 recipient_id uuid NOT NULL REFERENCES auth.users(id),
 customer_name text NOT NULL,
 request_type text NOT NULL,
 submitted_at timestamptz NOT NULL,
 read_at timestamptz,
 FOREIGN KEY (business_id,request_id) REFERENCES public.public_service_requests(business_id,id),
 UNIQUE(request_id,recipient_id)
);
ALTER TABLE public.scheduling_owner_notifications OWNER TO postgres;
CREATE INDEX scheduling_notifications_inbox ON public.scheduling_owner_notifications(recipient_id,business_id,submitted_at DESC);
ALTER TABLE public.scheduling_owner_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduling_owner_notifications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.scheduling_owner_notifications FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.scheduling_owner_notifications TO authenticated;
GRANT UPDATE(read_at) ON public.scheduling_owner_notifications TO authenticated;
CREATE POLICY scheduling_notification_read ON public.scheduling_owner_notifications FOR SELECT TO authenticated
 USING (recipient_id=auth.uid() AND EXISTS(SELECT 1 FROM public.business_users m WHERE m.business_id=scheduling_owner_notifications.business_id AND m.user_id=auth.uid() AND m.role IN ('owner','admin')));
CREATE POLICY scheduling_notification_mark ON public.scheduling_owner_notifications FOR UPDATE TO authenticated
 USING (recipient_id=auth.uid() AND EXISTS(SELECT 1 FROM public.business_users m WHERE m.business_id=scheduling_owner_notifications.business_id AND m.user_id=auth.uid() AND m.role IN ('owner','admin')))
 WITH CHECK (recipient_id=auth.uid() AND EXISTS(SELECT 1 FROM public.business_users m WHERE m.business_id=scheduling_owner_notifications.business_id AND m.user_id=auth.uid() AND m.role IN ('owner','admin')));
-- Privileged trigger, not an exposed RPC. NEW is a committed-to-be scheduling row.
-- Atomic failure rolls back the request; never silently lose its owner notification.
CREATE FUNCTION public.trimax_notify_scheduling_owner() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF TG_TABLE_SCHEMA <> 'public' OR TG_TABLE_NAME <> 'public_service_requests' OR TG_OP <> 'INSERT' THEN
  RAISE EXCEPTION 'invalid notification trigger';
 END IF;
 INSERT INTO public.scheduling_owner_notifications(business_id,request_id,recipient_id,customer_name,request_type,submitted_at)
 SELECT NEW.business_id,NEW.id,m.user_id,NEW.customer_name,t.public_label,NEW.submitted_at
 FROM public.business_users m
 JOIN public.public_service_request_types t ON t.business_id=NEW.business_id AND t.id=NEW.request_type_id
 WHERE m.business_id=NEW.business_id AND m.role IN ('owner','admin') AND m.user_id IS NOT NULL
 ON CONFLICT(request_id,recipient_id) DO NOTHING;
 RETURN NEW;
END $$;
ALTER FUNCTION public.trimax_notify_scheduling_owner() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.trimax_notify_scheduling_owner() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER scheduling_owner_notification AFTER INSERT ON public.public_service_requests
 FOR EACH ROW EXECUTE FUNCTION public.trimax_notify_scheduling_owner();
DO $$
DECLARE r text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_catalog.aclexplode((SELECT relacl FROM pg_catalog.pg_class WHERE oid='public.scheduling_owner_notifications'::regclass)) a WHERE a.grantee NOT IN ('postgres'::regrole,'authenticated'::regrole)) THEN RAISE EXCEPTION 'Unexpected notification table ACL'; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.aclexplode((SELECT proacl FROM pg_catalog.pg_proc WHERE oid='public.trimax_notify_scheduling_owner()'::regprocedure)) a WHERE a.grantee<>'postgres'::regrole) THEN RAISE EXCEPTION 'Unexpected trigger function ACL'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','service_role','trimax_scheduling_web','trimax_scheduling_intake'] LOOP
  IF EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=r) THEN
   IF pg_catalog.has_any_column_privilege(r,'public.scheduling_owner_notifications','SELECT,INSERT,UPDATE,REFERENCES') OR pg_catalog.has_table_privilege(r,'public.scheduling_owner_notifications','DELETE,TRUNCATE,TRIGGER') OR pg_catalog.has_function_privilege(r,'public.trimax_notify_scheduling_owner()','EXECUTE') THEN RAISE EXCEPTION 'Unexpected runtime notification privilege: %',r; END IF;
  END IF;
 END LOOP;
 IF pg_catalog.has_table_privilege('authenticated','public.scheduling_owner_notifications','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR pg_catalog.has_function_privilege('authenticated','public.trimax_notify_scheduling_owner()','EXECUTE') THEN RAISE EXCEPTION 'Authenticated notification authority too broad'; END IF;
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity AND relowner='postgres'::regrole FROM pg_catalog.pg_class WHERE oid='public.scheduling_owner_notifications'::regclass) THEN RAISE EXCEPTION 'Notification RLS/owner mismatch'; END IF;
END $$;
COMMIT;
