alter table public.events
  add column emoji text not null default '🎲'
  check (char_length(btrim(emoji)) between 1 and 8);

alter table public.event_triggers
  add column emoji text not null default '🎯'
  check (char_length(btrim(emoji)) between 1 and 8);

create or replace function public.create_event_with_emojis(
  p_title text,
  p_grid_size smallint,
  p_signup_deadline timestamptz,
  p_event_emoji text,
  p_trigger_labels text[],
  p_trigger_emojis text[]
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
  trigger_idx integer;
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

  if coalesce(p_event_emoji, '') not in (
    '🎲', '🎉', '✨', '🎯', '🏆', '🎤', '📣', '🎬', '🎮', '🚀',
    '⚽', '🏀', '🍿', '🍕', '☕', '🐱', '🐶', '🦄', '🌈', '🔥',
    '💡', '🤖', '❤️', '💎', '📚', '🌟', '🎵', '🎁', '🧩', '🪩'
  ) then
    raise exception 'Choose an emoji from the available list';
  end if;

  trigger_count := coalesce(cardinality(p_trigger_labels), 0);
  if cardinality(coalesce(p_trigger_emojis, array[]::text[])) <> trigger_count then
    raise exception 'Each trigger must have exactly one emoji';
  end if;
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
  if exists (
    select 1 from unnest(coalesce(p_trigger_emojis, array[]::text[])) as icons(value)
    where coalesce(value, '') not in (
      '🎲', '🎉', '✨', '🎯', '🏆', '🎤', '📣', '🎬', '🎮', '🚀',
      '⚽', '🏀', '🍿', '🍕', '☕', '🐱', '🐶', '🦄', '🌈', '🔥',
      '💡', '🤖', '❤️', '💎', '📚', '🌟', '🎵', '🎁', '🧩', '🪩'
    )
  ) then
    raise exception 'Choose an emoji from the available list for every trigger';
  end if;

  insert into public.events (host_id, title, emoji, grid_size, signup_deadline)
  values (auth.uid(), btrim(p_title), p_event_emoji, p_grid_size, p_signup_deadline)
  returning * into new_event;

  for trigger_idx in 1..trigger_count loop
    insert into public.event_triggers (event_id, label, emoji)
    values (new_event.id, btrim(p_trigger_labels[trigger_idx]), p_trigger_emojis[trigger_idx]);
  end loop;

  return jsonb_build_object('event_id', new_event.id, 'invite_token', new_event.invite_token);
end;
$$;

create or replace function public.update_event_setup_with_emojis(
  p_event_id uuid,
  p_title text,
  p_signup_deadline timestamptz,
  p_event_emoji text,
  p_trigger_labels text[],
  p_trigger_emojis text[]
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
  trigger_idx integer;
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
  if coalesce(p_event_emoji, '') not in (
    '🎲', '🎉', '✨', '🎯', '🏆', '🎤', '📣', '🎬', '🎮', '🚀',
    '⚽', '🏀', '🍿', '🍕', '☕', '🐱', '🐶', '🦄', '🌈', '🔥',
    '💡', '🤖', '❤️', '💎', '📚', '🌟', '🎵', '🎁', '🧩', '🪩'
  ) then
    raise exception 'Choose an emoji from the available list';
  end if;

  trigger_count := coalesce(cardinality(p_trigger_labels), 0);
  if cardinality(coalesce(p_trigger_emojis, array[]::text[])) <> trigger_count then
    raise exception 'Each trigger must have exactly one emoji';
  end if;
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
  if exists (
    select 1 from unnest(coalesce(p_trigger_emojis, array[]::text[])) as icons(value)
    where coalesce(value, '') not in (
      '🎲', '🎉', '✨', '🎯', '🏆', '🎤', '📣', '🎬', '🎮', '🚀',
      '⚽', '🏀', '🍿', '🍕', '☕', '🐱', '🐶', '🦄', '🌈', '🔥',
      '💡', '🤖', '❤️', '💎', '📚', '🌟', '🎵', '🎁', '🧩', '🪩'
    )
  ) then
    raise exception 'Choose an emoji from the available list for every trigger';
  end if;

  update public.events
  set title = btrim(p_title), emoji = p_event_emoji, signup_deadline = p_signup_deadline
  where id = p_event_id;

  for trigger_idx in 1..trigger_count loop
    insert into public.event_triggers (event_id, label, emoji)
    values (p_event_id, btrim(p_trigger_labels[trigger_idx]), p_trigger_emojis[trigger_idx])
    on conflict (event_id, (lower(btrim(label)))) do update set emoji = excluded.emoji;
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

revoke all on function public.create_event_with_emojis(text, smallint, timestamptz, text, text[], text[]) from public, anon;
revoke all on function public.update_event_setup_with_emojis(uuid, text, timestamptz, text, text[], text[]) from public, anon;
grant execute on function public.create_event_with_emojis(text, smallint, timestamptz, text, text[], text[]) to authenticated;
grant execute on function public.update_event_setup_with_emojis(uuid, text, timestamptz, text, text[], text[]) to authenticated;
