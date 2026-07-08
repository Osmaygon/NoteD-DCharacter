alter table public.app_users add column if not exists nickname text;

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
  inventory jsonb not null default '{"entries": []}'::jsonb,
  profile_overrides jsonb not null default '{}'::jsonb,
  source_payload_overrides jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (character_id, user_id)
);

alter table public.app_character_members add column if not exists is_visible boolean not null default true;
alter table public.app_character_profiles add column if not exists current_hp int;
alter table public.app_character_profiles add column if not exists temp_hp int not null default 0;
alter table public.app_character_profiles add column if not exists shields int not null default 0;
alter table public.app_character_user_state add column if not exists spell_slots_spent jsonb not null default '{}'::jsonb;
alter table public.app_character_user_state add column if not exists ammunition jsonb not null default '{"visible": false, "entries": []}'::jsonb;
alter table public.app_character_user_state add column if not exists inventory jsonb not null default '{"entries": []}'::jsonb;
alter table public.app_character_user_state add column if not exists profile_overrides jsonb not null default '{}'::jsonb;
alter table public.app_character_user_state add column if not exists source_payload_overrides jsonb not null default '{}'::jsonb;
alter table public.app_campaigns add column if not exists description text not null default '';
alter table public.app_campaigns add column if not exists source_payload jsonb not null default '{}'::jsonb;

create table if not exists public.app_campaign_journal_entries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.app_campaigns(id) on delete cascade,
  title text not null,
  session_date date,
  blocks jsonb not null default '[]'::jsonb,
  source_payload jsonb not null default '{}'::jsonb,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_campaigns enable row level security;
alter table public.app_campaign_members enable row level security;
alter table public.app_characters enable row level security;
alter table public.app_character_members enable row level security;
alter table public.app_character_profiles enable row level security;
alter table public.app_character_user_state enable row level security;
alter table public.app_campaign_journal_entries enable row level security;

drop policy if exists "no direct app_campaigns" on public.app_campaigns;
drop policy if exists "no direct app_campaign_members" on public.app_campaign_members;
drop policy if exists "no direct app_characters" on public.app_characters;
drop policy if exists "no direct app_character_members" on public.app_character_members;
drop policy if exists "no direct app_character_profiles" on public.app_character_profiles;
drop policy if exists "no direct app_character_user_state" on public.app_character_user_state;
drop policy if exists "no direct app_campaign_journal_entries" on public.app_campaign_journal_entries;

create policy "no direct app_campaigns" on public.app_campaigns for all using (false) with check (false);
create policy "no direct app_campaign_members" on public.app_campaign_members for all using (false) with check (false);
create policy "no direct app_characters" on public.app_characters for all using (false) with check (false);
create policy "no direct app_character_members" on public.app_character_members for all using (false) with check (false);
create policy "no direct app_character_profiles" on public.app_character_profiles for all using (false) with check (false);
create policy "no direct app_character_user_state" on public.app_character_user_state for all using (false) with check (false);
create policy "no direct app_campaign_journal_entries" on public.app_campaign_journal_entries for all using (false) with check (false);

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
  select * into campaign_row from public.app_campaigns c where c.join_code = upper(trim(p_code));
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

drop function if exists public.list_campaigns_for_user(uuid);

