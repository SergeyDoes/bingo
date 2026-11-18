-- Allow the owner to approve Twitch accounts by login before they first sign in.
create table if not exists public.bingo_host_username_allowlist (
  twitch_username text primary key check (
    twitch_username = lower(btrim(twitch_username))
    and char_length(twitch_username) between 1 and 25
    and twitch_username ~ '^[a-z0-9_]+$'
  ),
  created_at timestamptz not null default now()
);

alter table public.bingo_host_username_allowlist enable row level security;
revoke all on table public.bingo_host_username_allowlist from public, anon, authenticated;

create or replace function public.is_bingo_host_authorized()
returns boolean language sql stable security definer
set search_path = public, auth, pg_temp as $$
  select auth.uid() is not null and exists (
    select 1 from auth.identities identity_row
    where identity_row.user_id = auth.uid() and identity_row.provider = 'twitch'
      and (
        exists (select 1 from public.bingo_host_allowlist allowed where allowed.twitch_provider_id = identity_row.provider_id)
        or exists (select 1 from public.bingo_host_username_allowlist allowed where allowed.twitch_username = lower(identity_row.identity_data ->> 'preferred_username'))
      )
  );
$$;

revoke all on function public.is_bingo_host_authorized() from public, anon;
grant execute on function public.is_bingo_host_authorized() to authenticated;
