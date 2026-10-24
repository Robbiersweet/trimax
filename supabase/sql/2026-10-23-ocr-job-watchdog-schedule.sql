-- Mandatory release prerequisite: database-side watchdog continues when the
-- Windows OCR host is off. Do not substitute a host-local timer for this job.
do $$ begin
 if to_regclass('cron.job') is null then raise exception 'OCR lifecycle requires the reviewed pg_cron scheduler installation'; end if;
end $$;
select cron.schedule('trimax-ocr-watchdog','* * * * *','select public.trimax_reap_ocr_jobs(null);');