create or replace function public.list_campaigns_for_user(p_user_id uuid)
returns table(
  id uuid,
  name text,
  join_code text,
  created_at timestamptz,
  role text,
  can_edit boolean,
  description text,
  source_payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.join_code,
    c.created_at,
    m.role,
    m.role in ('owner', 'admin', 'editor'),
    coalesce(c.description, ''),
    coalesce(c.source_payload, '{}'::jsonb)
  from public.app_campaign_members m
  join public.app_campaigns c on c.id = m.campaign_id
  where m.user_id = p_user_id
  order by c.created_at desc;
$$;

create or replace function public.get_campaign_detail_for_user(p_user_id uuid, p_campaign_id uuid)
returns table(
  id uuid,
  name text,
  join_code text,
  created_at timestamptz,
  role text,
  can_edit boolean,
  description text,
  source_payload jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.join_code,
    c.created_at,
    m.role,
    m.role in ('owner', 'admin', 'editor'),
    coalesce(c.description, ''),
    coalesce(c.source_payload, '{}'::jsonb)
  from public.app_campaign_members m
  join public.app_campaigns c on c.id = m.campaign_id
  where m.user_id = p_user_id
    and c.id = p_campaign_id
  limit 1;
$$;

create or replace function public.update_campaign_for_user(
  p_user_id uuid,
  p_campaign_id uuid,
  p_name text,
  p_description text,
  p_source_payload jsonb default '{}'::jsonb
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
    select 1 from public.app_campaign_members m
    where m.campaign_id = p_campaign_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin', 'editor')
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;
  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nombre invalido';
  end if;

  update public.app_campaigns
  set name = trim(p_name),
      description = coalesce(p_description, ''),
      source_payload = coalesce(p_source_payload, '{}'::jsonb)
  where id = p_campaign_id;
end;
$$;

create or replace function public.update_campaign_story_for_user(
  p_user_id uuid,
  p_campaign_id uuid,
  p_description text,
  p_source_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.update_campaign_for_user(
    p_user_id,
    p_campaign_id,
    (select c.name from public.app_campaigns c where c.id = p_campaign_id),
    p_description,
    p_source_payload
  );
$$;

create or replace function public.delete_campaign_for_user(p_user_id uuid, p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_campaign_members m
    where m.campaign_id = p_campaign_id
      and m.user_id = p_user_id
      and m.role = 'owner'
  ) into allowed;

  if not allowed then
    raise exception 'Solo el propietario puede borrar esta campaña';
  end if;

  delete from public.app_campaigns where id = p_campaign_id;
end;
$$;

create or replace function public.list_campaign_members_for_user(p_user_id uuid, p_campaign_id uuid)
returns table(user_id uuid, email text, nickname text, role text, can_edit boolean, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, u.nickname, m.role, m.role in ('owner', 'admin', 'editor'), m.created_at
  from public.app_campaign_members requester
  join public.app_campaign_members m on m.campaign_id = requester.campaign_id
  join public.app_users u on u.id = m.user_id
  where requester.user_id = p_user_id
    and requester.campaign_id = p_campaign_id
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'editor' then 2 else 3 end, coalesce(u.nickname, u.email);
$$;

create or replace function public.set_campaign_member_role_for_user(
  p_user_id uuid,
  p_campaign_id uuid,
  p_target_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_role text;
  target_role text;
  normalized_role text;
begin
  normalized_role := lower(trim(coalesce(p_role, 'player')));
  if normalized_role not in ('admin', 'editor', 'player') then
    raise exception 'Rol invalido';
  end if;

  select role into requester_role
  from public.app_campaign_members
  where campaign_id = p_campaign_id and user_id = p_user_id;

  if requester_role not in ('owner', 'admin') then
    raise exception 'No autorizado';
  end if;

  select role into target_role
  from public.app_campaign_members
  where campaign_id = p_campaign_id and user_id = p_target_user_id;

  if target_role is null then
    raise exception 'Miembro no encontrado';
  end if;
  if target_role = 'owner' then
    raise exception 'No se puede cambiar el propietario';
  end if;

  update public.app_campaign_members
  set role = normalized_role
  where campaign_id = p_campaign_id and user_id = p_target_user_id;
end;
$$;

create or replace function public.list_campaign_journal_entries_for_user(p_user_id uuid, p_campaign_id uuid)
returns table(
  id uuid,
  campaign_id uuid,
  title text,
  session_date date,
  blocks jsonb,
  source_payload jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select e.id, e.campaign_id, e.title, e.session_date, e.blocks, e.source_payload, e.created_by, e.updated_by, e.created_at, e.updated_at
  from public.app_campaign_journal_entries e
  join public.app_campaign_members m on m.campaign_id = e.campaign_id and m.user_id = p_user_id
  where e.campaign_id = p_campaign_id
  order by e.session_date desc nulls last, e.created_at desc;
$$;

create or replace function public.upsert_campaign_journal_entry_for_user(
  p_user_id uuid,
  p_campaign_id uuid,
  p_entry_id uuid,
  p_title text,
  p_session_date date,
  p_blocks jsonb,
  p_source_payload jsonb default '{}'::jsonb
)
returns table(id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  next_id uuid;
begin
  select exists(
    select 1 from public.app_campaign_members m
    where m.campaign_id = p_campaign_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin', 'editor')
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  if trim(coalesce(p_title, '')) = '' then
    raise exception 'Pon un titulo a la bitacora';
  end if;

  if p_entry_id is null then
    insert into public.app_campaign_journal_entries(campaign_id, title, session_date, blocks, source_payload, created_by, updated_by)
    values (p_campaign_id, trim(p_title), p_session_date, coalesce(p_blocks, '[]'::jsonb), coalesce(p_source_payload, '{}'::jsonb), p_user_id, p_user_id)
    returning app_campaign_journal_entries.id into next_id;
  else
    update public.app_campaign_journal_entries
    set title = trim(p_title),
        session_date = p_session_date,
        blocks = coalesce(p_blocks, '[]'::jsonb),
        source_payload = coalesce(p_source_payload, '{}'::jsonb),
        updated_by = p_user_id,
        updated_at = now()
    where app_campaign_journal_entries.id = p_entry_id
      and app_campaign_journal_entries.campaign_id = p_campaign_id
    returning app_campaign_journal_entries.id into next_id;

    if next_id is null then
      raise exception 'Bitacora no encontrada';
    end if;
  end if;

  return query select next_id;
end;
$$;

create or replace function public.delete_campaign_journal_entry_for_user(p_user_id uuid, p_campaign_id uuid, p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
begin
  select exists(
    select 1 from public.app_campaign_members m
    where m.campaign_id = p_campaign_id
      and m.user_id = p_user_id
      and m.role in ('owner', 'admin', 'editor')
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  delete from public.app_campaign_journal_entries
  where id = p_entry_id and campaign_id = p_campaign_id;
end;
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
  ammunition jsonb,
  inventory jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'name' then s.profile_overrides->>'name' else c.name end,
    c.join_code,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'class_name' then nullif(s.profile_overrides->>'class_name', '') else p.class_name end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'level' then nullif(s.profile_overrides->>'level', '')::int else p.level end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'race' then nullif(s.profile_overrides->>'race', '') else p.race end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'background' then nullif(s.profile_overrides->>'background', '') else p.background end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'hp' then nullif(s.profile_overrides->>'hp', '')::int else p.hp end,
    coalesce(s.current_hp, p.current_hp, case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'hp' then nullif(s.profile_overrides->>'hp', '')::int else p.hp end, 0),
    coalesce(s.temp_hp, p.temp_hp, 0),
    coalesce(s.shields, p.shields, 0),
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'ac' then nullif(s.profile_overrides->>'ac', '')::int else p.ac end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'speed' then nullif(s.profile_overrides->>'speed', '')::int else p.speed end,
    case when coalesce(s.profile_overrides, '{}'::jsonb) ? 'notes' then s.profile_overrides->>'notes' else p.notes end,
    coalesce(p.source_payload, '{}'::jsonb) || coalesce(s.source_payload_overrides, '{}'::jsonb),
    coalesce(s.spell_slots_spent, '{}'::jsonb),
    coalesce(s.ammunition, '{"visible": false, "entries": []}'::jsonb),
    coalesce(s.inventory, '{"entries": []}'::jsonb)
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

  insert into public.app_character_user_state(character_id, user_id, current_hp, temp_hp, shields, profile_overrides)
  values (
    p_character_id,
    p_user_id,
    greatest(coalesce(p_current_hp, p_hp, 0), 0),
    greatest(coalesce(p_temp_hp, 0), 0),
    greatest(coalesce(p_shields, 0), 0),
    jsonb_build_object(
      'name', coalesce(p_name, ''),
      'class_name', coalesce(p_class_name, ''),
      'level', p_level,
      'race', coalesce(p_race, ''),
      'background', coalesce(p_background, ''),
      'hp', p_hp,
      'ac', p_ac,
      'speed', p_speed,
      'notes', coalesce(p_notes, '')
    )
  )
  on conflict (character_id, user_id) do update set
    current_hp = excluded.current_hp,
    temp_hp = excluded.temp_hp,
    shields = excluded.shields,
    profile_overrides = excluded.profile_overrides,
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

  insert into public.app_character_user_state(character_id, user_id, source_payload_overrides)
  values (p_character_id, p_user_id, coalesce(p_source_payload, '{}'::jsonb))
  on conflict (character_id, user_id) do update set
    source_payload_overrides = excluded.source_payload_overrides,
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
  select * into character_row from public.app_characters c where c.join_code = upper(trim(p_code));
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
  select c.id, coalesce(s.profile_overrides->>'name', c.name), c.join_code, c.created_at
  from public.app_character_members m
  join public.app_characters c on c.id = m.character_id
  left join public.app_character_user_state s on s.character_id = c.id and s.user_id = p_user_id
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
  select c.id, coalesce(s.profile_overrides->>'name', c.name), c.join_code, c.created_at
  from public.app_character_members m
  join public.app_characters c on c.id = m.character_id
  left join public.app_character_user_state s on s.character_id = c.id and s.user_id = p_user_id
  where m.user_id = p_user_id
  order by c.created_at desc;
$$;

create or replace function public.list_hidden_characters_for_user(p_user_id uuid)
returns table(id uuid, name text, join_code text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select c.id, coalesce(s.profile_overrides->>'name', c.name), c.join_code, c.created_at
  from public.app_character_members m
  join public.app_characters c on c.id = m.character_id
  left join public.app_character_user_state s on s.character_id = c.id and s.user_id = p_user_id
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

create or replace function public.sync_character_base_from_payload(
  p_user_id uuid,
  p_character_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed boolean;
  parsed_name text;
  parsed_source jsonb;
begin
  select exists(
    select 1 from public.app_character_members m
    where m.character_id = p_character_id and m.user_id = p_user_id
  ) into allowed;

  if not allowed then
    raise exception 'No autorizado';
  end if;

  parsed_name := coalesce(
    nullif(trim(p_payload->>'name'), ''),
    nullif(trim(p_payload->>'character_name'), ''),
    nullif(trim(p_payload->>'nombre'), '')
  );
  parsed_source := coalesce(p_payload->'source_payload', p_payload, '{}'::jsonb);

  update public.app_characters
  set name = coalesce(parsed_name, name)
  where id = p_character_id;

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
    p_character_id,
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
    parsed_source
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
end;
$$;

create or replace function public.update_character_inventory_for_user(
  p_user_id uuid,
  p_character_id uuid,
  p_inventory jsonb
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

  insert into public.app_character_user_state(character_id, user_id, inventory)
  values (p_character_id, p_user_id, coalesce(p_inventory, '{"entries": []}'::jsonb))
  on conflict (character_id, user_id) do update set
    inventory = excluded.inventory,
    updated_at = now();
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
grant execute on function public.get_campaign_detail_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.update_campaign_for_user(uuid, uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.update_campaign_story_for_user(uuid, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.delete_campaign_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.list_campaign_members_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.set_campaign_member_role_for_user(uuid, uuid, uuid, text) to anon, authenticated;
grant execute on function public.list_campaign_journal_entries_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.upsert_campaign_journal_entry_for_user(uuid, uuid, uuid, text, date, jsonb, jsonb) to anon, authenticated;
grant execute on function public.delete_campaign_journal_entry_for_user(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.create_character_for_user(uuid, text) to anon, authenticated;
grant execute on function public.join_character_by_code(uuid, text) to anon, authenticated;
grant execute on function public.list_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.list_all_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.list_hidden_characters_for_user(uuid) to anon, authenticated;
grant execute on function public.set_character_visibility_for_user(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.update_character_spell_slots_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.update_character_ammunition_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.update_character_inventory_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.sync_character_base_from_payload(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.import_character_from_payload(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_character_detail_for_user(uuid, uuid) to anon, authenticated;
grant execute on function public.update_character_detail_for_user(uuid, uuid, text, text, int, text, text, int, int, int, int, int, int, text) to anon, authenticated;
grant execute on function public.update_character_source_payload_for_user(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.delete_character_for_user(uuid, uuid) to anon, authenticated;

create table if not exists public.app_status_effects (
  id text primary key,
  name text not null,
  category text not null default 'estado',
  source text not null default '5e 2014',
  description text not null default '',
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_character_active_statuses (
  character_id uuid not null references public.app_characters(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  status_id text not null references public.app_status_effects(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  primary key (character_id, user_id, status_id)
);

alter table public.app_status_effects enable row level security;
alter table public.app_character_active_statuses enable row level security;

drop policy if exists "no direct app_status_effects" on public.app_status_effects;
drop policy if exists "no direct app_character_active_statuses" on public.app_character_active_statuses;
create policy "no direct app_status_effects" on public.app_status_effects for all using (false) with check (false);
create policy "no direct app_character_active_statuses" on public.app_character_active_statuses for all using (false) with check (false);

insert into public.app_status_effects(id, name, category, source, description, rules) values
('cegado','Cegado','Condición','5e 2014 / Nivel20','No puedes ver; fallas pruebas que dependan de la vista. Tus ataques tienen desventaja y los ataques contra ti tienen ventaja.','{"attack_disadvantage":true,"incoming_attack_advantage":true}'::jsonb),
('hechizado','Hechizado','Condición','5e 2014 / Nivel20','No puedes atacar al encantador ni elegirlo como objetivo de efectos dañinos; el encantador tiene ventaja en pruebas sociales contra ti.','{}'::jsonb),
('ensordecido','Ensordecido','Condición','5e 2014 / Nivel20','No puedes oír y fallas pruebas que dependan del oído.','{}'::jsonb),
('asustado','Asustado','Condición','5e 2014 / Nivel20','Tienes desventaja en pruebas y ataques mientras la fuente del miedo esté a la vista; no puedes acercarte voluntariamente a ella.','{"attack_disadvantage_note":"Contra la fuente del miedo si está a la vista"}'::jsonb),
('agarrado','Agarrado','Condición','5e 2014 / Nivel20','Tu velocidad pasa a 0. Termina si quien te agarra queda incapacitado o sales de su alcance.','{"speed_set":0}'::jsonb),
('incapacitado','Incapacitado','Condición','5e 2014 / Nivel20','No puedes realizar acciones ni reacciones.','{}'::jsonb),
('invisible','Invisible','Condición','5e 2014 / Nivel20','No se te puede ver sin magia o sentidos especiales. Tus ataques tienen ventaja y los ataques contra ti tienen desventaja.','{"attack_advantage":true,"incoming_attack_disadvantage":true}'::jsonb),
('paralizado','Paralizado','Condición','5e 2014 / Nivel20','Estás incapacitado, no puedes moverte ni hablar; fallas salvaciones de Fuerza y Destreza. Ataques contra ti tienen ventaja y los impactos cuerpo a cuerpo cercanos son críticos.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('petrificado','Petrificado','Condición','5e 2014 / Nivel20','Transformado en sustancia sólida; incapacitado, no puedes moverte ni hablar. Resistencia a todo daño y fallas salvaciones de Fuerza y Destreza.','{"speed_set":0,"incoming_attack_advantage":true,"resistance_note":"Resistencia a todo daño"}'::jsonb),
('envenenado','Envenenado','Condición','5e 2014 / Nivel20','Tienes desventaja en tiradas de ataque y pruebas de característica.','{"attack_disadvantage":true,"ability_check_disadvantage":true}'::jsonb),
('derribado','Derribado','Condición','5e 2014 / Nivel20','Solo puedes moverte arrastrándote hasta levantarte. Tus ataques tienen desventaja; ataques cuerpo a cuerpo cercanos contra ti tienen ventaja y a distancia tienen desventaja.','{"attack_disadvantage":true,"incoming_melee_advantage":true,"incoming_ranged_disadvantage":true}'::jsonb),
('apresado','Apresado','Condición','5e 2014 / Nivel20','Tu velocidad pasa a 0, tus ataques tienen desventaja y los ataques contra ti tienen ventaja; tienes desventaja en salvaciones de Destreza.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('aturdido','Aturdido','Condición','5e 2014 / Nivel20','Estás incapacitado, no puedes moverte y solo puedes hablar entrecortadamente. Fallas salvaciones de Fuerza y Destreza; ataques contra ti tienen ventaja.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('inconsciente','Inconsciente','Condición','5e 2014 / Nivel20','Estás incapacitado, no puedes moverte ni hablar, caes derribado y sueltas lo que lleves. Ataques contra ti tienen ventaja y los impactos cercanos son críticos.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('agotamiento-1','Agotamiento 1','Condición','5e 2014 / Nivel20','Nivel 1: desventaja en pruebas de característica.','{"ability_check_disadvantage":true}'::jsonb),
('agotamiento-2','Agotamiento 2','Condición','5e 2014 / Nivel20','Nivel 2: velocidad reducida a la mitad.','{"speed_multiplier":0.5}'::jsonb),
('agotamiento-3','Agotamiento 3','Condición','5e 2014 / Nivel20','Nivel 3: desventaja en ataques y tiradas de salvación.','{"attack_disadvantage":true,"saving_throw_disadvantage":true}'::jsonb),
('agotamiento-4','Agotamiento 4','Condición','5e 2014 / Nivel20','Nivel 4: puntos de golpe máximos reducidos a la mitad.','{"hp_max_multiplier":0.5}'::jsonb),
('agotamiento-5','Agotamiento 5','Condición','5e 2014 / Nivel20','Nivel 5: velocidad reducida a 0.','{"speed_set":0}'::jsonb),
('bendecido','Bendecido','Conjuro/Efecto','5e 2014 / Nivel20','Añade 1d4 a ataques y tiradas de salvación mientras dure Bendición.','{"attack_bonus_die":"1d4","saving_throw_bonus_die":"1d4"}'::jsonb),
('perdicion','Perdición','Conjuro/Efecto','5e 2014 / Nivel20','Resta 1d4 a ataques y tiradas de salvación mientras dure Perdición.','{"attack_penalty_die":"1d4","saving_throw_penalty_die":"1d4"}'::jsonb),
('escudo-de-fe','Escudo de fe','Conjuro/Efecto','5e 2014 / Nivel20','Obtienes +2 a la CA mientras dure el conjuro.','{"ac_delta":2}'::jsonb),
('escudo-conjuro','Escudo','Conjuro/Efecto','5e 2014 / Nivel20','Hasta el inicio de tu siguiente turno obtienes +5 a la CA, incluido contra el ataque desencadenante.','{"ac_delta":5}'::jsonb),
('acelerado','Acelerado','Conjuro/Efecto','5e 2014 / Nivel20','Duplicas velocidad, +2 CA, ventaja en salvaciones de Destreza y una acción adicional limitada.','{"ac_delta":2,"speed_multiplier":2,"dex_save_advantage":true}'::jsonb),
('ralentizado','Ralentizado','Conjuro/Efecto','5e 2014 / Nivel20','Velocidad reducida a la mitad, -2 CA y salvaciones de Destreza, y limitaciones de acciones/reacciones.','{"ac_delta":-2,"speed_multiplier":0.5,"dex_save_delta":-2}'::jsonb),
('fuego-feerico','Fuego feérico','Conjuro/Efecto','5e 2014 / Nivel20','No puedes beneficiarte de invisibilidad y ataques contra ti tienen ventaja si el atacante puede verte.','{"incoming_attack_advantage":true}'::jsonb),
('proteccion-bien-mal','Protección contra el bien y el mal','Conjuro/Efecto','5e 2014 / Nivel20','Ciertos tipos de criaturas tienen desventaja al atacarte y no pueden hechizarte, asustarte o poseerte.','{"incoming_attack_disadvantage_note":"Aberraciones, celestiales, elementales, feéricos, infernales y muertos vivientes"}'::jsonb),
('ayuda','Ayuda','Conjuro/Efecto','5e 2014 / Nivel20','Aumenta temporalmente los PG máximos y actuales. Ajusta la cantidad en notas/HP si hace falta.','{}'::jsonb),
('volando','Volando','Movimiento','Nivel20 / 5e 2014','Tienes velocidad de vuelo o estás en vuelo por efecto mágico.','{}'::jsonb),
('concentracion','Concentración','Seguimiento','Nivel20 / 5e 2014','Recordatorio de concentración activa; al recibir daño debes salvar Constitución.','{}'::jsonb),
('inspiracion-bardica','Inspiración bárdica','Recurso/Efecto','5e 2014 / Nivel20','Puedes añadir el dado de inspiración a una prueba, ataque o salvación según el rasgo.','{}'::jsonb),
('furia','Furia','Rasgo/Efecto','5e 2014 / Nivel20','Ventaja en pruebas/salvaciones de Fuerza, bonus al daño cuerpo a cuerpo con Fuerza y resistencia a daño contundente, perforante y cortante.','{"resistance_note":"Contundente, perforante y cortante"}'::jsonb),
('maleficio','Maleficio','Conjuro/Efecto','5e 2014 / Nivel20','Daño extra y desventaja en pruebas de una característica elegida.','{}'::jsonb),
('marca-del-cazador','Marca del cazador','Conjuro/Efecto','5e 2014 / Nivel20','Daño extra al objetivo marcado y ventaja en rastreo/percepción para encontrarlo.','{}'::jsonb),
('agrandado','Agrandado','Conjuro/Efecto','5e 2014 / Tasha compatible','Tamaño aumentado; ventaja en pruebas/salvaciones de Fuerza y daño extra según el conjuro.','{}'::jsonb),
('reducido','Reducido','Conjuro/Efecto','5e 2014 / Tasha compatible','Tamaño reducido; desventaja en pruebas/salvaciones de Fuerza y daño reducido según el conjuro.','{}'::jsonb),
('piel-petrea','Piel pétrea','Conjuro/Efecto','5e 2014 / Nivel20','Resistencia a daño contundente, perforante y cortante no mágico.','{"resistance_note":"Contundente, perforante y cortante no mágico"}'::jsonb),
('levitando','Levitando','Conjuro/Efecto','5e 2014 / Nivel20','Te mueves verticalmente por levitación; el movimiento horizontal depende de empujarte o tirar de objetos/superficies.','{}'::jsonb),
('mente-astillada','Mente astillada','Conjuro/Efecto','Tasha','Resta 1d4 a la siguiente tirada de salvación del objetivo antes del final de tu siguiente turno.','{"saving_throw_penalty_die":"1d4"}'::jsonb),
('patron-protector','Protección de marca','Efecto','Eberron compatible','Estado genérico para efectos defensivos de marcas/rasgos de Eberron; ajusta el detalle según el rasgo concreto.','{}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  source = excluded.source,
  description = excluded.description,
  rules = excluded.rules;

create or replace function public.search_status_effects(p_query text default '')
returns table(id text, name text, category text, source text, description text, rules jsonb)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.category, s.source, s.description, s.rules
  from public.app_status_effects s
  where coalesce(trim(p_query), '') = ''
    or lower(s.name || ' ' || s.category || ' ' || s.source || ' ' || s.description) like '%' || lower(trim(p_query)) || '%'
  order by case when lower(s.name) = lower(trim(p_query)) then 0 else 1 end, s.category, s.name;
$$;

create or replace function public.list_active_status_effects_for_character(p_user_id uuid, p_character_id uuid)
returns table(id text, name text, category text, source text, description text, rules jsonb, note text, created_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.category, s.source, s.description, s.rules, a.note, a.created_at
  from public.app_character_active_statuses a
  join public.app_status_effects s on s.id = a.status_id
  join public.app_character_members m on m.character_id = a.character_id and m.user_id = p_user_id
  where a.user_id = p_user_id
    and a.character_id = p_character_id
  order by a.created_at desc, s.name;
$$;

create or replace function public.set_character_status_effect_active(
  p_user_id uuid,
  p_character_id uuid,
  p_status_id text,
  p_active boolean,
  p_note text default ''
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

  if coalesce(p_active, false) then
    insert into public.app_character_active_statuses(character_id, user_id, status_id, note)
    values (p_character_id, p_user_id, p_status_id, coalesce(p_note, ''))
    on conflict (character_id, user_id, status_id) do update set
      note = excluded.note,
      created_at = now();
  else
    delete from public.app_character_active_statuses
    where character_id = p_character_id
      and user_id = p_user_id
      and status_id = p_status_id;
  end if;
end;
$$;

grant execute on function public.search_status_effects(text) to anon, authenticated;
grant execute on function public.list_active_status_effects_for_character(uuid, uuid) to anon, authenticated;
grant execute on function public.set_character_status_effect_active(uuid, uuid, text, boolean, text) to anon, authenticated;

-- Estados y efectos adicionales de conjuros/rasgos que aplican condiciones o modificadores frecuentes.
insert into public.app_status_effects(id, name, category, source, description, rules) values
('dormido','Dormido','Conjuro/Efecto','5e 2014 / Nivel20','Estado típico de Dormir u otros efectos: la criatura queda inconsciente hasta que recibe daño, alguien la despierta o termina el efecto.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('ceguera-sordera-cegado','Ceguera/Sordera: cegado','Conjuro/Efecto','5e 2014 / Nivel20','Efecto del conjuro Ceguera/Sordera eligiendo cegar: no puedes ver, tus ataques tienen desventaja y los ataques contra ti tienen ventaja.','{"attack_disadvantage":true,"incoming_attack_advantage":true}'::jsonb),
('ceguera-sordera-ensordecido','Ceguera/Sordera: ensordecido','Conjuro/Efecto','5e 2014 / Nivel20','Efecto del conjuro Ceguera/Sordera eligiendo ensordecer: no puedes oír y fallas pruebas que dependan del oído.','{}'::jsonb),
('inmovilizar-persona','Inmovilizar persona','Conjuro/Efecto','5e 2014 / Nivel20','Humanoide paralizado por el conjuro. Incapacitado, velocidad 0, ataques contra él con ventaja y críticos cuerpo a cuerpo cercanos.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('inmovilizar-monstruo','Inmovilizar monstruo','Conjuro/Efecto','5e 2014 / Nivel20','Criatura paralizada por el conjuro. Incapacitada, velocidad 0, ataques contra ella con ventaja y críticos cuerpo a cuerpo cercanos.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('risa-horrible-tasha','Risa horrible de Tasha','Conjuro/Efecto','5e 2014 / Tasha / Nivel20','La criatura cae derribada, queda incapacitada y no puede levantarse mientras dure el efecto.','{"speed_set":0,"incoming_melee_advantage":true,"incoming_ranged_disadvantage":true}'::jsonb),
('grasa-derribado','Grasa: derribado','Conjuro/Efecto','5e 2014 / Nivel20','Criatura derribada por Grasa u otro terreno resbaladizo.','{"attack_disadvantage":true,"incoming_melee_advantage":true,"incoming_ranged_disadvantage":true}'::jsonb),
('telarana-apresado','Telaraña: apresado','Conjuro/Efecto','5e 2014 / Nivel20','Criatura apresada/restringida por Telaraña hasta liberarse o destruir las telarañas.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('enmarañar-apresado','Enmarañar: apresado','Conjuro/Efecto','5e 2014 / Nivel20','Criatura apresada por plantas hasta superar la prueba o terminar el efecto.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('tentaculos-negros-apresado','Tentáculos negros: apresado','Conjuro/Efecto','5e 2014 / Nivel20','Criatura apresada por Tentáculos negros de Evard.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('agarre-terroso-apresado','Agarre terroso: apresado','Conjuro/Efecto','Xanathar / Nivel20 compatible','Criatura apresada por una mano de tierra o efecto similar.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('miedo-conjuro','Miedo','Conjuro/Efecto','5e 2014 / Nivel20','Criatura asustada por el conjuro Miedo; suele soltar objetos y alejarse mientras vea la fuente.','{"attack_disadvantage_note":"Mientras la fuente sea visible"}'::jsonb),
('causar-miedo','Causar miedo','Conjuro/Efecto','Xanathar / Nivel20 compatible','Criatura asustada por Causar miedo.','{"attack_disadvantage_note":"Mientras la fuente sea visible"}'::jsonb),
('patron-hipnotico','Patrón hipnótico','Conjuro/Efecto','5e 2014 / Nivel20','Criatura hechizada, incapacitada y con velocidad 0 hasta que reciba daño o alguien la despierte con una acción.','{"speed_set":0}'::jsonb),
('confusion','Confusión','Conjuro/Efecto','5e 2014 / Nivel20','La criatura actúa de forma aleatoria según la tabla del conjuro Confusión.','{}'::jsonb),
('desterrado','Desterrado','Conjuro/Efecto','5e 2014 / Nivel20','Criatura enviada a otro plano o semiplano; normalmente queda fuera del combate hasta terminar el efecto.','{"speed_set":0}'::jsonb),
('polimorfado','Polimorfado','Conjuro/Efecto','5e 2014 / Nivel20','La criatura usa las estadísticas de la nueva forma mientras dure Polimorfar. Ajusta HP/CA/velocidad manualmente si hace falta.','{}'::jsonb),
('forma-gaseosa','Forma gaseosa','Conjuro/Efecto','5e 2014 / Nivel20','Forma nebulosa: resistencia a daño no mágico, ventaja en salvaciones de Fuerza/Destreza/Constitución y movimiento especial.','{"resistance_note":"Daño no mágico mientras dure Forma gaseosa"}'::jsonb),
('dominado','Dominado','Conjuro/Efecto','5e 2014 / Nivel20','Dominado por Dominar persona/bestia/monstruo; quedas hechizado y puedes recibir órdenes telepáticas.','{}'::jsonb),
('hechizar-persona','Hechizar persona','Conjuro/Efecto','5e 2014 / Nivel20','Hechizado por el lanzador; no puedes atacarlo y el lanzador tiene ventaja social contra ti.','{}'::jsonb),
('sugestion','Sugestión','Conjuro/Efecto','5e 2014 / Nivel20','Bajo una sugestión mágica razonable. No modifica números por defecto, pero es importante en combate/rol.','{}'::jsonb),
('corona-de-locura','Corona de locura','Conjuro/Efecto','5e 2014 / Nivel20','Hechizado por Corona de locura; puede obligarte a usar tu acción para atacar a una criatura cercana.','{}'::jsonb),
('compulsion','Compulsión','Conjuro/Efecto','5e 2014 / Nivel20','Movimiento forzado por Compulsión en la dirección elegida por el lanzador.','{}'::jsonb),
('asesino-fantasmagorico','Asesino fantasmal','Conjuro/Efecto','5e 2014 / Nivel20','Criatura asustada por una ilusión aterradora y sufre daño psíquico según el conjuro.','{"attack_disadvantage_note":"Mientras la fuente sea visible"}'::jsonb),
('mal-de-ojo-dormido','Mal de ojo: dormido','Conjuro/Efecto','5e 2014 / Nivel20','Opción de Mal de ojo que deja inconsciente/dormido hasta que despierte según el conjuro.','{"speed_set":0,"incoming_attack_advantage":true}'::jsonb),
('mal-de-ojo-asustado','Mal de ojo: asustado','Conjuro/Efecto','5e 2014 / Nivel20','Opción de Mal de ojo que deja asustado.','{"attack_disadvantage_note":"Mientras la fuente sea visible"}'::jsonb),
('mal-de-ojo-enfermo','Mal de ojo: enfermo','Conjuro/Efecto','5e 2014 / Nivel20','Opción de Mal de ojo que causa desventaja en ataques y pruebas de característica.','{"attack_disadvantage":true,"ability_check_disadvantage":true}'::jsonb),
('contagio','Contagio','Conjuro/Efecto','5e 2014 / Nivel20','Afectado por Contagio o enfermedad mágica. Ajusta la enfermedad concreta en notas.','{}'::jsonb),
('rayo-enfermedad-envenenado','Rayo de enfermedad: envenenado','Conjuro/Efecto','5e 2014 / Nivel20','Envenenado hasta el final del siguiente turno por Rayo de enfermedad.','{"attack_disadvantage":true,"ability_check_disadvantage":true}'::jsonb),
('nube-apestosa','Nube apestosa','Conjuro/Efecto','5e 2014 / Nivel20','Puede hacer perder la acción por náuseas si falla la salvación.','{}'::jsonb),
('carne-a-piedra-restringido','Carne a piedra: restringido','Conjuro/Efecto','5e 2014 / Nivel20','Durante el proceso de petrificación, la criatura queda apresada/restringida.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('carne-a-piedra-petrificado','Carne a piedra: petrificado','Conjuro/Efecto','5e 2014 / Nivel20','La criatura queda petrificada si falla las salvaciones suficientes.','{"speed_set":0,"incoming_attack_advantage":true,"resistance_note":"Resistencia a todo daño"}'::jsonb),
('prision-mental','Prisión mental','Conjuro/Efecto','Xanathar / Nivel20 compatible','Criatura apresada por una ilusión si falla la salvación; puede recibir daño al atravesarla.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('muro-fuerza-atrapado','Muro de fuerza: atrapado','Conjuro/Efecto','5e 2014 / Nivel20','Atrapado o separado por Muro de fuerza. No cambia stats numéricas pero afecta posicionamiento.','{}'::jsonb),
('jaula-fuerza-atrapado','Jaula de fuerza: atrapado','Conjuro/Efecto','5e 2014 / Nivel20','Atrapado por Jaula de fuerza. No cambia stats numéricas pero afecta posicionamiento y opciones.','{}'::jsonb),
('laberinto','Laberinto','Conjuro/Efecto','5e 2014 / Nivel20','Enviado a un semiplano laberíntico; fuera del campo hasta escapar.','{"speed_set":0}'::jsonb),
('silenciado','Silenciado','Conjuro/Efecto','5e 2014 / Nivel20','Dentro de Silencio o bajo un efecto que impide sonido; no puedes lanzar conjuros con componente verbal.','{}'::jsonb),
('oscuridad-magica','Oscuridad mágica','Conjuro/Efecto','5e 2014 / Nivel20','Zona de oscuridad mágica; criaturas sin visión adecuada tratan la zona como muy oscura/cegada para objetivos dentro.','{}'::jsonb),
('nube-niebla','Nube de niebla','Conjuro/Efecto','5e 2014 / Nivel20','Zona muy oscurecida; afecta visión y ataques según línea de visión.','{}'::jsonb),
('trepar-aracnido','Trepar cual arácnido','Conjuro/Efecto','5e 2014 / Nivel20','Puedes moverte por paredes y techos; recordatorio de movimiento especial.','{}'::jsonb),
('caida-pluma','Caída de pluma','Conjuro/Efecto','5e 2014 / Nivel20','Caes lentamente y no recibes daño de caída mientras dure.','{}'::jsonb),
('paso-brumoso','Paso brumoso usado','Conjuro/Efecto','5e 2014 / Nivel20','Recordatorio de teletransporte breve ya usado/activo si necesitas marcarlo.','{}'::jsonb),
('santuario','Santuario','Conjuro/Efecto','5e 2014 / Nivel20','Quien te ataque debe superar salvación de Sabiduría o elegir otro objetivo/perder el ataque.','{}'::jsonb),
('proteccion-energia','Protección contra energía','Conjuro/Efecto','5e 2014 / Nivel20','Resistencia a un tipo de daño elegido: ácido, frío, fuego, relámpago o trueno.','{"resistance_note":"Tipo elegido por Protección contra energía"}'::jsonb),
('absorber-elementos','Absorber elementos','Conjuro/Efecto','Xanathar / Nivel20 compatible','Resistencia temporal al tipo de daño desencadenante y daño extra en el siguiente ataque cuerpo a cuerpo.','{"resistance_note":"Tipo desencadenante hasta tu siguiente turno"}'::jsonb),
('manto-del-cruzado','Manto del cruzado','Conjuro/Efecto','5e 2014 / Nivel20','Aliados cercanos infligen 1d4 radiante extra con ataques de arma.','{"damage_bonus_die":"1d4 radiante"}'::jsonb),
('arma-magica','Arma mágica','Conjuro/Efecto','5e 2014 / Nivel20','Arma obtiene bonus mágico a ataque y daño según nivel de lanzamiento.','{}'::jsonb),
('favor-divino','Favor divino','Conjuro/Efecto','5e 2014 / Nivel20','Tus ataques de arma infligen 1d4 radiante extra.','{"damage_bonus_die":"1d4 radiante"}'::jsonb),
('castigo-iracundo','Castigo iracundo','Conjuro/Efecto','5e 2014 / Nivel20','El objetivo puede quedar asustado tras el impacto.','{"attack_disadvantage_note":"Si está asustado y ve la fuente"}'::jsonb),
('castigo-segador','Castigo cegador','Conjuro/Efecto','5e 2014 / Nivel20','El objetivo puede quedar cegado tras el impacto.','{"attack_disadvantage":true,"incoming_attack_advantage":true}'::jsonb),
('castigo-estremecedor','Castigo estremecedor','Conjuro/Efecto','5e 2014 / Nivel20','El objetivo puede quedar derribado tras el impacto.','{"attack_disadvantage":true,"incoming_melee_advantage":true,"incoming_ranged_disadvantage":true}'::jsonb),
('castigo-desterrador','Castigo desterrador','Conjuro/Efecto','5e 2014 / Nivel20','El objetivo puede quedar desterrado si baja de cierto umbral de PG.','{"speed_set":0}'::jsonb),
('restriccion-generica','Restringido por efecto','Genérico','Nivel20 / extensiones','Estado genérico para cualquier rasgo, trampa o conjuro que deje a una criatura restringida/apresada.','{"speed_set":0,"attack_disadvantage":true,"incoming_attack_advantage":true,"dex_save_disadvantage":true}'::jsonb),
('marcado-generico','Marcado','Genérico','Nivel20 / extensiones','Objetivo marcado por un rasgo, conjuro o mecánica de campaña. Ajusta el efecto en notas si aplica.','{}'::jsonb),
('vulnerable-generico','Vulnerable','Genérico','Nivel20 / extensiones','Vulnerabilidad temporal a un tipo de daño. Indica el tipo en notas.','{}'::jsonb),
('resistente-generico','Resistente','Genérico','Nivel20 / extensiones','Resistencia temporal a un tipo de daño. Indica el tipo en notas.','{"resistance_note":"Tipo indicado en notas"}'::jsonb),
('inmune-generico','Inmune','Genérico','Nivel20 / extensiones','Inmunidad temporal a un tipo de daño o condición. Indica el tipo en notas.','{}'::jsonb)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  source = excluded.source,
  description = excluded.description,
  rules = excluded.rules;

-- Session-authorized RPC wrappers. Apply after existing functions.
create or replace function public.require_app_user_id(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid;
begin
  select s.user_id into v_user_id
  from public.app_sessions s
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;
  if v_user_id is null then raise exception 'Sesion invalida'; end if;
  return v_user_id;
end;
$$;

create or replace function public.list_campaigns_for_session(p_token text) returns table(id uuid,name text,join_code text,created_at timestamptz,role text,can_edit boolean,description text,source_payload jsonb) language sql security definer set search_path=public as $$ select * from public.list_campaigns_for_user(public.require_app_user_id(p_token)); $$;
create or replace function public.create_campaign_for_session(p_token text,p_name text) returns table(id uuid,name text,join_code text) language sql security definer set search_path=public as $$ select * from public.create_campaign_for_user(public.require_app_user_id(p_token),p_name); $$;
create or replace function public.join_campaign_by_code_for_session(p_token text,p_code text) returns table(id uuid,name text,join_code text) language sql security definer set search_path=public as $$ select * from public.join_campaign_by_code(public.require_app_user_id(p_token),p_code); $$;
create or replace function public.get_campaign_detail_for_session(p_token text,p_campaign_id uuid) returns table(id uuid,name text,join_code text,created_at timestamptz,role text,can_edit boolean,description text,source_payload jsonb) language sql security definer set search_path=public as $$ select * from public.get_campaign_detail_for_user(public.require_app_user_id(p_token),p_campaign_id); $$;
create or replace function public.update_campaign_for_session(p_token text,p_campaign_id uuid,p_name text,p_description text,p_source_payload jsonb default '{}'::jsonb) returns void language sql security definer set search_path=public as $$ select public.update_campaign_for_user(public.require_app_user_id(p_token),p_campaign_id,p_name,p_description,p_source_payload); $$;
create or replace function public.update_campaign_story_for_session(p_token text,p_campaign_id uuid,p_description text,p_source_payload jsonb default '{}'::jsonb) returns void language sql security definer set search_path=public as $$ select public.update_campaign_story_for_user(public.require_app_user_id(p_token),p_campaign_id,p_description,p_source_payload); $$;
create or replace function public.delete_campaign_for_session(p_token text,p_campaign_id uuid) returns void language sql security definer set search_path=public as $$ select public.delete_campaign_for_user(public.require_app_user_id(p_token),p_campaign_id); $$;
create or replace function public.list_campaign_members_for_session(p_token text,p_campaign_id uuid) returns table(user_id uuid,email text,nickname text,role text,can_edit boolean,created_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_campaign_members_for_user(public.require_app_user_id(p_token),p_campaign_id); $$;
create or replace function public.set_campaign_member_role_for_session(p_token text,p_campaign_id uuid,p_target_user_id uuid,p_role text) returns void language sql security definer set search_path=public as $$ select public.set_campaign_member_role_for_user(public.require_app_user_id(p_token),p_campaign_id,p_target_user_id,p_role); $$;
create or replace function public.list_campaign_journal_entries_for_session(p_token text,p_campaign_id uuid) returns table(id uuid,campaign_id uuid,title text,session_date date,blocks jsonb,source_payload jsonb,created_by uuid,updated_by uuid,created_at timestamptz,updated_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_campaign_journal_entries_for_user(public.require_app_user_id(p_token),p_campaign_id); $$;
create or replace function public.upsert_campaign_journal_entry_for_session(p_token text,p_campaign_id uuid,p_entry_id uuid,p_title text,p_session_date date,p_blocks jsonb,p_source_payload jsonb default '{}'::jsonb) returns table(id uuid) language sql security definer set search_path=public as $$ select * from public.upsert_campaign_journal_entry_for_user(public.require_app_user_id(p_token),p_campaign_id,p_entry_id,p_title,p_session_date,p_blocks,p_source_payload); $$;
create or replace function public.delete_campaign_journal_entry_for_session(p_token text,p_campaign_id uuid,p_entry_id uuid) returns void language sql security definer set search_path=public as $$ select public.delete_campaign_journal_entry_for_user(public.require_app_user_id(p_token),p_campaign_id,p_entry_id); $$;

create or replace function public.list_characters_for_session(p_token text) returns table(id uuid,name text,join_code text,created_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_characters_for_user(public.require_app_user_id(p_token)); $$;
create or replace function public.list_all_characters_for_session(p_token text) returns table(id uuid,name text,join_code text,created_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_all_characters_for_user(public.require_app_user_id(p_token)); $$;
create or replace function public.list_hidden_characters_for_session(p_token text) returns table(id uuid,name text,join_code text,created_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_hidden_characters_for_user(public.require_app_user_id(p_token)); $$;
create or replace function public.create_character_for_session(p_token text,p_name text) returns table(id uuid,name text,join_code text) language sql security definer set search_path=public as $$ select * from public.create_character_for_user(public.require_app_user_id(p_token),p_name); $$;
create or replace function public.join_character_by_code_for_session(p_token text,p_code text) returns table(id uuid,name text,join_code text) language sql security definer set search_path=public as $$ select * from public.join_character_by_code(public.require_app_user_id(p_token),p_code); $$;
create or replace function public.import_character_from_payload_for_session(p_token text,p_payload jsonb) returns table(id uuid,name text,join_code text) language sql security definer set search_path=public as $$ select * from public.import_character_from_payload(public.require_app_user_id(p_token),p_payload); $$;
create or replace function public.sync_character_base_from_payload_for_session(p_token text,p_character_id uuid,p_payload jsonb) returns void language sql security definer set search_path=public as $$ select public.sync_character_base_from_payload(public.require_app_user_id(p_token),p_character_id,p_payload); $$;
create or replace function public.get_character_detail_for_session(p_token text,p_character_id uuid) returns table(id uuid,name text,join_code text,class_name text,level int,race text,background text,hp int,current_hp int,temp_hp int,shields int,ac int,speed int,notes text,source_payload jsonb,spell_slots_spent jsonb,ammunition jsonb,inventory jsonb) language sql security definer set search_path=public as $$ select * from public.get_character_detail_for_user(public.require_app_user_id(p_token),p_character_id); $$;
create or replace function public.update_character_detail_for_session(p_token text,p_character_id uuid,p_name text,p_class_name text,p_level int,p_race text,p_background text,p_hp int,p_current_hp int,p_temp_hp int,p_shields int,p_ac int,p_speed int,p_notes text) returns void language sql security definer set search_path=public as $$ select public.update_character_detail_for_user(public.require_app_user_id(p_token),p_character_id,p_name,p_class_name,p_level,p_race,p_background,p_hp,p_current_hp,p_temp_hp,p_shields,p_ac,p_speed,p_notes); $$;
create or replace function public.delete_character_for_session(p_token text,p_character_id uuid) returns void language sql security definer set search_path=public as $$ select public.delete_character_for_user(public.require_app_user_id(p_token),p_character_id); $$;
create or replace function public.update_character_source_payload_for_session(p_token text,p_character_id uuid,p_source_payload jsonb) returns void language sql security definer set search_path=public as $$ select public.update_character_source_payload_for_user(public.require_app_user_id(p_token),p_character_id,p_source_payload); $$;
create or replace function public.set_character_visibility_for_session(p_token text,p_character_id uuid,p_is_visible boolean) returns void language sql security definer set search_path=public as $$ select public.set_character_visibility_for_user(public.require_app_user_id(p_token),p_character_id,p_is_visible); $$;
create or replace function public.update_character_inventory_for_session(p_token text,p_character_id uuid,p_inventory jsonb) returns void language sql security definer set search_path=public as $$ select public.update_character_inventory_for_user(public.require_app_user_id(p_token),p_character_id,p_inventory); $$;
create or replace function public.update_character_spell_slots_for_session(p_token text,p_character_id uuid,p_spell_slots_spent jsonb) returns void language sql security definer set search_path=public as $$ select public.update_character_spell_slots_for_user(public.require_app_user_id(p_token),p_character_id,p_spell_slots_spent); $$;
create or replace function public.update_character_ammunition_for_session(p_token text,p_character_id uuid,p_ammunition jsonb) returns void language sql security definer set search_path=public as $$ select public.update_character_ammunition_for_user(public.require_app_user_id(p_token),p_character_id,p_ammunition); $$;
create or replace function public.list_active_status_effects_for_session(p_token text,p_character_id uuid) returns table(id text,name text,category text,source text,description text,rules jsonb,note text,created_at timestamptz) language sql security definer set search_path=public as $$ select * from public.list_active_status_effects_for_character(public.require_app_user_id(p_token),p_character_id); $$;
create or replace function public.set_character_status_effect_active_for_session(p_token text,p_character_id uuid,p_status_id text,p_active boolean,p_note text default '') returns void language sql security definer set search_path=public as $$ select public.set_character_status_effect_active(public.require_app_user_id(p_token),p_character_id,p_status_id,p_active,p_note); $$;

-- Do not expose user_id-based RPCs to browser clients. Use *_for_session wrappers instead.
revoke execute on function public.create_campaign_for_user(uuid, text) from anon, authenticated, public;
revoke execute on function public.join_campaign_by_code(uuid, text) from anon, authenticated, public;
revoke execute on function public.list_campaigns_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.get_campaign_detail_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.update_campaign_for_user(uuid, uuid, text, text, jsonb) from anon, authenticated, public;
revoke execute on function public.update_campaign_story_for_user(uuid, uuid, text, jsonb) from anon, authenticated, public;
revoke execute on function public.delete_campaign_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.list_campaign_members_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.set_campaign_member_role_for_user(uuid, uuid, uuid, text) from anon, authenticated, public;
revoke execute on function public.list_campaign_journal_entries_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.upsert_campaign_journal_entry_for_user(uuid, uuid, uuid, text, date, jsonb, jsonb) from anon, authenticated, public;
revoke execute on function public.delete_campaign_journal_entry_for_user(uuid, uuid, uuid) from anon, authenticated, public;
revoke execute on function public.create_character_for_user(uuid, text) from anon, authenticated, public;
revoke execute on function public.join_character_by_code(uuid, text) from anon, authenticated, public;
revoke execute on function public.list_characters_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.list_all_characters_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.list_hidden_characters_for_user(uuid) from anon, authenticated, public;
revoke execute on function public.set_character_visibility_for_user(uuid, uuid, boolean) from anon, authenticated, public;
revoke execute on function public.update_character_spell_slots_for_user(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.update_character_ammunition_for_user(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.update_character_inventory_for_user(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.sync_character_base_from_payload(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.import_character_from_payload(uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.get_character_detail_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.update_character_detail_for_user(uuid, uuid, text, text, int, text, text, int, int, int, int, int, int, text) from anon, authenticated, public;
revoke execute on function public.update_character_source_payload_for_user(uuid, uuid, jsonb) from anon, authenticated, public;
revoke execute on function public.delete_character_for_user(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.list_active_status_effects_for_character(uuid, uuid) from anon, authenticated, public;
revoke execute on function public.set_character_status_effect_active(uuid, uuid, text, boolean, text) from anon, authenticated, public;

grant execute on function public.require_app_user_id(text) to anon, authenticated;
grant execute on function public.list_campaigns_for_session(text) to anon, authenticated;
grant execute on function public.create_campaign_for_session(text,text) to anon, authenticated;
grant execute on function public.join_campaign_by_code_for_session(text,text) to anon, authenticated;
grant execute on function public.get_campaign_detail_for_session(text,uuid) to anon, authenticated;
grant execute on function public.update_campaign_for_session(text,uuid,text,text,jsonb) to anon, authenticated;
grant execute on function public.update_campaign_story_for_session(text,uuid,text,jsonb) to anon, authenticated;
grant execute on function public.delete_campaign_for_session(text,uuid) to anon, authenticated;
grant execute on function public.list_campaign_members_for_session(text,uuid) to anon, authenticated;
grant execute on function public.set_campaign_member_role_for_session(text,uuid,uuid,text) to anon, authenticated;
grant execute on function public.list_campaign_journal_entries_for_session(text,uuid) to anon, authenticated;
grant execute on function public.upsert_campaign_journal_entry_for_session(text,uuid,uuid,text,date,jsonb,jsonb) to anon, authenticated;
grant execute on function public.delete_campaign_journal_entry_for_session(text,uuid,uuid) to anon, authenticated;
grant execute on function public.list_characters_for_session(text) to anon, authenticated;
grant execute on function public.list_all_characters_for_session(text) to anon, authenticated;
grant execute on function public.list_hidden_characters_for_session(text) to anon, authenticated;
grant execute on function public.create_character_for_session(text,text) to anon, authenticated;
grant execute on function public.join_character_by_code_for_session(text,text) to anon, authenticated;
grant execute on function public.import_character_from_payload_for_session(text,jsonb) to anon, authenticated;
grant execute on function public.sync_character_base_from_payload_for_session(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.get_character_detail_for_session(text,uuid) to anon, authenticated;
grant execute on function public.update_character_detail_for_session(text,uuid,text,text,int,text,text,int,int,int,int,int,int,text) to anon, authenticated;
grant execute on function public.delete_character_for_session(text,uuid) to anon, authenticated;
grant execute on function public.update_character_source_payload_for_session(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.set_character_visibility_for_session(text,uuid,boolean) to anon, authenticated;
grant execute on function public.update_character_inventory_for_session(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.update_character_spell_slots_for_session(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.update_character_ammunition_for_session(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.list_active_status_effects_for_session(text,uuid) to anon, authenticated;
grant execute on function public.set_character_status_effect_active_for_session(text,uuid,text,boolean,text) to anon, authenticated;
