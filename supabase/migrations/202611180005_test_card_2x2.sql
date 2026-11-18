alter table public.events drop constraint if exists events_grid_size_check;
alter table public.events add constraint events_grid_size_check check (grid_size between 2 and 7);

create or replace function public.create_test_event_2x2(
  p_title text,
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
  trigger_count integer := coalesce(cardinality(p_trigger_labels), 0);
  trigger_idx integer;
  distinct_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in before creating an event'; end if;
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 80 then raise exception 'Event title must be between 1 and 80 characters'; end if;
  if p_signup_deadline <= statement_timestamp() then raise exception 'Signup deadline must be in the future'; end if;
  if not public.is_bingo_emoji(p_event_emoji) then raise exception 'Choose an event emoji from the available list'; end if;
  if cardinality(coalesce(p_trigger_emojis, array[]::text[])) <> trigger_count then raise exception 'Each trigger must have exactly one emoji'; end if;
  select count(distinct lower(btrim(value))) into distinct_count
  from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value);
  if trigger_count < 5 then raise exception 'Add at least 5 unique triggers for a 2 × 2 test card'; end if;
  if distinct_count <> trigger_count then raise exception 'Trigger texts must be unique'; end if;
  if exists (select 1 from unnest(coalesce(p_trigger_labels, array[]::text[])) as labels(value) where char_length(btrim(coalesce(value, ''))) not between 1 and 120) then
    raise exception 'Each trigger must be between 1 and 120 characters';
  end if;
  if exists (select 1 from unnest(coalesce(p_trigger_emojis, array[]::text[])) as icons(value) where not public.is_bingo_emoji(value)) then
    raise exception 'Choose an emoji from the available list for every trigger';
  end if;

  insert into public.events(host_id, title, emoji, grid_size, signup_deadline)
  values (auth.uid(), btrim(p_title), p_event_emoji, 2, p_signup_deadline)
  returning * into new_event;
  for trigger_idx in 1..trigger_count loop
    insert into public.event_triggers(event_id, label, emoji)
    values (new_event.id, btrim(p_trigger_labels[trigger_idx]), p_trigger_emojis[trigger_idx]);
  end loop;
  return jsonb_build_object('event_id', new_event.id, 'invite_token', new_event.invite_token);
end;
$$;
revoke all on function public.create_test_event_2x2(text, timestamptz, text, text[], text[]) from public, anon;
grant execute on function public.create_test_event_2x2(text, timestamptz, text, text[], text[]) to authenticated;
