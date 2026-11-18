alter table public.events add column if not exists host_twitch_name text;
update public.events e
set host_twitch_name = coalesce(
  nullif(btrim(i.identity_data ->> 'name'), ''),
  nullif(btrim(i.identity_data ->> 'preferred_username'), ''),
  nullif(btrim(i.identity_data ->> 'nickname'), ''),
  nullif(btrim(i.identity_data ->> 'slug'), '')
)
from auth.identities i
where i.user_id = e.host_id and i.provider = 'twitch' and e.host_twitch_name is null;

create or replace function public.require_bingo_host_allowlist()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.is_bingo_host_authorized() then
    raise exception 'Your Twitch account is not approved to create bingo events';
  end if;
  select coalesce(
    nullif(btrim(identity_row.identity_data ->> 'name'), ''),
    nullif(btrim(identity_row.identity_data ->> 'preferred_username'), ''),
    nullif(btrim(identity_row.identity_data ->> 'nickname'), ''),
    nullif(btrim(identity_row.identity_data ->> 'slug'), '')
  )
  into new.host_twitch_name
  from auth.identities identity_row
  where identity_row.user_id = auth.uid() and identity_row.provider = 'twitch'
  order by identity_row.last_sign_in_at desc nulls last
  limit 1;
  return new;
end;
$$;

create or replace function public.join_event(p_invite_token uuid, p_display_name text default null)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  target_event public.events%rowtype;
  target_participant public.participants%rowtype;
  clean_name text;
  caller_is_host boolean;
begin
  if auth.uid() is null then raise exception 'Sign in before joining an event'; end if;
  select coalesce(
    nullif(btrim(identity_row.identity_data ->> 'name'), ''),
    nullif(btrim(identity_row.identity_data ->> 'preferred_username'), ''),
    nullif(btrim(identity_row.identity_data ->> 'nickname'), ''),
    nullif(btrim(identity_row.identity_data ->> 'slug'), '')
  )
  into clean_name
  from auth.identities identity_row
  where identity_row.user_id = auth.uid() and identity_row.provider = 'twitch'
  order by identity_row.last_sign_in_at desc nulls last
  limit 1;
  if clean_name is null or char_length(clean_name) not between 1 and 32 then
    raise exception 'Could not read your Twitch nickname. Sign in through Twitch again';
  end if;
  select * into target_event from public.events where invite_token = p_invite_token for update;
  if not found then raise exception 'This invite link is not valid'; end if;
  caller_is_host := target_event.host_id = auth.uid();
  select * into target_participant from public.participants p where p.event_id = target_event.id and p.user_id = auth.uid();
  if target_participant.id is null then
    if not public.is_signup_open(target_event.id) then raise exception 'This bingo has already started'; end if;
    insert into public.participants(event_id, user_id, display_name)
    values (target_event.id, auth.uid(), clean_name)
    returning * into target_participant;
  else
    update public.participants p set display_name = clean_name
    where p.id = target_participant.id returning * into target_participant;
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
