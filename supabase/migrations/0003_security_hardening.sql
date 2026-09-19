-- ============================================================
-- ASMT Aegis - Migration 0003: security hardening
--
-- Fixes four issues confirmed by probing the live REST API with
-- the public anon key (the key that ships inside the JS bundle):
--
--   1. Any visitor could dump every incident including the
--      reporter's real name, phone number and GPS position.
--      Proven against a live harassment report.
--   2. Any visitor could insert fabricated events into any
--      incident's timeline, e.g. a false "resolved" entry.
--   3. Any visitor could update any safe_walk row - including
--      marking a walk "safe" and suppressing the alert for
--      someone who is actually in danger - and could read every
--      walker's live GPS position.
--   4. Operational escalation records were world-readable.
--
-- Everything the application legitimately needs still works:
-- reads that used to happen with the anon key now either stay
-- (non-sensitive columns) or move behind a server route that
-- uses the service-role key after checking the staff session.
-- Safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Column-level privileges on incidents
--
-- RLS is row-level and cannot hide individual columns, so the
-- "public read" policy leaked PII even though the rows were
-- meant to be followable. Postgres column grants are the right
-- tool and PostgREST honours them.
--
-- anon keeps exactly the columns the reporter's own status page
-- and the live dashboard render. It loses the identifying ones.
-- ------------------------------------------------------------
revoke select on public.incidents from anon;

grant select (
  id,
  campus_id,
  location_id,
  is_anonymous,
  emergency_type,
  description,
  ai_priority,
  rule_priority,
  final_priority,
  ai_reasoning,
  status,
  created_at,
  classified_at,
  acknowledged_at,
  resolved_at,
  acknowledged_by,
  photo_url,
  duplicate_of,
  responder_eta_seconds,
  on_my_way_at
) on public.incidents to anon;

-- Withheld from anon by omission above:
--   reporter_name, reporter_phone   - identifies the reporter
--   reporter_lat,  reporter_lng     - precise position of a person in distress
--   responder_lat, responder_lng    - tracks a staff member
--   responder_name                  - names on-duty staff
-- Staff read these through /api/incident/contacts, which checks
-- the staff session server-side first.

-- Inserting a report stays open: reporting must work with no login.
-- The insert policy already exists; ensure the column grants allow it.
grant insert on public.incidents to anon;

-- ------------------------------------------------------------
-- 2. incident_events: read-only for anon
--
-- The timeline is the incident's audit trail. Letting anyone
-- append to it destroys its value as a record. All legitimate
-- writes come from server routes using the service-role key,
-- which bypasses RLS, so removing this policy breaks nothing.
-- ------------------------------------------------------------
drop policy if exists "events anon insert" on public.incident_events;
revoke insert on public.incident_events from anon;

-- ------------------------------------------------------------
-- 3. safe_walks: no direct anon access at all
--
-- "using (true)" on UPDATE meant any visitor could mark any
-- walk safe. For a feature whose entire purpose is that silence
-- raises an alarm, that is the most dangerous policy in the
-- schema. Reads exposed live GPS of every active walker.
--
-- The walk id is an unguessable uuid held only by the walker's
-- device, so it works as a capability token - but it must be
-- checked by a server route, not handed to PostgREST.
-- ------------------------------------------------------------
drop policy if exists "walks anon update" on public.safe_walks;
drop policy if exists "walks public read" on public.safe_walks;
drop policy if exists "walks anon insert" on public.safe_walks;

revoke select, insert, update, delete on public.safe_walks from anon;

-- Signed-in staff may review walks in progress.
drop policy if exists "walks auth read" on public.safe_walks;
create policy "walks auth read" on public.safe_walks
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- 4. escalations: staff only
-- ------------------------------------------------------------
drop policy if exists "escalations public read" on public.escalations;
revoke select on public.escalations from anon;

drop policy if exists "escalations auth read" on public.escalations;
create policy "escalations auth read" on public.escalations
  for select to authenticated using (true);

-- ------------------------------------------------------------
-- 5. push_subscriptions: never readable by anon
-- ------------------------------------------------------------
revoke select on public.push_subscriptions from anon;

-- ------------------------------------------------------------
-- 6. Durable rate limiting
--
-- The existing limiter was an in-process Map. Every serverless
-- invocation gets a fresh one, so it stopped nothing. This table
-- is shared state, which is what a rate limiter actually needs.
-- Written only by the service-role key.
-- ------------------------------------------------------------
create table if not exists rate_limits (
  bucket      text        not null,
  identifier  text        not null,
  window_start timestamptz not null,
  count       int         not null default 1,
  primary key (bucket, identifier, window_start)
);

create index if not exists idx_rate_limits_window on rate_limits(window_start);

alter table rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
-- No policies: only the service-role key (which bypasses RLS) touches this.

-- Atomic increment. Returns the count within the current window
-- so the caller can decide whether to allow the request.
create or replace function bump_rate_limit(
  p_bucket text,
  p_identifier text,
  p_window_seconds int
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  -- Floor "now" to the start of the current fixed window.
  v_window := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into rate_limits (bucket, identifier, window_start, count)
  values (p_bucket, p_identifier, v_window, 1)
  on conflict (bucket, identifier, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  -- Opportunistic cleanup of old windows.
  delete from rate_limits where window_start < now() - interval '1 day';

  return v_count;
end;
$$;

revoke all on function bump_rate_limit(text, text, int) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 7. Storage: constrain the incident photo bucket
--
-- It accepted any file of any size from anonymous callers into a
-- public bucket - usable to host arbitrary content on your domain
-- or to exhaust storage.
-- ------------------------------------------------------------
update storage.buckets
set
  file_size_limit = 5242880,  -- 5 MB; the client already downscales to ~1280px
  allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'incident-photos';

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
select
  (select count(*) from information_schema.column_privileges
     where table_name = 'incidents' and grantee = 'anon'
       and column_name in ('reporter_name','reporter_phone','reporter_lat','reporter_lng')
  ) as anon_pii_columns_should_be_0,
  (select count(*) from pg_policies
     where tablename = 'incident_events' and policyname = 'events anon insert'
  ) as anon_event_insert_should_be_0,
  (select count(*) from pg_policies
     where tablename = 'safe_walks' and policyname like '%anon%'
  ) as anon_walk_policies_should_be_0,
  (select count(*) from information_schema.tables
     where table_name = 'rate_limits'
  ) as rate_limit_table_should_be_1,
  (select file_size_limit from storage.buckets where id = 'incident-photos'
  ) as photo_size_limit;
