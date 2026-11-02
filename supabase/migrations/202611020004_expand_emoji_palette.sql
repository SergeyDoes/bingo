create table public.bingo_emoji_options (
  emoji text primary key
);

insert into public.bingo_emoji_options (emoji) values
  ('🎲'), ('🎉'), ('✨'), ('🎯'), ('🏆'), ('🎤'), ('📣'), ('🎬'), ('🎮'), ('🚀'),
  ('⚽'), ('🏀'), ('🏈'), ('⚾'), ('🎾'), ('🏐'), ('🏉'), ('🍿'), ('🍕'), ('☕'),
  ('🍔'), ('🍟'), ('🍩'), ('🍺'), ('🥤'), ('🍰'), ('🎂'), ('🌮'), ('🥨'), ('🍪'),
  ('🍎'), ('🍉'), ('🐱'), ('🐶'), ('🐸'), ('🐼'), ('🦊'), ('🐧'), ('🐻'), ('🦁'),
  ('🐙'), ('🦋'), ('🐢'), ('🦖'), ('🐰'), ('🐵'), ('🦄'), ('🌈'), ('🔥'), ('💡'),
  ('🤖'), ('❤️'), ('💎'), ('📚'), ('🌟'), ('🎵'), ('🎁'), ('🧩'), ('🪩'), ('🤡'),
  ('💀'), ('▶️'), ('🔁'), ('⏯️'), ('⏸️'), ('🙂'), ('😎'), ('🤔'), ('😂'), ('🤣'),
  ('😭'), ('😱'), ('🙃'), ('😴'), ('🤯'), ('🥳'), ('🤩'), ('😅'), ('😈'), ('👀'),
  ('🫠'), ('🫡'), ('🙄'), ('🌞'), ('🌙'), ('⛈️'), ('❄️'), ('☔'), ('⚡'), ('🌪️'),
  ('🌊'), ('🌋'), ('☀️'), ('🚗'), ('🚲'), ('✈️'), ('🚂'), ('🛸'), ('🏎️'), ('🚌'),
  ('🚁'), ('🎹'), ('🎧'), ('🎸'), ('🥁'), ('🎻'), ('📱'), ('💻'), ('🪄'), ('📺'),
  ('🎙️'), ('✅'), ('❌'), ('❓'), ('❗'), ('🔔'), ('📌'), ('🕹️'), ('🥇'), ('🥈'),
  ('🥉'), ('🧨'), ('🎈'), ('🎊'), ('🎀')
on conflict (emoji) do nothing;

alter table public.bingo_emoji_options enable row level security;
revoke all on table public.bingo_emoji_options from public, anon, authenticated;

create or replace function public.is_bingo_emoji(p_emoji text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.bingo_emoji_options option_row where option_row.emoji = p_emoji
  );
$$;

revoke all on function public.is_bingo_emoji(text) from public, anon, authenticated;

create or replace function public.create_event_with_emoji_palette(
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
  fallback_emojis text[];
  creation_result jsonb;
  target_event_id uuid;
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

  creation_result := public.create_event_with_emojis(
    p_title, p_grid_size, p_signup_deadline, '🎲', p_trigger_labels, fallback_emojis
  );
  target_event_id := (creation_result->>'event_id')::uuid;
  update public.events set emoji = p_event_emoji where id = target_event_id;

  for trigger_idx in 1..coalesce(cardinality(p_trigger_labels), 0) loop
    update public.event_triggers
    set emoji = p_trigger_emojis[trigger_idx]
    where event_id = target_event_id
      and lower(btrim(label)) = lower(btrim(p_trigger_labels[trigger_idx]));
    if not found then
      raise exception 'Could not apply an emoji to every trigger';
    end if;
  end loop;

  return creation_result;
end;
$$;

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
    set emoji = p_trigger_emojis[trigger_idx]
    where event_id = p_event_id
      and lower(btrim(label)) = lower(btrim(p_trigger_labels[trigger_idx]));
    if not found then
      raise exception 'Could not apply an emoji to every trigger';
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.create_event_with_emoji_palette(text, smallint, timestamptz, text, text[], text[]) from public, anon;
revoke all on function public.update_event_setup_with_emoji_palette(uuid, text, timestamptz, text, text[], text[]) from public, anon;
grant execute on function public.create_event_with_emoji_palette(text, smallint, timestamptz, text, text[], text[]) to authenticated;
grant execute on function public.update_event_setup_with_emoji_palette(uuid, text, timestamptz, text, text[], text[]) to authenticated;
