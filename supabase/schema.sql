-- NoteD&DCharacter schema for Supabase (D&D 5e 2014)
create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  system text not null default 'dnd5e-2014',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_members (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('dm', 'co_dm', 'player')),
  created_at timestamptz not null default now(),
  primary key (campaign_id, user_id)
);

create table if not exists public.characters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  owner_user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  class_name text not null,
  level int not null default 1 check (level between 1 and 20),
  max_hp int not null default 1,
  current_hp int not null default 1,
  temp_hp int not null default 0,
  speed int not null default 30,
  passive_perception int,
  passive_investigation int,
  passive_insight int,
  traits text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.character_currency (
  character_id uuid primary key references public.characters(id) on delete cascade,
  gp int not null default 0,
  sp int not null default 0,
  cp int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete cascade,
  is_group_item boolean not null default false,
  name text not null,
  quantity int not null default 1,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.condition_definitions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  source text not null default 'dnd5eapi',
  description text,
  effect_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.character_conditions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  condition_id uuid references public.condition_definitions(id) on delete set null,
  custom_name text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.character_actions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  action_type text not null check (action_type in ('action', 'bonus_action', 'reaction')),
  name text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.spells (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  level int not null,
  classes text[] not null default '{}',
  description text,
  source text not null default 'dnd5eapi'
);

create table if not exists public.dice_rolls (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  rolled_by uuid not null references public.profiles(id) on delete restrict,
  formula text not null,
  dice jsonb not null default '[]'::jsonb,
  modifier int not null default 0,
  total int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.session_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text,
  body text not null,
  event_date date not null default current_date,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);

create or replace function public.is_campaign_member(c_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = c_id and cm.user_id = auth.uid()
  );
$$;

create or replace function public.is_campaign_dm(c_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.campaign_members cm
    where cm.campaign_id = c_id and cm.user_id = auth.uid() and cm.role in ('dm', 'co_dm')
  );
$$;

alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_members enable row level security;
alter table public.characters enable row level security;
alter table public.character_currency enable row level security;
alter table public.inventory_items enable row level security;
alter table public.condition_definitions enable row level security;
alter table public.character_conditions enable row level security;
alter table public.character_actions enable row level security;
alter table public.spells enable row level security;
alter table public.dice_rolls enable row level security;
alter table public.session_logs enable row level security;

drop policy if exists "profiles self" on public.profiles;
create policy "profiles self" on public.profiles
for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "campaign member read" on public.campaigns;
create policy "campaign member read" on public.campaigns
for select using (public.is_campaign_member(id));

drop policy if exists "campaign create" on public.campaigns;
create policy "campaign create" on public.campaigns
for insert with check (created_by = auth.uid());

drop policy if exists "campaign dm update" on public.campaigns;
create policy "campaign dm update" on public.campaigns
for update using (public.is_campaign_dm(id));

drop policy if exists "campaign members read" on public.campaign_members;
create policy "campaign members read" on public.campaign_members
for select using (public.is_campaign_member(campaign_id));

drop policy if exists "campaign dm manage members" on public.campaign_members;
create policy "campaign dm manage members" on public.campaign_members
for all using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));

drop policy if exists "members read characters" on public.characters;
create policy "members read characters" on public.characters
for select using (public.is_campaign_member(campaign_id));

drop policy if exists "owner dm manage characters" on public.characters;
create policy "owner dm manage characters" on public.characters
for all using (
  public.is_campaign_dm(campaign_id) or owner_user_id = auth.uid()
) with check (
  public.is_campaign_dm(campaign_id) or owner_user_id = auth.uid()
);

drop policy if exists "members read inventory" on public.inventory_items;
create policy "members read inventory" on public.inventory_items
for select using (public.is_campaign_member(campaign_id));

drop policy if exists "owner dm manage inventory" on public.inventory_items;
create policy "owner dm manage inventory" on public.inventory_items
for all using (
  public.is_campaign_dm(campaign_id) or exists (
    select 1 from public.characters c where c.id = character_id and c.owner_user_id = auth.uid()
  )
) with check (
  public.is_campaign_dm(campaign_id) or exists (
    select 1 from public.characters c where c.id = character_id and c.owner_user_id = auth.uid()
  )
);

drop policy if exists "members read spells" on public.spells;
create policy "members read spells" on public.spells
for select using (auth.uid() is not null);

drop policy if exists "members read dice" on public.dice_rolls;
create policy "members read dice" on public.dice_rolls
for select using (public.is_campaign_member(campaign_id));

drop policy if exists "members insert dice" on public.dice_rolls;
create policy "members insert dice" on public.dice_rolls
for insert with check (public.is_campaign_member(campaign_id) and rolled_by = auth.uid());

drop policy if exists "dm manage session logs" on public.session_logs;
create policy "dm manage session logs" on public.session_logs
for all using (public.is_campaign_dm(campaign_id)) with check (public.is_campaign_dm(campaign_id));
