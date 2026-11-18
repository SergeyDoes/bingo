alter table public.events add column if not exists host_twitch_id text;
update public.events e set host_twitch_id = i.provider_id
from auth.identities i
where i.user_id = e.host_id and i.provider = 'twitch' and e.host_twitch_id is null;

create or replace function public.require_bingo_host_allowlist()
returns trigger language plpgsql security definer set search_path = public, auth, pg_temp as $$
begin
  if not public.is_bingo_host_authorized() then raise exception 'Your Twitch account is not approved to create bingo events'; end if;
  select
    coalesce(nullif(btrim(identity_row.identity_data ->> 'name'), ''), nullif(btrim(identity_row.identity_data ->> 'preferred_username'), ''), nullif(btrim(identity_row.identity_data ->> 'nickname'), ''), nullif(btrim(identity_row.identity_data ->> 'slug'), '')),
    identity_row.provider_id
  into new.host_twitch_name, new.host_twitch_id
  from auth.identities identity_row
  where identity_row.user_id = auth.uid() and identity_row.provider = 'twitch'
  order by identity_row.last_sign_in_at desc nulls last limit 1;
  return new;
end;
$$;

create or replace function public.get_my_twitch_id()
returns text language sql stable security definer set search_path = auth, pg_temp as $$
  select provider_id from auth.identities where user_id = auth.uid() and provider = 'twitch' order by last_sign_in_at desc nulls last limit 1;
$$;
revoke all on function public.get_my_twitch_id() from public, anon;
grant execute on function public.get_my_twitch_id() to authenticated;
