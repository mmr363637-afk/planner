-- Run AFTER setup.sql, once, in the connected Supabase SQL editor.
-- No secret keys in the browser. No deployments/migrations run automatically.
begin;
alter table public.user_states add column if not exists revision bigint not null default 1;
create table if not exists public.user_state_versions (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null,
  state jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.user_state_versions enable row level security;
drop policy if exists "versions_read_own" on public.user_state_versions;
create policy "versions_read_own" on public.user_state_versions for select to authenticated using (auth.uid()=user_id);
-- Block old clients' unchecked upserts. All writes go through the CAS function.
drop policy if exists "user_states_insert_own" on public.user_states;
drop policy if exists "user_states_update_own" on public.user_states;
drop policy if exists "user_states_delete_own" on public.user_states;
revoke insert, update, delete on public.user_states from anon, authenticated;
revoke all on public.user_state_versions from anon;
grant select on public.user_states, public.user_state_versions to authenticated;

create or replace function public.save_planner_state(p_expected_revision bigint, p_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  previous public.user_states%rowtype;
  new_revision bigint;
  stamp timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_expected_revision is null or p_expected_revision < 0 then raise exception 'invalid_revision'; end if;
  if p_state is null or jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(p_state->'subjects') is distinct from 'array'
     or jsonb_typeof(p_state->'topics') is distinct from 'array'
     or octet_length(p_state::text) > 12000000 then
    raise exception 'invalid_state';
  end if;
  -- Serializes the empty-row race as well as existing-row updates.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select * into previous from public.user_states where user_id=uid for update;
  if coalesce(previous.revision, 0) <> p_expected_revision then
    raise exception using errcode='P0001', message='planner_conflict';
  end if;
  new_revision := coalesce(previous.revision,0)+1;
  if previous.user_id is not null then
    insert into public.user_state_versions(user_id,revision,state,saved_at)
      values(uid,previous.revision,previous.state,previous.updated_at)
      on conflict do nothing;
  end if;
  insert into public.user_states(user_id,state,updated_at,revision)
    values(uid,p_state,stamp,new_revision)
    on conflict(user_id) do update set state=excluded.state,updated_at=excluded.updated_at,revision=excluded.revision;
  delete from public.user_state_versions where user_id=uid and revision not in
    (select revision from public.user_state_versions where user_id=uid order by revision desc limit 8);
  return jsonb_build_object('revision',new_revision,'updated_at',stamp);
end;
$$;
revoke all on function public.save_planner_state(bigint,jsonb) from public, anon;
grant execute on function public.save_planner_state(bigint,jsonb) to authenticated;
commit;
