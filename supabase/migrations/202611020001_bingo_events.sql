create table public.events (
  id uuid primary key default gen_random_uuid(),
  invite_token uuid not null unique default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  grid_size smallint not null check (grid_size between 3 and 7),
  signup_deadline timestamptz not null,
  manual_started_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (finalized_at is null or manual_started_at is not null or signup_deadline <= finalized_at)
);

create table public.event_triggers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 120),
  occurred boolean not null default false,
  created_at timestamptz not null default now(),
  unique (event_id, id)
);

create unique index event_triggers_unique_label
  on public.event_triggers(event_id, lower(btrim(label)));

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 32),
  joined_at timestamptz not null default now(),
  unique (event_id, user_id),
  unique (event_id, id)
);

create table public.card_cells (
  event_id uuid not null,
  participant_id uuid not null,
  trigger_id uuid not null,
  position smallint not null check (position >= 0),
  primary key (participant_id, position),
  unique (participant_id, trigger_id),
  foreign key (event_id, participant_id)
    references public.participants(event_id, id) on delete cascade,
  foreign key (event_id, trigger_id)
    references public.event_triggers(event_id, id) on delete cascade
);

create index events_by_host on public.events(host_id, created_at desc);
create index participants_by_user on public.participants(user_id, event_id);
create index card_cells_by_event on public.card_cells(event_id, participant_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_touch_updated_at
before update on public.events
for each row execute function public.touch_updated_at();

create or replace function public.has_event_access(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.host_id = auth.uid()
  ) or exists (
    select 1 from public.participants p
    where p.event_id = target_event_id and p.user_id = auth.uid()
  );
$$;

create or replace function public.is_event_host(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id and e.host_id = auth.uid()
  );
$$;

create or replace function public.is_signup_open(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id
      and e.finalized_at is null
      and e.manual_started_at is null
      and e.signup_deadline > statement_timestamp()
  );
$$;

create or replace function public.is_event_active(target_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.events e
    where e.id = target_event_id
      and e.finalized_at is null
      and (e.manual_started_at is not null or e.signup_deadline <= statement_timestamp())
  );
$$;

create or replace function public.check_card_cell_position()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  board_size integer;
begin
  select e.grid_size into board_size
  from public.events e
  where e.id = new.event_id;

  if board_size is null or new.position >= board_size * board_size then
    raise exception 'Card position is outside this event grid';
  end if;

  return new;
end;
$$;

create trigger card_cells_check_position
before insert or update of position, event_id on public.card_cells
for each row execute function public.check_card_cell_position();

create or replace function public.check_event_trigger_pool_minimum()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  board_size integer;
  pool_count integer;
begin
  select e.grid_size into board_size from public.events e where e.id = old.event_id;
  if not public.is_signup_open(old.event_id) then
    raise exception 'Trigger pool is locked because signup has closed';
  end if;

  select count(*) into pool_count
  from public.event_triggers t
  where t.event_id = old.event_id and t.id <> old.id;

  if pool_count < greatest(5, board_size * board_size) then
    raise exception 'Keep at least % unique triggers in the pool', greatest(5, board_size * board_size);
  end if;

  return old;
end;
$$;

create trigger event_triggers_keep_minimum
before delete on public.event_triggers
for each row execute function public.check_event_trigger_pool_minimum();

alter table public.events enable row level security;
alter table public.event_triggers enable row level security;
alter table public.participants enable row level security;
alter table public.card_cells enable row level security;

create policy events_select_members
  on public.events for select to authenticated
  using (public.has_event_access(id));

create policy event_triggers_select_members
  on public.event_triggers for select to authenticated
  using (public.has_event_access(event_id));

create policy participants_select_members
  on public.participants for select to authenticated
  using (public.has_event_access(event_id));

create policy card_cells_select_members
  on public.card_cells for select to authenticated
  using (
    public.is_event_host(event_id)
    or exists (
      select 1 from public.participants p
      where p.id = participant_id and p.event_id = card_cells.event_id and p.user_id = auth.uid()
    )
  );


revoke all on public.events, public.event_triggers, public.participants, public.card_cells from anon, authenticated;
grant select on public.events, public.event_triggers, public.participants, public.card_cells to authenticated;

create or replace function public.create_event(
  p_title text,
  p_grid_size smallint,
  p_signup_deadline timestamptz,
  p_trigger_labels text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_event public.events%rowtype;
  trigger_count integer;
  distinct_count integer;
  trigger_label text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before creating an event';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Event title must be between 1 and 80 characters';
  end if;
  if p_grid_size not between 3 and 7 then
    raise exception 'Card size must be between 3 and 7';
  end if;
  if p_signup_deadline <= statement_timestamp() then
    raise exception 'Signup deadline must be in the future';
  end if;

  trigger_count := coalesce(cardinality(p_trigger_labels), 0);
  select count(distinct lower(btrim(value))) into distinct_count
  from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value);

  if trigger_count < greatest(5, p_grid_size * p_grid_size) then
    raise exception 'Add at least % unique triggers', greatest(5, p_grid_size * p_grid_size);
  end if;
  if distinct_count <> trigger_count then
    raise exception 'Trigger texts must be unique';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value)
    where char_length(btrim(coalesce(value, ''))) not between 1 and 120
  ) then
    raise exception 'Each trigger must be between 1 and 120 characters';
  end if;

  insert into public.events (host_id, title, grid_size, signup_deadline)
  values (auth.uid(), btrim(p_title), p_grid_size, p_signup_deadline)
  returning * into new_event;

  foreach trigger_label in array p_trigger_labels loop
    insert into public.event_triggers (event_id, label)
    values (new_event.id, btrim(trigger_label));
  end loop;

  return jsonb_build_object('event_id', new_event.id, 'invite_token', new_event.invite_token);
