-- ============================================================================
-- Move yA — Invitados a una clase (Clase de prueba / Acompañante 2x1)
-- ----------------------------------------------------------------------------
-- Permite al estudio agregar personas SIN cuenta a una clase, desde el
-- Calendario: una "clase de prueba" (con costo opcional) o un "acompañante 2x1"
-- (invitado de un alumno). Ocupan un lugar. Si luego se registran con el mismo
-- teléfono, se reconoce de dónde vienen (users.source).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================

-- 1) Tabla de invitados. Solo el personal del estudio (admin/coach) accede.
create table if not exists public.class_guests (
  id text primary key,
  studio_id text not null references public.studios(id) on delete cascade,
  session_id text not null references public.class_sessions(id) on delete cascade,
  name text not null,
  phone text,
  kind text not null default 'trial',            -- 'trial' | 'companion'
  cost numeric not null default 0,
  host_user_id text references public.users(id),  -- 2x1: alumno que invita
  created_at timestamptz not null default now()
);
alter table public.class_guests enable row level security;
drop policy if exists class_guests_staff on public.class_guests;
create policy class_guests_staff on public.class_guests
  for all
  using (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id)
  with check (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = studio_id);
create index if not exists class_guests_session_idx on public.class_guests(session_id);

-- 2) Origen del alumno: de dónde llegó ('trial' | 'companion' | null).
alter table public.users add column if not exists source text;

-- 3) Al registrarse, si el teléfono coincide con un invitado del estudio, marca
--    su origen. Se llama desde la app justo después del alta.
create or replace function public.claim_guest_source()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid text := auth.uid()::text;
  v_phone text; v_studio text; v_kind text; v_p10 text;
begin
  if v_uid is null then return null; end if;
  select phone, studio_id, source into v_phone, v_studio, v_kind from public.users where id = v_uid;
  if v_kind is not null then return v_kind; end if;
  v_p10 := right(regexp_replace(coalesce(v_phone,''), '\D', '', 'g'), 10);
  if v_p10 = '' then return null; end if;
  select kind into v_kind from public.class_guests
    where studio_id = v_studio
      and right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 10) = v_p10
    order by created_at desc limit 1;
  if v_kind is null then return null; end if;
  update public.users set source = v_kind where id = v_uid and source is null;
  return v_kind;
end $$;
grant execute on function public.claim_guest_source() to authenticated;

-- 4) El cupo (book_session) ahora cuenta reservas + invitados (evita sobrecupo).
--    Reemplaza la función de booking-rpc.sql agregando el conteo de invitados.
create or replace function public.book_session(p_session_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_studio text; v_cap int; v_taken int; v_guests int;
  v_pkg text; v_booking text; v_exist_id text; v_exist_st text;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;
  select studio_id, capacity into v_studio, v_cap from public.class_sessions where id = p_session_id for update;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;
  select id, status into v_exist_id, v_exist_st from public.bookings where user_id = v_uid and session_id = p_session_id;
  if v_exist_id is not null and v_exist_st <> 'CANCELED' then raise exception 'ALREADY'; end if;
  select count(*) into v_taken from public.bookings where session_id = p_session_id and status <> 'CANCELED';
  select count(*) into v_guests from public.class_guests where session_id = p_session_id;
  if (v_taken + v_guests) >= v_cap then raise exception 'FULL'; end if;
  select id into v_pkg from public.user_packages
    where user_id = v_uid and active = true and credits_used < credits_total and expires_at > now()
    order by expires_at asc limit 1 for update;
  if v_pkg is null then raise exception 'NO_CREDITS'; end if;
  if v_exist_id is not null then
    update public.bookings set status = 'RESERVED', user_package_id = v_pkg where id = v_exist_id;
    v_booking := v_exist_id;
  else
    v_booking := gen_random_uuid()::text;
    insert into public.bookings (id, user_id, session_id, user_package_id, status)
      values (v_booking, v_uid, p_session_id, v_pkg, 'RESERVED');
  end if;
  update public.user_packages set credits_used = credits_used + 1 where id = v_pkg;
  return json_build_object('booking_id', v_booking, 'user_package_id', v_pkg, 'status', 'RESERVED');
end $$;
grant execute on function public.book_session(text) to authenticated;

-- 5) Realtime para invitados (aparecen en vivo en el calendario del estudio).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='class_guests') then
    alter publication supabase_realtime add table public.class_guests;
  end if;
end $$;
alter table public.class_guests replica identity full;
-- ============================================================================
