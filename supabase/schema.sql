-- ============================================================
-- Respira — schema do Supabase.
-- Rode uma vez no SQL Editor do projeto (Supabase → SQL Editor → New query).
--
-- O que fica guardado:
--   profiles      → o que os amigos do grupo podem ver (nickname e resumo do progresso)
--   user_data     → backup completo dos registros; só o próprio dono lê e escreve
--   groups        → grupos de amigos, com código de convite
--   group_members → quem está em cada grupo
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  nickname text not null check (char_length(nickname) between 3 and 20 and nickname !~ '\s'),
  streak_base timestamptz,          -- último cigarro (ou início do app): o tempo sem fumar conta daqui
  best_streak_ms bigint not null default 0,
  cravings_won int not null default 0,
  avg7 real not null default 0,     -- média de cigarros/dia nos últimos 7 dias
  updated_at timestamptz not null default now()
);
create unique index profiles_nickname_key on public.profiles (lower(nickname));

create table public.user_data (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  code text not null unique,
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- ---------- Funções auxiliares (security definer evita recursão nas regras RLS) ----------

create function public.is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = gid and user_id = auth.uid());
$$;

create function public.shares_group(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members a
    join group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------- Regras de acesso (RLS) ----------

alter table public.profiles enable row level security;
alter table public.user_data enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

create policy "ver o próprio perfil e o dos colegas de grupo" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_group(id));
create policy "criar o próprio perfil" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "editar o próprio perfil" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "apagar o próprio perfil" on public.profiles
  for delete to authenticated using (id = auth.uid());

create policy "dono dos dados" on public.user_data
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "ver grupos de que participa" on public.groups
  for select to authenticated using (public.is_group_member(id));

create policy "ver membros dos seus grupos" on public.group_members
  for select to authenticated using (public.is_group_member(group_id));
create policy "sair de um grupo" on public.group_members
  for delete to authenticated using (user_id = auth.uid());

-- Criar e entrar em grupos só pelas funções abaixo (validam o código do convite).

create function public.create_group(p_name text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  g groups;
  v_code text;
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'no_profile'; end if;
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, code, created_by) values (trim(p_name), v_code, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end;
$$;

create function public.join_group(p_code text) returns public.groups
language plpgsql security definer set search_path = public as $$
declare
  g groups;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'no_profile'; end if;
  select * into g from groups where code = upper(trim(p_code));
  if g.id is null then raise exception 'invalid_code'; end if;
  if (select count(*) from group_members where group_id = g.id) >= 50 then raise exception 'group_full'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end;
$$;

revoke execute on function public.create_group(text), public.join_group(text) from public, anon;
grant execute on function public.create_group(text), public.join_group(text) to authenticated;
