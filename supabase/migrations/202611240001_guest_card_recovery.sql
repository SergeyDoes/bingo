create extension if not exists pgcrypto with schema extensions;

create table if not exists public.guest_card_recovery (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  code_hash bytea not null unique,
  created_at timestamptz not null default now()
);

alter table public.guest_card_recovery enable row level security;
revoke all on public.guest_card_recovery from public, anon, authenticated;

drop function if exists public.join_event(uuid, text);

create or replace function public.join_event(
  p_invite_token uuid,
  p_display_name text default null,
  p_guest_recovery_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  target_event public.events%rowtype;
  target_participant public.participants%rowtype;
  clean_name text := btrim(coalesce(p_display_name, ''));
  is_guest boolean := coalesce((auth.jwt()->>'is_anonymous')::boolean, false);
  normalized_code text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before joining an event';
  end if;

  select * into target_event
  from public.events
  where invite_token = p_invite_token
  for update;
  if not found then raise exception 'This invite link is not valid'; end if;

  if target_event.host_id = auth.uid() then
    return jsonb_build_object(
      'event_id', target_event.id, 'participant_id', null, 'is_host', true,
      'requires_name', false, 'title', target_event.title, 'grid_size', target_event.grid_size,
      'signup_deadline', target_event.signup_deadline
    );
  end if;

  if not is_guest then
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
  end if;

  select * into target_participant
  from public.participants p
  where p.event_id = target_event.id and p.user_id = auth.uid();

  if target_participant.id is null then
    if not public.is_signup_open(target_event.id) then
      if is_guest then
        return jsonb_build_object(
          'event_id', target_event.id, 'participant_id', null, 'is_host', false,
          'requires_name', true, 'signup_open', false, 'title', target_event.title,
          'grid_size', target_event.grid_size, 'signup_deadline', target_event.signup_deadline
        );
      end if;
      raise exception 'This bingo has already started';
    end if;

    if is_guest and clean_name = '' then
      return jsonb_build_object(
        'event_id', target_event.id, 'participant_id', null, 'is_host', false,
        'requires_name', true, 'title', target_event.title, 'grid_size', target_event.grid_size,
        'signup_deadline', target_event.signup_deadline
      );
    end if;

    if char_length(clean_name) not between 1 and 32 then
      raise exception 'Display name must be between 1 and 32 characters';
    end if;

    if is_guest then
      if coalesce(p_guest_recovery_code, '') !~ '^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$' then
        raise exception 'A valid guest recovery code is required';
      end if;
      normalized_code := replace(upper(p_guest_recovery_code), '-', '');
    end if;

    insert into public.participants (event_id, user_id, display_name)
    values (target_event.id, auth.uid(), clean_name)
    returning * into target_participant;

    if is_guest then
      insert into public.guest_card_recovery (participant_id, code_hash)
      values (target_participant.id, extensions.digest(normalized_code, 'sha256'));
    end if;
  elsif is_guest and clean_name <> '' then
    if char_length(clean_name) not between 1 and 32 then
      raise exception 'Display name must be between 1 and 32 characters';
    end if;
    update public.participants p set display_name = clean_name
    where p.id = target_participant.id
    returning * into target_participant;
  elsif not is_guest then
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

revoke all on function public.join_event(uuid, text, text) from public, anon;
grant execute on function public.join_event(uuid, text, text) to authenticated;

create or replace function public.recover_guest_card(
  p_invite_token uuid,
  p_recovery_code text,
  p_replacement_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  target_event public.events%rowtype;
  target_participant public.participants%rowtype;
  old_user_id uuid;
  normalized_code text;
  normalized_replacement text;
begin
  if auth.uid() is null then raise exception 'Sign in before recovering a card'; end if;
  if coalesce(p_recovery_code, '') !~ '^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$'
    or coalesce(p_replacement_code, '') !~ '^[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2}$' then
    raise exception 'The recovery code is not valid';
  end if;

  normalized_code := replace(upper(p_recovery_code), '-', '');
  normalized_replacement := replace(upper(p_replacement_code), '-', '');
  if normalized_code = normalized_replacement then
    raise exception 'A new recovery code is required';
  end if;

  select * into target_event
  from public.events e
  where e.invite_token = p_invite_token
  for update;
  if not found then raise exception 'The recovery code does not match this event'; end if;

  select p.* into target_participant
  from public.participants p
  join public.guest_card_recovery r on r.participant_id = p.id
  where p.event_id = target_event.id
    and r.code_hash = extensions.digest(normalized_code, 'sha256')
  for update of p, r;
  if not found then raise exception 'The recovery code does not match this event'; end if;

  old_user_id := target_participant.user_id;
  if exists (
    select 1 from public.participants p
    where p.event_id = target_event.id and p.user_id = auth.uid() and p.id <> target_participant.id
  ) then
    raise exception 'This account already has a card for this event';
  end if;

  update public.participants
  set user_id = auth.uid()
  where id = target_participant.id;

  if old_user_id <> auth.uid() then
    delete from public.event_moderators
    where event_id = target_event.id and user_id = old_user_id;
  end if;

  update public.guest_card_recovery
  set code_hash = extensions.digest(normalized_replacement, 'sha256'), created_at = statement_timestamp()
  where participant_id = target_participant.id;

  return jsonb_build_object(
    'event_id', target_event.id,
    'participant_id', target_participant.id,
    'display_name', target_participant.display_name,
    'title', target_event.title,
    'grid_size', target_event.grid_size,
    'signup_deadline', target_event.signup_deadline
  );
end;
$$;

revoke all on function public.recover_guest_card(uuid, text, text) from public, anon;
grant execute on function public.recover_guest_card(uuid, text, text) to authenticated;
