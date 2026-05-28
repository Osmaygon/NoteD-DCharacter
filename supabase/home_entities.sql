create table if not exists public.app_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_by uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_campaign_members (
  campaign_id uuid not null references public.app_campaigns(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null default 'player',
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.app_characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_by uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_character_members (
  character_id uuid not null references public.app_characters(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (character_id, user_id)
);

alter table public.app_campaigns enable row level security;
alter table public.app_campaign_members enable row level security;
alter table public.app_characters enable row level security;
alter table public.app_character_members enable row level security;

drop policy if exists "no direct app_campaigns" on public.app_campaigns;
drop policy if exists "no direct app_campaign_members" on public.app_campaign_members;
drop policy if exists "no direct app_characters" on public.app_characters;
drop policy if exists "no direct app_character_members" on public.app_character_members;

create policy "no direct app_campaigns" on public.app_campaigns for all using (false) with check (false);
create policy "no direct app_campaign_members" on public.app_campaign_members for all using (false) with check (false);
create policy "no direct app_characters" on public.app_characters for all using (false) with check (false);
create policy "no direct app_character_members" on public.app_character_members for all using (false) with check (false);

create or replace function public.create_campaign_for_user(p_user_id uuid, p_name text)
returns table(id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  c_id uuid;
begin
  if trim(p_name) = '' then
    raise exception 'Nombre invalido';
  end if;

  new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  insert into public.app_campaigns(name, join_code, created_by)
  values (trim(p_name), new_code, p_user_id)
  returning app_campaigns.id into c_id;

  insert into public.app_campaign_members(campaign_id, user_id, role)
  values (c_id, p_user_id, 'owner');

  return query
  select c.id, c.name, c.join_code from public.app_campaigns c where c.id = c_id;
end;
$$;

create or replace function public.join_campaign_by_code(p_user_id uuid, p_code text)
returns table(id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_row public.app_campaigns%rowtype;
begin
  select * into campaign_row from public.app_campaigns where join_code = upper(trim(p_code));
  if campaign_row.id is null then
    raise exception 'Campana no encontrada';
  end if;

  insert into public.app_campaign_members(campaign_id, user_id, role)
  values (campaign_row.id, p_user_id, 'player')
  on conflict (campaign_id, user_id) do nothing;

  return query
  select campaign_row.id, campaign_row.name, campaign_row.join_code;
end;
$$;

create or replace function public.list_campaigns_for_user(p_user_id uuid)
returns table(id uuid, name text, join_code text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.join_code, c.created_at
  from public.app_campaign_members m
  join public.app_campaigns c on c.id = m.campaign_id
  where m.user_id = p_user_id
  order by c.created_at desc;
$$;

create or replace function public.create_character_for_user(p_user_id uuid, p_name text)
returns table(id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  ch_id uuid;
begin
  if trim(p_name) = '' then
    raise exception 'Nombre invalido';
  end if;

  new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  insert into public.app_characters(name, join_code, created_by)
  values (trim(p_name), new_code, p_user_id)
  returning app_characters.id into ch_id;

  insert into public.app_character_members(character_id, user_id)
  values (ch_id, p_user_id);

  return query
  select c.id, c.name, c.join_code from public.app_characters c where c.id = ch_id;
end;
$$;

create or replace function public.join_character_by_code(p_user_id uuid, p_code text)
returns table(id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  character_row public.app_characters%rowtype;
begin
  select * into character_row from public.app_characters where join_code = upper(trim(p_code));
  if character_row.id is null then
    raise exception 'Personaje no encontrado';
  end if;

  insert into public.app_character_members(character_id, user_id)
  values (character_row.id, p_user_id)
  on conflict (character_id, user_id) do nothing;

  return query
  select character_row.id, character_row.name, character_row.join_code;
end;
$$;

create or replace function public.list_characters_for_user(p_user_id uuid)
returns table(id uuid, name text, join_code text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.join_code, c.created_at
  from public.app_character_members m
  join public.app_characters c on c.id = m.character_id
  where m.user_id = p_user_id
  order by c.created_at desc;
$$;

grant execute on function public.create_campaign_for_user(uuid, text) to anon, authenticated;
grant execute on function public.join_campaign_by_code(uuid, text) to anon, authenticated;
grant execute on function public.list_campaigns_for_user(uuid) to anon, authenticated;
grant execute on function public.create_character_for_user(uuid, text) to anon, authenticated;
grant execute on function public.join_character_by_code(uuid, text) to anon, authenticated;
grant execute on function public.list_characters_for_user(uuid) to anon, authenticated;
