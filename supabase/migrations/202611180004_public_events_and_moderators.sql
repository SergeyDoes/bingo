alter table public.events add column if not exists is_public boolean not null default false;

create policy events_select_public_signup
  on public.events for select to authenticated
  using (is_public and public.is_signup_open(id));

create or replace function public.set_event_public(target_event_id uuid, public_value boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = target_event_id for update;
  if not found or target_event.host_id <> auth.uid() then raise exception 'Only the host can change event visibility'; end if;
  if not public.is_signup_open(target_event_id) then raise exception 'Event visibility can only be changed while signup is open'; end if;
  update public.events set is_public = public_value where id = target_event_id;
  return true;
end;
$$;
revoke all on function public.set_event_public(uuid, boolean) from public, anon;
grant execute on function public.set_event_public(uuid, boolean) to authenticated;

create table public.event_moderators (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
alter table public.event_moderators enable row level security;
revoke all on table public.event_moderators from public, anon, authenticated;
grant select on table public.event_moderators to authenticated;
create policy event_moderators_select_host_or_self on public.event_moderators for select to authenticated
  using (public.is_event_host(event_id) or user_id = auth.uid());

create or replace function public.is_event_moderator(target_event_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.event_moderators where event_id = target_event_id and user_id = auth.uid());
$$;
revoke all on function public.is_event_moderator(uuid) from public, anon;
grant execute on function public.is_event_moderator(uuid) to authenticated;

create or replace function public.set_event_moderator(target_event_id uuid, target_user_id uuid, moderator_value boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = target_event_id for update;
  if not found or target_event.host_id <> auth.uid() then raise exception 'Only the host can manage event moderators'; end if;
  if target_event.finalized_at is not null then raise exception 'Moderators cannot be changed after event finalization'; end if;
  if not exists (select 1 from public.participants where event_id = target_event_id and user_id = target_user_id) then
    raise exception 'Only an event participant can be made a moderator';
  end if;
  if moderator_value then
    insert into public.event_moderators(event_id, user_id) values (target_event_id, target_user_id) on conflict do nothing;
  else
    delete from public.event_moderators where event_id = target_event_id and user_id = target_user_id;
  end if;
  return true;
end;
$$;
revoke all on function public.set_event_moderator(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_event_moderator(uuid, uuid, boolean) to authenticated;

create or replace function public.set_trigger_occurred(p_event_id uuid, p_trigger_id uuid, p_occurred boolean)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found or (target_event.host_id <> auth.uid() and not public.is_event_moderator(p_event_id)) then
    raise exception 'Only the host or an assigned moderator can update triggers';
  end if;
  if target_event.finalized_at is not null
    or (target_event.manual_started_at is null and target_event.signup_deadline > statement_timestamp()) then
    raise exception 'Trigger updates are only allowed during an active event';
  end if;
  update public.event_triggers set occurred = p_occurred where id = p_trigger_id and event_id = p_event_id;
  if not found then raise exception 'Trigger not found in this event'; end if;
  return true;
end;
$$;
