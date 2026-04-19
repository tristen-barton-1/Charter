begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.sex_code as enum ('male', 'female', 'other');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.diagnosis_code as enum (
    'alzheimers',
    'mdd',
    'gad',
    'schizoaffective',
    'bipolar',
    'delusional_disorder',
    'schizophrenia',
    'dementia_mood',
    'dementia_anxiety',
    'dementia_behavior',
    'insomnia',
    'skin_picking',
    'impulse_control'
  );
exception
  when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age integer not null check (age >= 0 and age <= 130),
  sex public.sex_code,
  room text not null default 'Room TBD',
  facility text not null default 'Long-term care facility',
  diagnoses public.diagnosis_code[] not null default '{}'::public.diagnosis_code[],
  enable_psychotherapy boolean not null default false,
  status text not null default '',
  summary text not null default '',
  last_seen text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.encounters (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  transcript text not null default '',
  input jsonb not null default '{}'::jsonb,
  parsed jsonb not null default '{}'::jsonb,
  notes jsonb not null default '{}'::jsonb,
  generated_notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists patients_name_idx
  on public.patients (name);

create index if not exists encounters_patient_started_idx
  on public.encounters (patient_id, started_at desc);

create index if not exists encounters_patient_idx
  on public.encounters (patient_id);

drop trigger if exists set_patients_updated_at on public.patients;
create trigger set_patients_updated_at
before update on public.patients
for each row
execute function public.set_updated_at();

drop trigger if exists set_encounters_updated_at on public.encounters;
create trigger set_encounters_updated_at
before update on public.encounters
for each row
execute function public.set_updated_at();

alter table public.patients enable row level security;
alter table public.encounters enable row level security;

drop policy if exists "allow_all_patients" on public.patients;
create policy "allow_all_patients"
on public.patients
for all
using (true)
with check (true);

drop policy if exists "allow_all_encounters" on public.encounters;
create policy "allow_all_encounters"
on public.encounters
for all
using (true)
with check (true);

commit;
