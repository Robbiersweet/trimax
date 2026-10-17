-- Candidate emergency rollback only; preserves all requests, notification rows and read state.
BEGIN;
DROP TRIGGER IF EXISTS scheduling_owner_notification ON public.public_service_requests;
COMMIT;
-- Reconcile the approved release contract through the protected process before worker restart.
