create extension if not exists "pgcrypto";

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  nickname text,
  password_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.app_users add column if not exists nickname text;

create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;

drop policy if exists "no direct app_users" on public.app_users;
create policy "no direct app_users" on public.app_users for all using (false) with check (false);

drop policy if exists "no direct app_sessions" on public.app_sessions;
create policy "no direct app_sessions" on public.app_sessions for all using (false) with check (false);

create or replace function public.create_app_user(p_email text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text;
  plain_token text;
  user_uuid uuid;
begin
  clean_email := lower(trim(p_email));
  if clean_email = '' or length(p_password) < 6 then
    raise exception 'Datos invalidos';
  end if;

  insert into public.app_users(email, password_hash)
  values (clean_email, extensions.crypt(p_password, extensions.gen_salt('bf')))
  returning id into user_uuid;

  plain_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions(user_id, token_hash, expires_at)
  values (
    user_uuid,
    encode(extensions.digest(plain_token, 'sha256'), 'hex'),
    now() + interval '30 days'
  );

  return plain_token;
exception
  when unique_violation then
    raise exception 'El email ya existe';
end;
$$;

create or replace function public.login_app_user(p_email text, p_password text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text;
  user_row public.app_users%rowtype;
  plain_token text;
begin
  clean_email := lower(trim(p_email));

  select * into user_row
  from public.app_users
  where email = clean_email;

  if user_row.id is null then
    raise exception 'Invalid login credentials';
  end if;

  if user_row.password_hash <> extensions.crypt(p_password, user_row.password_hash) then
    raise exception 'Invalid login credentials';
  end if;

  plain_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.app_sessions(user_id, token_hash, expires_at)
  values (
    user_row.id,
    encode(extensions.digest(plain_token, 'sha256'), 'hex'),
    now() + interval '30 days'
  );

  return plain_token;
end;
$$;

drop function if exists public.get_user_by_session(text);

create or replace function public.get_user_by_session(p_token text)
returns table(user_id uuid, email text, nickname text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, u.nickname
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;
$$;

drop function if exists public.update_app_user_nickname(text, text);

create or replace function public.update_app_user_nickname(p_token text, p_nickname text)
returns table(user_id uuid, email text, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  clean_nickname text;
begin
  clean_nickname := nullif(trim(p_nickname), '');

  select s.user_id into v_user_id
  from public.app_sessions s
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_user_id is null then
    raise exception 'Sesion invalida';
  end if;

  update public.app_users
  set nickname = clean_nickname
  where id = v_user_id;

  return query
  select u.id, u.email, u.nickname
  from public.app_users u
  where u.id = v_user_id;
end;
$$;

create or replace function public.change_app_user_password(p_token text, p_current_password text, p_new_password text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
begin
  if length(trim(p_new_password)) < 6 then
    raise exception 'La nueva password debe tener al menos 6 caracteres';
  end if;

  select u.* into v_user
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  where s.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_user.id is null then
    raise exception 'Sesion invalida';
  end if;

  if v_user.password_hash <> extensions.crypt(p_current_password, v_user.password_hash) then
    raise exception 'Password actual incorrecta';
  end if;

  update public.app_users
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where id = v_user.id;

  update public.app_sessions
  set revoked_at = now()
  where user_id = v_user.id
    and token_hash <> encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;
end;
$$;

create or replace function public.logout_app_session(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.app_sessions
  set revoked_at = now()
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and revoked_at is null;
$$;

grant execute on function public.create_app_user(text, text) to anon, authenticated;
grant execute on function public.login_app_user(text, text) to anon, authenticated;
grant execute on function public.get_user_by_session(text) to anon, authenticated;
grant execute on function public.logout_app_session(text) to anon, authenticated;
grant execute on function public.update_app_user_nickname(text, text) to anon, authenticated;
grant execute on function public.change_app_user_password(text, text, text) to anon, authenticated;
