alter table public.participants
  add column if not exists card_updated_at timestamptz;

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

  update public.participants
  set card_updated_at = statement_timestamp()
  where id = p_participant_id;

  return saved_count;
end;
$$;
