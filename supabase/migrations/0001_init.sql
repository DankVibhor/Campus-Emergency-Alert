-- ============================================================
-- ASMT Aegis - Campus Emergency Response System
-- Migration 0001: schema, RLS, realtime, seed data
-- Safe to re-run: drops and recreates everything.
-- ============================================================

drop table if exists escalations     cascade;
drop table if exists incident_events cascade;
drop table if exists incidents       cascade;
drop table if exists responders      cascade;
drop table if exists locations       cascade;
drop table if exists campuses        cascade;

-- ------------------------------------------------------------
-- Tables
-- ------------------------------------------------------------
create table campuses (
  id      uuid primary key default gen_random_uuid(),
  name    text not null,
  code    text not null unique,
  address text,
  lat     numeric,
  lng     numeric
);

create table locations (
  id        uuid primary key default gen_random_uuid(),
  campus_id uuid not null references campuses(id) on delete cascade,
  block     text,
  floor     text,
  label     text not null,
  lat       numeric,
  lng       numeric
);

create table responders (
  id               uuid primary key default gen_random_uuid(),
  campus_id        uuid not null references campuses(id) on delete cascade,
  name             text not null,
  role             text not null check (role in ('medical','security','warden','admin')),
  phone            text,
  telegram_chat_id text,
  on_duty          boolean not null default true
);

create table incidents (
  id              uuid primary key default gen_random_uuid(),
  campus_id       uuid references campuses(id) on delete set null,
  location_id     uuid references locations(id) on delete set null,
  reporter_name   text,
  reporter_phone  text,
  is_anonymous    boolean not null default false,
  emergency_type  text not null,
  description     text,
  ai_priority     text,
  rule_priority   text,
  final_priority  text,
  ai_reasoning    text,
  status          text not null default 'reported'
                  check (status in ('reported','classified','acknowledged','resolved','cancelled')),
  reporter_lat    numeric,
  reporter_lng    numeric,
  created_at      timestamptz not null default now(),
  classified_at   timestamptz,
  acknowledged_at timestamptz,
  resolved_at     timestamptz,
  acknowledged_by uuid references responders(id) on delete set null
);

create table incident_events (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references incidents(id) on delete cascade,
  event_type  text not null,
  actor       text,
  note        text,
  created_at  timestamptz not null default now()
);

create table escalations (
  id           uuid primary key default gen_random_uuid(),
  incident_id  uuid not null references incidents(id) on delete cascade,
  tier         int  not null,
  notified_at  timestamptz not null default now(),
  acknowledged boolean not null default false
);

-- ------------------------------------------------------------
-- Indexes (dashboard sorts by priority + recency)
-- ------------------------------------------------------------
create index idx_locations_campus       on locations(campus_id);
create index idx_responders_campus_role on responders(campus_id, role) where on_duty;
create index idx_incidents_status_time  on incidents(status, created_at desc);
create index idx_incidents_campus       on incidents(campus_id);
create index idx_events_incident_time   on incident_events(incident_id, created_at);
create index idx_escalations_incident   on escalations(incident_id);

-- ------------------------------------------------------------
-- Row Level Security
-- Hackathon posture: reporting is anonymous/public, acting is authenticated.
-- ------------------------------------------------------------
alter table campuses        enable row level security;
alter table locations       enable row level security;
alter table responders      enable row level security;
alter table incidents       enable row level security;
alter table incident_events enable row level security;
alter table escalations     enable row level security;

-- Reference data: world-readable (a QR scan must work with no login).
create policy "campuses public read"  on campuses  for select using (true);
create policy "locations public read" on locations for select using (true);

-- Responder directory holds phone + telegram ids: staff only, never anon.
create policy "responders auth read" on responders for select to authenticated using (true);

-- Anyone may report an emergency, and follow the incident they just filed.
create policy "incidents anon insert" on incidents for insert to anon, authenticated with check (true);
create policy "incidents public read" on incidents for select using (true);

-- Only signed-in responders may acknowledge / resolve.
create policy "incidents auth update" on incidents for update to authenticated using (true) with check (true);

-- Timeline is readable by the reporter following their incident.
create policy "events public read" on incident_events for select using (true);
create policy "events anon insert" on incident_events for insert to anon, authenticated with check (true);

create policy "escalations public read" on escalations for select using (true);
create policy "escalations auth write" on escalations for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
-- Realtime
-- ------------------------------------------------------------
alter publication supabase_realtime add table incidents;
alter publication supabase_realtime add table incident_events;

-- Realtime UPDATE payloads need full row images, not just changed columns.
alter table incidents       replica identity full;
alter table incident_events replica identity full;

-- ------------------------------------------------------------
-- Seed: ASMT, 3 blocks x 4 locations, 3 responders per role
-- ------------------------------------------------------------
insert into campuses (name, code, address, lat, lng) values
  ('Main Block',     'MAIN', 'ASMT, Alampur, Faridabad, Haryana', 28.3590, 77.2790),
  ('Academic Block', 'ACAD', 'ASMT, Alampur, Faridabad, Haryana', 28.3594, 77.2796),
  ('Hostel Block',   'HOST', 'ASMT, Alampur, Faridabad, Haryana', 28.3586, 77.2784);

insert into locations (campus_id, block, floor, label, lat, lng)
select c.id, c.name, f.floor, f.floor, c.lat, c.lng
from campuses c
cross join (values
  ('Ground Floor'), ('1st Floor'), ('2nd Floor'), ('Rooftop')
) as f(floor);

-- One responder per role per campus => 3 per role overall.
insert into responders (campus_id, name, role, phone, telegram_chat_id)
select c.id, r.label, r.role, r.phone, null
from campuses c
cross join (values
  ('medical',  'Dr. Meera Nagpal',  '+919000000001'),
  ('security', 'Ranbir Yadav',      '+919000000002'),
  ('warden',   'Sunita Chauhan',    '+919000000003'),
  ('admin',    'Prof. A. K. Singh', '+919000000004')
) as r(role, label, phone);

-- ------------------------------------------------------------
-- Sanity check: expect 3 / 12 / 12
-- ------------------------------------------------------------
select
  (select count(*) from campuses)   as campuses,
  (select count(*) from locations)  as locations,
  (select count(*) from responders) as responders;
