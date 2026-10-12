-- psql -v ON_ERROR_STOP=1 -v business_id=<verified R&L UUID> -f this-file
-- Preparation only: never enables public intake or automatic booking.
begin;
insert into public.public_scheduling_settings(business_id,public_slug,display_name,description,enabled,mode,owner_approval_required,time_zone,business_hours,appointment_windows)
values(:'business_id'::uuid,'rnl-creations','R&L Creations',
'Thoughtful repairs, painting, and property care. Tell us what you need and we will help plan the next step.',
false,'request-only',true,'America/Los_Angeles','{"start":"08:00","end":"17:00"}',
'[{"id":"morning","label":"Morning · 8 am–12 pm","start":"08:00","end":"12:00"},{"id":"afternoon","label":"Afternoon · 12–5 pm","start":"12:00","end":"17:00"}]')
on conflict(business_id) do nothing;
insert into public.public_service_request_types(business_id,public_key,public_label,internal_label,display_order,scheduling_eligible)
select :'business_id'::uuid,k,label,label,ordinal,true from (values
('repair','Handyman / Repair',0),('painting','Painting',1),('carpentry','Carpentry',2),
('property','Apartment / Property Service',3),('estimate','Estimate Request',4),('other','Other',5)) t(k,label,ordinal)
on conflict(business_id,public_key) do nothing;
commit;
