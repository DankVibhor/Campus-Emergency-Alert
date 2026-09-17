-- ============================================================
-- ASMT Aegis - Migration 0002
-- Adds: photo evidence, duplicate grouping, responder ETA,
--       web push subscriptions, safe-walk check-ins.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Incident columns
-- ------------------------------------------------------------
alter table incidents add column if not exists photo_url text;

-- Points at the incident this one duplicates. Null means it is the primary.
alter table incidents add column if not exists duplicate_of uuid
  references incidents(id) on delete set null;

-- Where the responding staff member was when they accepted, and their
-- straight-line distance / estimated arrival at that moment.
alter table incidents add column if not exists responder_lat numeric;
alter table incidents add column if not exists responder_lng numeric;
alter table incidents add column if not exists responder_eta_seconds int;
alter table incidents add column if not exists responder_name text;
alter table incidents add column if not exists on_my_way_at timestamptz;

create index if not exists idx_incidents_duplicate_of on incidents(duplicate_of);

-- Duplicate detection scans recent incidents of the same type in one block.
create index if not exists idx_incidents_dupe_scan
  on incidents(campus_id, emergency_type, created_at desc);

-- ------------------------------------------------------------
-- 2. Web push subscriptions
-- ------------------------------------------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  campus_id  uuid references campuses(id) on delete cascade,
  label      text,
  created_at timestamptz not null default now(),
  last_used  timestamptz
);

create index if not exists idx_push_campus on push_subscriptions(campus_id);

-- ------------------------------------------------------------
-- 3. Safe walk check-ins
-- ------------------------------------------------------------
create table if not exists safe_walks (
  id             uuid primary key default gen_random_uuid(),
  campus_id      uuid references campuses(id) on delete set null,
  person_name    text,
  person_phone   text,
  from_label     text,
  to_label       text,
  expected_minutes int not null default 10,
  started_at     timestamptz not null default now(),
  due_at         timestamptz not null,
  checked_in_at  timestamptz,
  status         text not null default 'walking'
                 check (status in ('walking','safe','overdue','escalated','cancelled')),
  last_lat       numeric,
  last_lng       numeric,
  incident_id    uuid references incidents(id) on delete set null
);

create index if not exists idx_safe_walks_status_due on safe_walks(status, due_at);

-- ------------------------------------------------------------
-- 4. Row Level Security
-- ------------------------------------------------------------
alter table push_subscriptions enable row level security;
alter table safe_walks         enable row level security;

drop policy if exists "push anon insert" on push_subscriptions;
drop policy if exists "push auth read"   on push_subscriptions;
-- Anyone may register this browser for alerts; only staff may read the list.
create policy "push anon insert" on push_subscriptions
  for insert to anon, authenticated with check (true);
create policy "push auth read" on push_subscriptions
  for select to authenticated using (true);

drop policy if exists "walks public read"   on safe_walks;
drop policy if exists "walks anon insert"   on safe_walks;
drop policy if exists "walks anon update"   on safe_walks;
-- A walk is followed on the same device that started it, with no login.
create policy "walks public read" on safe_walks for select using (true);
create policy "walks anon insert" on safe_walks
  for insert to anon, authenticated with check (true);
create policy "walks anon update" on safe_walks
  for update to anon, authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- 5. Realtime
-- ------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table safe_walks;
  exception when duplicate_object then null;
  end;
end $$;

alter table safe_walks replica identity full;

-- ------------------------------------------------------------
-- 6. Storage bucket for incident photos
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('incident-photos', 'incident-photos', true)
on conflict (id) do nothing;

drop policy if exists "incident photos anon upload" on storage.objects;
drop policy if exists "incident photos public read" on storage.objects;

create policy "incident photos anon upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'incident-photos');

create policy "incident photos public read" on storage.objects
  for select using (bucket_id = 'incident-photos');

-- ------------------------------------------------------------
-- Sanity check
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.columns
     where table_name = 'incidents' and column_name = 'photo_url')      as has_photo_url,
  (select count(*) from information_schema.tables
     where table_name = 'push_subscriptions')                          as has_push_table,
  (select count(*) from information_schema.tables
     where table_name = 'safe_walks')                                  as has_safe_walks,
  (select count(*) from storage.buckets where id = 'incident-photos')  as has_bucket;
