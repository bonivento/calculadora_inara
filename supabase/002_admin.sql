-- Calculadora Inara by Alma — migración 002: panel de administración
-- Ejecútala DESPUÉS de schema.sql (Supabase → SQL Editor → New query → Run). Es seguro volver a ejecutarla.
--
-- Añade: rol «lector» (solo lectura), activar/desactivar miembros, protección del último admin,
--        último acceso por miembro (solo admins) y registro de actividad (auditoría, solo admins).
--
-- Roles:  admin  → todo + gestionar equipo
--         miembro (Editor) → ver y editar insumos, recetas y ajustes
--         lector → solo ver (puede calcular precios, no guardar)

-- ---------- Columnas y roles ----------
alter table public.miembros add column if not exists activo boolean not null default true;

alter table public.miembros drop constraint if exists miembros_rol_check;
alter table public.miembros add constraint miembros_rol_check check (rol in ('admin','miembro','lector'));
alter table public.invitaciones drop constraint if exists invitaciones_rol_check;
alter table public.invitaciones add constraint invitaciones_rol_check check (rol in ('admin','miembro','lector'));

-- ---------- Funciones de permiso ----------
create or replace function public.es_miembro(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where equipo_id = e and user_id = auth.uid() and activo);
$$;

create or replace function public.es_admin(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where equipo_id = e and user_id = auth.uid() and activo and rol = 'admin');
$$;

create or replace function public.puede_editar(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.miembros where equipo_id = e and user_id = auth.uid() and activo and rol in ('admin','miembro'));
$$;
grant execute on function public.puede_editar(uuid) to authenticated;

-- ---------- Políticas de datos: todos leen, solo admin/editor escriben ----------
do $$
declare t text;
begin
  foreach t in array array['insumos','recetas','ajustes'] loop
    execute format('drop policy if exists %I on public.%I', t || '_equipo', t);
    execute format('drop policy if exists %I on public.%I', t || '_ver', t);
    execute format('drop policy if exists %I on public.%I', t || '_insertar', t);
    execute format('drop policy if exists %I on public.%I', t || '_actualizar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.es_miembro(equipo_id))', t || '_ver', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.puede_editar(equipo_id))', t || '_insertar', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.puede_editar(equipo_id)) with check (public.puede_editar(equipo_id))', t || '_actualizar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.puede_editar(equipo_id))', t || '_borrar', t);
  end loop;
end $$;

-- ---------- No dejar el equipo sin administrador ----------
create or replace function public.proteger_ultimo_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.rol = 'admin' and old.activo then
    if tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo then
      if not exists (select 1 from public.miembros
                     where equipo_id = old.equipo_id and rol = 'admin' and activo and user_id <> old.user_id) then
        raise exception 'ultimo_admin';
      end if;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

drop trigger if exists trg_ultimo_admin on public.miembros;
create trigger trg_ultimo_admin before update or delete on public.miembros
  for each row execute function public.proteger_ultimo_admin();

-- ---------- mi_equipo(): ahora rechaza cuentas desactivadas ----------
create or replace function public.mi_equipo() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  m record;
  inv record;
  eq uuid;
begin
  if uid is null then raise exception 'no_autenticada'; end if;

  select * into m from public.miembros where user_id = uid order by created_at limit 1;
  if found then
    if not m.activo then raise exception 'cuenta_desactivada'; end if;
    return m.equipo_id;
  end if;

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
end $$;

-- ---------- Lista de miembros con último acceso (solo admins) ----------
create or replace function public.equipo_miembros(e uuid)
returns table (user_id uuid, email text, rol text, activo boolean, creado timestamptz, ultimo_acceso timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.es_admin(e) then raise exception 'solo_admin'; end if;
  return query
    select m.user_id, m.email, m.rol, m.activo, m.created_at, u.last_sign_in_at
    from public.miembros m join auth.users u on u.id = m.user_id
    where m.equipo_id = e
    order by m.created_at;
end $$;
revoke all on function public.equipo_miembros(uuid) from public, anon;
grant execute on function public.equipo_miembros(uuid) to authenticated;

-- ---------- Registro de actividad ----------
create table if not exists public.auditoria (
  id         bigint generated always as identity primary key,
  equipo_id  uuid not null,
  tabla      text not null,
  op         text not null,
  fila       text,
  resumen    text,
  user_id    uuid,
  email      text,
  at         timestamptz not null default now()
);
create index if not exists auditoria_equipo_at on public.auditoria (equipo_id, at desc);
alter table public.auditoria enable row level security;
drop policy if exists auditoria_admin on public.auditoria;
create policy auditoria_admin on public.auditoria for select to authenticated using (public.es_admin(equipo_id));

create or replace function public.auditar() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; v_fila text; v_resumen text;
begin
  if tg_op = 'DELETE' then r := old; else r := new; end if;

  if tg_table_name = 'miembros' then
    if tg_op = 'UPDATE' and old.rol = new.rol and old.activo = new.activo then return new; end if;
    v_fila := r.email;
    v_resumen := r.rol || case when r.activo then '' else ' (desactivado)' end;
  elsif tg_table_name = 'ajustes' then
    if tg_op = 'UPDATE' then
      if old.data is not distinct from new.data then return new; end if;
    end if;
    v_fila := 'ajustes'; v_resumen := 'Ajustes del negocio';
  else
    if tg_op = 'UPDATE' then
      if old.data is not distinct from new.data then return new; end if;
    end if;
    v_fila := r.id; v_resumen := coalesce(r.data ->> 'nombre', r.id);
  end if;

  insert into public.auditoria (equipo_id, tabla, op, fila, resumen, user_id, email)
  values (r.equipo_id, tg_table_name, tg_op, v_fila, v_resumen, auth.uid(), lower(coalesce(auth.jwt() ->> 'email', '')));

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['insumos','recetas','ajustes','miembros'] loop
    execute format('drop trigger if exists trg_auditar on public.%I', t);
    execute format('create trigger trg_auditar after insert or update or delete on public.%I for each row execute function public.auditar()', t);
  end loop;
end $$;
