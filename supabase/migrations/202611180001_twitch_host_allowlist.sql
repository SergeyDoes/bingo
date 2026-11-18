-- Restrict new event creation to manually approved Twitch identities.
create table if not exists public.bingo_host_allowlist (
  twitch_provider_id text primary key check (char_length(btrim(twitch_provider_id)) between 1 and 64),
  created_at timestamptz not null default now()
);

alter table public.bingo_host_allowlist enable row level security;
revoke all on table public.bingo_host_allowlist from public, anon, authenticated;

create or replace function public.is_bingo_host_authorized()
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1
    from auth.identities identity_row
    join public.bingo_host_allowlist allowed
      on allowed.twitch_provider_id = identity_row.provider_id
    where identity_row.user_id = auth.uid()
      and identity_row.provider = 'twitch'
  );
$$;

revoke all on function public.is_bingo_host_authorized() from public, anon;
grant execute on function public.is_bingo_host_authorized() to authenticated;

create or replace function public.require_bingo_host_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_bingo_host_authorized() then
    raise exception 'Your Twitch account is not approved to create bingo events';
  end if;
  return new;
end;
$$;

revoke all on function public.require_bingo_host_allowlist() from public, anon, authenticated;
drop trigger if exists events_require_approved_twitch_host on public.events;
create trigger events_require_approved_twitch_host
before insert on public.events
for each row execute function public.require_bingo_host_allowlist();
