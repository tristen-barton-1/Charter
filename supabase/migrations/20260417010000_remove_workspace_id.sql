begin;

alter table if exists public.patients
  drop column if exists workspace_id;

alter table if exists public.encounters
  drop column if exists workspace_id;

drop index if exists public.patients_workspace_name_idx;
drop index if exists public.encounters_workspace_patient_started_idx;
drop index if exists public.encounters_workspace_idx;

commit;