end;
$$;

create or replace function public.join_event(p_invite_token uuid, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
  target_participant public.participants%rowtype;
  clean_name text := btrim(coalesce(p_display_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining an event';
  end if;
  select * into target_event from public.events where invite_token = p_invite_token for update;
  if not found then
    raise exception 'This invite link is not valid';
  end if;

  if target_event.host_id = auth.uid() then
    return jsonb_build_object(
      'event_id', target_event.id, 'participant_id', null, 'is_host', true,
      'requires_name', false, 'title', target_event.title, 'grid_size', target_event.grid_size,
      'signup_deadline', target_event.signup_deadline
    );
  end if;

  select * into target_participant
  from public.participants p
  where p.event_id = target_event.id and p.user_id = auth.uid();

  if target_participant.id is null then
    if not public.is_signup_open(target_event.id) then
      raise exception 'This bingo has already started';
    end if;
    if clean_name = '' then
      return jsonb_build_object(
        'event_id', target_event.id, 'participant_id', null, 'is_host', false,
        'requires_name', true, 'title', target_event.title, 'grid_size', target_event.grid_size,
        'signup_deadline', target_event.signup_deadline
      );
    end if;
    if char_length(clean_name) > 32 then
      raise exception 'Display name must be between 1 and 32 characters';
    end if;
    insert into public.participants (event_id, user_id, display_name)
    values (target_event.id, auth.uid(), clean_name)
    returning * into target_participant;
  elsif p_display_name is not null then
    if char_length(clean_name) not between 1 and 32 then
      raise exception 'Display name must be between 1 and 32 characters';
    end if;
    update public.participants p set display_name = clean_name
    where p.id = target_participant.id
    returning * into target_participant;
  end if;

  return jsonb_build_object(
    'event_id', target_event.id,
    'participant_id', target_participant.id,
    'display_name', target_participant.display_name,
    'is_host', false,
    'requires_name', false,
    'title', target_event.title,
    'grid_size', target_event.grid_size,
    'signup_deadline', target_event.signup_deadline
  );
end;
$$;

create or replace function public.save_card(p_participant_id uuid, p_cells jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event_id uuid;
  board_size integer;
  cell jsonb;
  cell_position integer;
  cell_trigger_id uuid;
  saved_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before editing a card';
  end if;
  select p.event_id, e.grid_size into target_event_id, board_size
  from public.participants p
  join public.events e on e.id = p.event_id
  where p.id = p_participant_id and p.user_id = auth.uid()
  for update of e, p;
  if target_event_id is null then
    raise exception 'You can only edit your own card';
  end if;
  if not public.is_signup_open(target_event_id) then
    raise exception 'Cards are locked because the event has started';
  end if;
  if jsonb_typeof(coalesce(p_cells, '[]'::jsonb)) <> 'array' then
    raise exception 'Card cells must be sent as a list';
  end if;
  if jsonb_array_length(coalesce(p_cells, '[]'::jsonb)) > board_size * board_size then
    raise exception 'Card has more cells than the board';
  end if;

  delete from public.card_cells where participant_id = p_participant_id;
  for cell in select value from jsonb_array_elements(coalesce(p_cells, '[]'::jsonb)) as cells(value)
  loop
    begin
      cell_position := (cell->>'position')::integer;
      cell_trigger_id := (cell->>'trigger_id')::uuid;
    exception when others then
      raise exception 'Card cell has an invalid position or trigger';
    end;

    insert into public.card_cells (event_id, participant_id, trigger_id, position)
    values (target_event_id, p_participant_id, cell_trigger_id, cell_position);
    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;

create or replace function public.update_event_setup(
  p_event_id uuid,
  p_title text,
  p_signup_deadline timestamptz,
  p_trigger_labels text[]
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  board_size integer;
  trigger_count integer;
  distinct_count integer;
  trigger_label text;
  old_trigger record;
begin
  select e.grid_size into board_size from public.events e where e.id = p_event_id for update;
  if board_size is null or not public.is_event_host(p_event_id) then
    raise exception 'Only the host can edit this event';
  end if;
  if not public.is_signup_open(p_event_id) then
    raise exception 'Event setup is locked after the event starts';
  end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then
    raise exception 'Event title must be between 1 and 80 characters';
  end if;
  if p_signup_deadline <= statement_timestamp() then
    raise exception 'Signup deadline must be in the future';
  end if;

  trigger_count := coalesce(cardinality(p_trigger_labels), 0);
  select count(distinct lower(btrim(value))) into distinct_count
  from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value);
  if trigger_count < greatest(5, board_size * board_size) then
    raise exception 'Add at least % unique triggers', greatest(5, board_size * board_size);
  end if;
  if distinct_count <> trigger_count then
    raise exception 'Trigger texts must be unique';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value)
    where char_length(btrim(coalesce(value, ''))) not between 1 and 120
  ) then
    raise exception 'Each trigger must be between 1 and 120 characters';
  end if;

  update public.events
  set title = btrim(p_title), signup_deadline = p_signup_deadline
  where id = p_event_id;

  foreach trigger_label in array p_trigger_labels loop
    insert into public.event_triggers (event_id, label)
    values (p_event_id, btrim(trigger_label))
    on conflict (event_id, (lower(btrim(label)))) do nothing;
  end loop;

  for old_trigger in
    select t.id, t.label from public.event_triggers t where t.event_id = p_event_id
  loop
    if not exists (
      select 1 from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value)
      where lower(btrim(value)) = lower(btrim(old_trigger.label))
    ) then
      delete from public.event_triggers where id = old_trigger.id;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function public.start_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found or target_event.host_id <> auth.uid() then
    raise exception 'Only the host can start this event';
  end if;
  if target_event.finalized_at is not null then
    raise exception 'This event is already finalized';
  end if;
  if target_event.manual_started_at is null and target_event.signup_deadline > statement_timestamp() then
    update public.events set manual_started_at = statement_timestamp() where id = p_event_id;
  end if;
  return true;
end;
$$;

create or replace function public.set_trigger_occurred(p_event_id uuid, p_trigger_id uuid, p_occurred boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found or target_event.host_id <> auth.uid() then
    raise exception 'Only the host can update triggers';
  end if;
  if target_event.finalized_at is not null
    or (target_event.manual_started_at is null and target_event.signup_deadline > statement_timestamp()) then
    raise exception 'Trigger updates are only allowed during an active event';
  end if;
  update public.event_triggers
  set occurred = p_occurred
  where id = p_trigger_id and event_id = p_event_id;
  if not found then
    raise exception 'Trigger not found in this event';
  end if;
  return true;
end;
$$;

create or replace function public.finalize_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_event public.events%rowtype;
begin
  select * into target_event from public.events where id = p_event_id for update;
  if not found or target_event.host_id <> auth.uid() then
    raise exception 'Only the host can finish this event';
  end if;
  if target_event.finalized_at is not null then
    raise exception 'This event is already finalized';
  end if;
  if target_event.manual_started_at is null and target_event.signup_deadline > statement_timestamp() then
    raise exception 'Start the event before finalizing it';
  end if;
  update public.events set finalized_at = statement_timestamp()
  where id = p_event_id and finalized_at is null;
  if not found then
    raise exception 'This event is already finalized';
  end if;
  return true;
end;
$$;

create or replace function public.get_event_results(p_event_id uuid)
returns table (participant_id uuid, display_name text, score integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  board_size integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in before viewing event results';
  end if;
  select e.grid_size into board_size
  from public.events e
  where e.id = p_event_id and e.finalized_at is not null and public.has_event_access(e.id);
  if board_size is null then
    raise exception 'Final results are available to event members after finalization';
  end if;

  return query
  select p.id,
         p.display_name,
         (
           (select count(*) from generate_series(0, board_size - 1) as row_lines(line_index)
            where (select count(*) from public.card_cells c
                   join public.event_triggers t on t.event_id = c.event_id and t.id = c.trigger_id
                   where c.participant_id = p.id and c.position / board_size = row_lines.line_index and t.occurred) = board_size)
           +
           (select count(*) from generate_series(0, board_size - 1) as column_lines(line_index)
            where (select count(*) from public.card_cells c
                   join public.event_triggers t on t.event_id = c.event_id and t.id = c.trigger_id
                   where c.participant_id = p.id and c.position % board_size = column_lines.line_index and t.occurred) = board_size)
           + case when (select count(*) from public.card_cells c
                        join public.event_triggers t on t.event_id = c.event_id and t.id = c.trigger_id
                        where c.participant_id = p.id and c.position / board_size = c.position % board_size and t.occurred) = board_size then 1 else 0 end
           + case when (select count(*) from public.card_cells c
                        join public.event_triggers t on t.event_id = c.event_id and t.id = c.trigger_id
                        where c.participant_id = p.id and c.position / board_size + c.position % board_size = board_size - 1 and t.occurred) = board_size then 1 else 0 end
         )::integer as score
  from public.participants p
  where p.event_id = p_event_id
    and (select count(*) from public.card_cells c where c.participant_id = p.id) = board_size * board_size
  order by score desc, p.display_name;
end;
$$;

revoke all on function public.create_event(text, smallint, timestamptz, text[]) from public, anon;
revoke all on function public.join_event(uuid, text) from public, anon;
revoke all on function public.save_card(uuid, jsonb) from public, anon;
revoke all on function public.update_event_setup(uuid, text, timestamptz, text[]) from public, anon;
revoke all on function public.start_event(uuid) from public, anon;
revoke all on function public.set_trigger_occurred(uuid, uuid, boolean) from public, anon;
revoke all on function public.finalize_event(uuid) from public, anon;
revoke all on function public.get_event_results(uuid) from public, anon;
revoke all on function public.has_event_access(uuid) from public, anon;
revoke all on function public.is_event_host(uuid) from public, anon;
revoke all on function public.is_signup_open(uuid) from public, anon;
revoke all on function public.is_event_active(uuid) from public, anon;

grant execute on function public.create_event(text, smallint, timestamptz, text[]) to authenticated;
grant execute on function public.join_event(uuid, text) to authenticated;
grant execute on function public.save_card(uuid, jsonb) to authenticated;
grant execute on function public.update_event_setup(uuid, text, timestamptz, text[]) to authenticated;
grant execute on function public.start_event(uuid) to authenticated;
grant execute on function public.set_trigger_occurred(uuid, uuid, boolean) to authenticated;
grant execute on function public.finalize_event(uuid) to authenticated;
grant execute on function public.get_event_results(uuid) to authenticated;
grant execute on function public.has_event_access(uuid) to authenticated;
grant execute on function public.is_event_host(uuid) to authenticated;
grant execute on function public.is_signup_open(uuid) to authenticated;
grant execute on function public.is_event_active(uuid) to authenticated;

alter table public.event_triggers replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.event_triggers;
exception
  when duplicate_object then null;
end;
$$;
