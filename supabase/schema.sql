-- Calculadora Inara by Alma — esquema de Supabase
-- Pégalo completo en Supabase → SQL Editor → New query → Run. Es seguro volver a ejecutarlo.
--
-- Modelo: un EQUIPO comparte insumos, recetas y ajustes. Roles: admin | miembro.
--   · El PRIMER usuario que entra crea el equipo y queda como admin.
--   · Los demás solo pueden entrar si un admin los invitó antes por correo (tabla invitaciones).
--   · Cada fila queda protegida con RLS: solo ven/editan datos los miembros de ese equipo.

create extension if not exists pgcrypto;

-- ---------- Tablas ----------
create table if not exists public.equipos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null default 'Inara by Alma',
  creado_por  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.miembros (
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  rol         text not null default 'miembro' check (rol in ('admin','miembro')),
  created_at  timestamptz not null default now(),
  primary key (equipo_id, user_id)
);

create table if not exists public.invitaciones (
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  email       text not null,
  rol         text not null default 'miembro' check (rol in ('admin','miembro')),
  created_at  timestamptz not null default now(),
  primary key (equipo_id, email)
);

create table if not exists public.insumos (
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (equipo_id, id)
);

create table if not exists public.recetas (
  equipo_id   uuid not null references public.equipos(id) on delete cascade,
  id          text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (equipo_id, id)
);

create table if not exists public.ajustes (
  equipo_id   uuid primary key references public.equipos(id) on delete cascade,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);

-- ---------- Funciones auxiliares (security definer evita recursión en RLS) ----------
create or replace function public.es_miembro(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where equipo_id = e and user_id = auth.uid());
$$;

create or replace function public.es_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where equipo_id = e and user_id = auth.uid() and rol = 'admin');
$$;

-- Devuelve el equipo de la persona autenticada:
--   1) si ya es miembro → ese equipo
--   2) si tiene invitación por su correo → se une
--   3) si todavía no existe ningún equipo → crea el primero y queda como admin
--   4) si no → error 'sin_invitacion'
create or replace function public.mi_equipo() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  eq uuid;
  inv record;
begin
  if uid is null then raise exception 'no_autenticada'; end if;

  select equipo_id into eq from public.miembros where user_id = uid order by created_at limit 1;
  if eq is not null then return eq; end if;

  select * into inv from public.invitaciones where lower(email) = mail limit 1;
  if found then
    insert into public.miembros (equipo_id, user_id, email, rol) values (inv.equipo_id, uid, mail, inv.rol);
    delete from public.invitaciones where equipo_id = inv.equipo_id and lower(email) = mail;
    return inv.equipo_id;
  end if;

  if not exists (select 1 from public.equipos) then
    insert into public.equipos (creado_por) values (uid) returning id into eq;
    insert into public.miembros (equipo_id, user_id, email, rol) values (eq, uid, mail, 'admin');
    return eq;
  end if;

  raise exception 'sin_invitacion';
end;
$$;

revoke all on function public.mi_equipo() from public, anon;
grant execute on function public.mi_equipo() to authenticated;
grant execute on function public.es_miembro(uuid) to authenticated;
grant execute on function public.es_admin(uuid) to authenticated;

-- ---------- Seguridad por fila (RLS) ----------
alter table public.equipos      enable row level security;
alter table public.miembros     enable row level security;
alter table public.invitaciones enable row level security;
alter table public.insumos      enable row level security;
alter table public.recetas      enable row level security;
alter table public.ajustes      enable row level security;

drop policy if exists equipos_ver    on public.equipos;
drop policy if exists equipos_editar on public.equipos;
create policy equipos_ver    on public.equipos for select to authenticated using (public.es_miembro(id));
create policy equipos_editar on public.equipos for update to authenticated using (public.es_admin(id)) with check (public.es_admin(id));

drop policy if exists miembros_ver     on public.miembros;
drop policy if exists miembros_quitar  on public.miembros;
drop policy if exists miembros_rol     on public.miembros;
create policy miembros_ver    on public.miembros for select to authenticated using (public.es_miembro(equipo_id));
create policy miembros_quitar on public.miembros for delete to authenticated using (public.es_admin(equipo_id) or user_id = auth.uid());
create policy miembros_rol    on public.miembros for update to authenticated using (public.es_admin(equipo_id)) with check (public.es_admin(equipo_id));

drop policy if exists invitaciones_admin on public.invitaciones;
create policy invitaciones_admin on public.invitaciones for all to authenticated
  using (public.es_admin(equipo_id)) with check (public.es_admin(equipo_id));

drop policy if exists insumos_equipo on public.insumos;
create policy insumos_equipo on public.insumos for all to authenticated
  using (public.es_miembro(equipo_id)) with check (public.es_miembro(equipo_id));

drop policy if exists recetas_equipo on public.recetas;
create policy recetas_equipo on public.recetas for all to authenticated
  using (public.es_miembro(equipo_id)) with check (public.es_miembro(equipo_id));

drop policy if exists ajustes_equipo on public.ajustes;
create policy ajustes_equipo on public.ajustes for all to authenticated
  using (public.es_miembro(equipo_id)) with check (public.es_miembro(equipo_id));

-- ---------- Tiempo real (cambios del equipo en vivo) ----------
do $$
begin
  begin alter publication supabase_realtime add table public.insumos; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.recetas; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.ajustes; exception when duplicate_object then null; end;
end $$;
