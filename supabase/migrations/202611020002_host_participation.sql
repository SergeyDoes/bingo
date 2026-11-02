-- Allow the event host to join as a participant before the event starts.
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
  caller_is_host boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining an event';
  end if;

  select * into target_event
  from public.events
  where invite_token = p_invite_token
  for update;
  if not found then
    raise exception 'This invite link is not valid';
  end if;
  caller_is_host := target_event.host_id = auth.uid();

  select * into target_participant
  from public.participants p
  where p.event_id = target_event.id and p.user_id = auth.uid();

  if target_participant.id is null then
    if not public.is_signup_open(target_event.id) then
      raise exception 'This bingo has already started';
    end if;
    if clean_name = '' then
      return jsonb_build_object(
        'event_id', target_event.id, 'participant_id', null, 'is_host', caller_is_host,
        'requires_name', true, 'title', target_event.title, 'grid_size', target_event.grid_size,
        'signup_deadline', target_event.signup_deadline
      );
    end if;
    if char_length(clean_name) not between 1 and 32 then
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
    'is_host', caller_is_host,
    'requires_name', false,
    'title', target_event.title,
    'grid_size', target_event.grid_size,
    'signup_deadline', target_event.signup_deadline
  );
end;
$$;

revoke all on function public.join_event(uuid, text) from public, anon;
grant execute on function public.join_event(uuid, text) to authenticated;
