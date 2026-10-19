-- ============================================================================
-- Move yA — Lista de espera (notify-to-grab) en reservas
-- ----------------------------------------------------------------------------
-- Cuando una clase está llena, el alumno se une a la lista de espera (status
-- WAITLIST, sin consumir crédito). Al liberarse un lugar (cancelación), la app
-- llama a la Edge Function notify-waitlist, que avisa por push al PRIMERO de la
-- fila. El que llegue primero reserva. Aditivo y seguro.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run.
-- IMPORTANTE: el ALTER TYPE debe correr ANTES que las funciones (Postgres no
-- permite usar un valor de enum recién agregado en la misma transacción). Si
-- corres todo junto y marca error en el valor del enum, córrelo en dos pasos:
-- primero el ALTER TYPE, luego el resto.
-- ============================================================================
alter type public.booking_status add value if not exists 'WAITLIST';

-- (Corre esto DESPUÉS del ALTER de arriba) ----------------------------------
-- book_session: WAITLIST no ocupa cupo y se puede convertir a reserva.
create or replace function public.book_session(p_session_id text, p_spot text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_studio text; v_cap int; v_tpl text; v_spots jsonb; v_has_spots boolean;
  v_taken int; v_pkg text; v_booking text; v_exist_id text; v_exist_st text;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;

  select cs.studio_id, cs.capacity, cs.template_id into v_studio, v_cap, v_tpl
  from public.class_sessions cs where cs.id = p_session_id for update;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;

  select ct.spots into v_spots from public.class_templates ct where ct.id = v_tpl;
  v_has_spots := v_spots is not null and jsonb_typeof(v_spots) = 'array' and jsonb_array_length(v_spots) > 0;

  select id, status into v_exist_id, v_exist_st from public.bookings
  where user_id = v_uid and session_id = p_session_id;
  if v_exist_id is not null and v_exist_st not in ('CANCELED','WAITLIST') then raise exception 'ALREADY'; end if;

  select count(*) into v_taken from public.bookings
  where session_id = p_session_id and status not in ('CANCELED','WAITLIST');
  if v_taken >= v_cap then raise exception 'FULL'; end if;

  if v_has_spots then
    if p_spot is null or not (v_spots ? p_spot) then raise exception 'BAD_SPOT'; end if;
    if exists (select 1 from public.bookings
               where session_id = p_session_id and status not in ('CANCELED','WAITLIST') and spot = p_spot) then
      raise exception 'SPOT_TAKEN';
    end if;
  end if;

  select id into v_pkg from public.user_packages
  where user_id = v_uid and active = true and credits_used < credits_total and expires_at > now()
  order by expires_at asc limit 1 for update;
  if v_pkg is null then raise exception 'NO_CREDITS'; end if;

  if v_exist_id is not null then
    update public.bookings
      set status = 'RESERVED', user_package_id = v_pkg,
          spot = case when v_has_spots then p_spot else null end
      where id = v_exist_id;
    v_booking := v_exist_id;
  else
    v_booking := gen_random_uuid()::text;
    insert into public.bookings (id, user_id, session_id, user_package_id, status, spot)
      values (v_booking, v_uid, p_session_id, v_pkg, 'RESERVED',
              case when v_has_spots then p_spot else null end);
  end if;

  update public.user_packages set credits_used = credits_used + 1 where id = v_pkg;

  return json_build_object('booking_id', v_booking, 'user_package_id', v_pkg, 'status', 'RESERVED',
                           'spot', case when v_has_spots then p_spot else null end);
end;
$$;
grant execute on function public.book_session(text, text) to authenticated;

-- Primero de la lista de espera de una sesión (lo usa también la Edge Function).
create or replace function public.first_waitlister(p_session_id text)
returns text language sql stable security definer set search_path = public as $$
  select b.user_id from public.bookings b
  join public.class_sessions cs on cs.id = b.session_id
  where b.session_id = p_session_id and b.status = 'WAITLIST'
    and cs.studio_id = public.auth_studio_id()
  order by b.created_at asc
  limit 1
$$;
revoke all on function public.first_waitlister(text) from anon;
grant execute on function public.first_waitlister(text) to authenticated;
-- ============================================================================
-- Además, despliega la Edge Function notify-waitlist (ya hecha por el equipo).
-- ============================================================================
