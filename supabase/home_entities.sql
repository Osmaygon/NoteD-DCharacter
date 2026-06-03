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
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (character_id, user_id)
);

create table if not exists public.app_character_profiles (
  character_id uuid primary key references public.app_characters(id) on delete cascade,
  class_name text,
  level int,
  race text,
  background text,
  hp int,
  current_hp int,
  temp_hp int not null default 0,
  shields int not null default 0,
  ac int,
  speed int,
  notes text,
  source_payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.app_character_user_state (
  character_id uuid not null references public.app_characters(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  current_hp int,
  temp_hp int not null default 0,
  shields int not null default 0,
  spell_slots_spent jsonb not null default '{}'::jsonb,
  ammunition jsonb not null default '{"visible": false, "entries": []}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (character_id, user_id)
);

alter table public.app_character_members add column if not exists is_visible boolean not null default true;
alter table public.app_character_profiles add column if not exists current_hp int;
alter table public.app_character_profiles add column if not exists temp_hp int not null default 0;
alter table public.app_character_profiles add column if not exists shields int not null default 0;
alter table public.app_character_user_state add column if not exists spell_slots_spent jsonb not null default '{}'::jsonb;
alter table public.app_character_user_state add column if not exists ammunition jsonb not null default '{"visible": false, "entries": []}'::jsonb;

alter table public.app_campaigns enable row level security;
alter table public.app_campaign_members enable row level security;
alter table public.app_characters enable row level security;
alter table public.app_character_members enable row level security;
alter table public.app_character_profiles enable row level security;
alter table public.app_character_user_state enable row level security;

drop policy if exists "no direct app_campaigns" on public.app_campaigns;
drop policy if exists "no direct app_campaign_members" on public.app_campaign_members;
drop policy if exists "no direct app_characters" on public.app_characters;
drop policy if exists "no direct app_character_members" on public.app_character_members;
drop policy if exists "no direct app_character_profiles" on public.app_character_profiles;
drop policy if exists "no direct app_character_user_state" on public.app_character_user_state;

create policy "no direct app_campaigns" on public.app_campaigns for all using (false) with check (false);
create policy "no direct app_campaign_members" on public.app_campaign_members for all using (false) with check (false);
create policy "no direct app_characters" on public.app_characters for all using (false) with check (false);
create policy "no direct app_character_members" on public.app_character_members for all using (false) with check (false);
create policy "no direct app_character_profiles" on public.app_character_profiles for all using (false) with check (false);
create policy "no direct app_character_user_state" on public.app_character_user_state for all using (false) with check (false);

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

  insert into public.app_character_profiles(character_id)
  values (ch_id)
  on conflict (character_id) do nothing;

  return query
  select c.id, c.name, c.join_code from public.app_characters c where c.id = ch_id;
end;
$$;

create or replace function public.import_character_from_payload(p_user_id uuid, p_payload jsonb)
returns table(id uuid, name text, join_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  ch_id uuid;
  parsed_name text;
begin
  parsed_name := coalesce(
    nullif(trim(p_payload->>'name'), ''),
    nullif(trim(p_payload->>'character_name'), ''),
    nullif(trim(p_payload->>'nombre'), ''),
    'Personaje importado'
  );

  new_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

  insert into public.app_characters(name, join_code, created_by)
  values (parsed_name, new_code, p_user_id)
  returning app_characters.id into ch_id;

  insert into public.app_character_members(character_id, user_id)
  values (ch_id, p_user_id)
  on conflict (character_id, user_id) do nothing;

  insert into public.app_character_profiles(
    character_id,
    class_name,
    level,
    race,
    background,
    hp,
    current_hp,
    temp_hp,
    shields,
    ac,
    speed,
    notes,
    source_payload
  )
  values (
    ch_id,
    nullif(trim(coalesce(p_payload->>'class_name', p_payload->>'class', p_payload->>'clase')), ''),
    nullif(p_payload->>'level', '')::int,
    nullif(trim(coalesce(p_payload->>'race', p_payload->>'species', p_payload->>'raza')), ''),
    nullif(trim(coalesce(p_payload->>'background', p_payload->>'trasfondo')), ''),
    nullif(p_payload->>'hp', '')::int,
    coalesce(nullif(p_payload->>'current_hp', '')::int, nullif(p_payload->>'hp', '')::int, 0),
    coalesce(nullif(p_payload->>'temp_hp', '')::int, 0),
    coalesce(nullif(p_payload->>'shields', '')::int, 0),
    nullif(p_payload->>'ac', '')::int,
    nullif(p_payload->>'speed', '')::int,
    nullif(trim(coalesce(p_payload->>'notes', p_payload->>'notas')), ''),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (character_id) do update set
    class_name = excluded.class_name,
    level = excluded.level,
    race = excluded.race,
    background = excluded.background,
    hp = excluded.hp,
    current_hp = excluded.current_hp,
    temp_hp = excluded.temp_hp,
    shields = excluded.shields,
    ac = excluded.ac,
    speed = excluded.speed,
    notes = excluded.notes,
    source_payload = excluded.source_payload,
    updated_at = now();

  return query
  select c.id, c.name, c.join_code from public.app_characters c where c.id = ch_id;
end;
$$;

drop function if exists public.get_character_detail_for_user(uuid, uuid);

create or replace function public.get_character_detail_for_user(p_user_id uuid, p_character_id uuid)
returns table(
  id uuid,
  name text,
  join_code text,
  class_name text,
  level int,
  race text,
  background text,
  hp int,
  current_hp int,
  temp_hp int,
  shields int,
  ac int,
  speed int,
  notes text,
  source_payload jsonb,
  spell_slots_spent jsonb,
  ammunition jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.join_code,
    p.class_name,
    p.level,
    p.race,
    p.background,
    p.hp,
    coalesce(s.current_hp, p.current_hp, p.hp, 0),
    coalesce(s.temp_hp, p.temp_hp, 0),
    coalesce(s.shields, p.shields, 0),
    p.ac,
    p.speed,
    p.notes,
    p.source_payload,
    coalesce(s.spell_slots_spent, '{}'::jsonb),
    coalesce(s.ammunition, '{"visible": false, "entries": []}'::jsonb)
  from public.app_characters c
  join public.app_character_members m on m.character_id = c.id and m.user_id = p_user_id
  left join public.app_character_profiles p on p.character_id = c.id
  left join public.app_character_user_state s on s.character_id = c.id and s.user_id = p_user_id
  where c.id = p_character_id
  limit 1;
$$;

drop function if exists public.update_character_detail_for_user(uuid, uuid, text, text, int, text, text, int, int, int, text);

create or replace function public.update_character_detail_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_name text,
  p_class_name text,
  p_level int,
  p_race text,
  p_background text,
  p_hp int,
  p_current_hp int,
  p_temp_hp int,
  p_shields int,
  p_ac int,
  p_speed int,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_character_members m
    where m.character_id = p_character_id and m.user_id = p_user_id
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  update public.app_characters
  set name = coalesce(nullif(trim(p_name), ''), name)
  where id = p_character_id;

  insert into public.app_character_profiles(character_id, class_name, level, race, background, hp, current_hp, temp_hp, shields, ac, speed, notes, source_payload)
  values (
    p_character_id,
    nullif(trim(p_class_name), ''),
    p_level,
    nullif(trim(p_race), ''),
    nullif(trim(p_background), ''),
    p_hp,
    greatest(coalesce(p_hp, 0), 0),
    0,
    0,
    p_ac,
    p_speed,
    nullif(trim(p_notes), ''),
    '{}'::jsonb
  )
  on conflict (character_id) do update set
    class_name = excluded.class_name,
    level = excluded.level,
    race = excluded.race,
    background = excluded.background,
    hp = excluded.hp,
    ac = excluded.ac,
    speed = excluded.speed,
    notes = excluded.notes,
    updated_at = now();

  insert into public.app_character_user_state(character_id, user_id, current_hp, temp_hp, shields)
  values (
    p_character_id,
    p_user_id,
    greatest(coalesce(p_current_hp, p_hp, 0), 0),
    greatest(coalesce(p_temp_hp, 0), 0),
    greatest(coalesce(p_shields, 0), 0)
  )
  on conflict (character_id, user_id) do update set
    current_hp = excluded.current_hp,
    temp_hp = excluded.temp_hp,
    shields = excluded.shields,
    updated_at = now();
end;
$$;

create or replace function public.delete_character_for_user(p_user_id uuid, p_character_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  can_delete boolean;
begin
  select exists(
    select 1
    from public.app_characters c
    where c.id = p_character_id and c.created_by = p_user_id
  ) into can_delete;

  if not can_delete then
    raise exception 'Solo el creador puede borrar este personaje';
  end if;

  delete from public.app_characters
  where id = p_character_id;
end;
$$;

create or replace function public.update_character_source_payload_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_source_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_character_members m
    where m.character_id = p_character_id and m.user_id = p_user_id
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  insert into public.app_character_profiles(character_id, source_payload)
  values (p_character_id, coalesce(p_source_payload, '{}'::jsonb))
  on conflict (character_id) do update set
    source_payload = excluded.source_payload,
    updated_at = now();
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

  insert into public.app_character_members(character_id, user_id, is_visible)
  values (character_row.id, p_user_id, true)
  on conflict (character_id, user_id) do update set is_visible = true;

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
    and coalesce(m.is_visible, true)
  order by c.created_at desc;
$$;

create or replace function public.list_all_characters_for_user(p_user_id uuid)
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

create or replace function public.list_hidden_characters_for_user(p_user_id uuid)
returns table(id uuid, name text, join_code text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.join_code, c.created_at
  from public.app_character_members m
  join public.app_characters c on c.id = m.character_id
  where m.user_id = p_user_id
    and not coalesce(m.is_visible, true)
  order by c.created_at desc;
$$;

create or replace function public.set_character_visibility_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_is_visible boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.app_character_members
  set is_visible = coalesce(p_is_visible, true)
  where user_id = p_user_id and character_id = p_character_id;

  if not found then
    raise exception 'Personaje no encontrado';
  end if;
end;
$$;

create or replace function public.update_character_spell_slots_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_spell_slots_spent jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_character_members m
    where m.character_id = p_character_id and m.user_id = p_user_id
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  insert into public.app_character_user_state(character_id, user_id, spell_slots_spent)
  values (p_character_id, p_user_id, coalesce(p_spell_slots_spent, '{}'::jsonb))
  on conflict (character_id, user_id) do update set
    spell_slots_spent = excluded.spell_slots_spent,
    updated_at = now();
end;
$$;

create or replace function public.update_character_ammunition_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_ammunition jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_character_members m
    where m.character_id = p_character_id and m.user_id = p_user_id
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  insert into public.app_character_user_state(character_id, user_id, ammunition)
  values (p_character_id, p_user_id, coalesce(p_ammunition, '{"visible": false, "entries": []}'::jsonb))
  on conflict (character_id, user_id) do update set
    ammunition = excluded.ammunition,
    updated_at = now();
end;
$$;

grant execute on function public.create_campaign_for_user(uuid, text) to anon, authenticated;
grant execute on function public.join_campaign_by_code(uuid, text) to anon, authenticated;
grant execute on function public.list_campaigns_for_user(uuid) to anon, authenticated;
grant execute on function public.create_character_for_user(uuid, text) to anon, authenticated;
grant execute on function public.join_character_by_code(uuid, text) to anon, authenticated;
grant execute on function public.list_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.list_all_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.list_hidden_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.set_character_visibility_for_user(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.update_character_spell_slots_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.update_character_ammunition_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.import_character_from_payload(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_character_detail_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.update_character_detail_for_user(uuid, uuid, text, text, int, text, text, int, int, int, int, int, int, text) to anon, authenticated;
grant execute on function public.update_character_source_payload_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.delete_character_for_user(uuid, uuid) to anon, authenticated;
