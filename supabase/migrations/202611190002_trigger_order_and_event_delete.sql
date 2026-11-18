alter table public.event_triggers
  add column if not exists sort_order integer;

with ranked_triggers as (
  select id,
         row_number() over (partition by event_id order by created_at, id) - 1 as ordinal
  from public.event_triggers
)
update public.event_triggers as trigger_row
set sort_order = ranked_triggers.ordinal
from ranked_triggers
where trigger_row.id = ranked_triggers.id
  and trigger_row.sort_order is null;

alter table public.event_triggers
  alter column sort_order set not null;

create or replace function public.assign_event_trigger_sort_order()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sort_order is null then
    perform 1 from public.events where id = new.event_id for update;
    select coalesce(max(sort_order) + 1, 0)
    into new.sort_order
    from public.event_triggers
    where event_id = new.event_id;
  end if;
  return new;
end;
$$;

create trigger event_triggers_assign_sort_order
before insert on public.event_triggers
for each row execute function public.assign_event_trigger_sort_order();

create or replace function public.update_event_setup_with_emoji_palette(
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
  fallback_emojis text[];
  trigger_idx integer;
begin
  if not public.is_bingo_emoji(p_event_emoji) then
    raise exception 'Choose an event emoji from the available list';
  end if;
  if coalesce(cardinality(p_trigger_labels), 0) is distinct from coalesce(cardinality(p_trigger_emojis), 0) then
    raise exception 'Each trigger must have exactly one emoji';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_trigger_emojis, array[]::text[])) as icons(value)
    where not public.is_bingo_emoji(value)
  ) then
    raise exception 'Choose an emoji from the available list for every trigger';
  end if;

  select coalesce(array_agg('🎯'::text order by generated.ordinal), array[]::text[])
  into fallback_emojis
  from generate_series(1, coalesce(cardinality(p_trigger_labels), 0)) as generated(ordinal);

  perform public.update_event_setup_with_emojis(
    p_event_id, p_title, p_signup_deadline, '🎲', p_trigger_labels, fallback_emojis
  );
  update public.events set emoji = p_event_emoji where id = p_event_id;

  for trigger_idx in 1..coalesce(cardinality(p_trigger_labels), 0) loop
    update public.event_triggers
    set emoji = p_trigger_emojis[trigger_idx], sort_order = trigger_idx - 1
    where event_id = p_event_id
      and lower(btrim(label)) = lower(btrim(p_trigger_labels[trigger_idx]));
    if not found then
      raise exception 'Could not apply an emoji and order to every trigger';
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.update_event_setup_with_emoji_palette(uuid, text, timestamptz, text, text[], text[]) from public, anon;
grant execute on function public.update_event_setup_with_emoji_palette(uuid, text, timestamptz, text, text[], text[]) to authenticated;

create or replace function public.delete_event(p_event_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting an event';
  end if;
  delete from public.events where id = p_event_id and host_id = auth.uid();
  if not found then
    raise exception 'Only the event host can delete this event';
  end if;
  return true;
end;
$$;

revoke all on function public.delete_event(uuid) from public, anon;
grant execute on function public.delete_event(uuid) to authenticated;
