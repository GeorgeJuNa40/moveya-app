-- ============================================================================
-- Move yA — Reserva manual del staff (admin/gerente/recepción por un alumno)
-- ----------------------------------------------------------------------------
-- Amplía book_session(p_session_id, p_spot, p_user) para permitir que el STAFF
-- (admin/gerente/recepción) reserve una clase a nombre de CUALQUIER alumno de su
-- estudio — p. ej. cuando el alumno lo pide por teléfono/WhatsApp o justo tras un
-- registro manual. Antes solo se permitía reservar para uno mismo o para un
-- familiar gestionado. El resto de la lógica (cupo, créditos, lugar, vigencia) no
-- cambia, así que una reserva del staff respeta las mismas reglas que la del alumno.
--
-- auth_role() mapea BRANCH_ADMIN/OPERATOR -> STUDIO_ADMIN, así que los tres roles
-- del staff pueden usarlo. user_in_my_studio() asegura que el alumno sea del estudio.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================
create or replace function public.book_session(p_session_id text, p_spot text, p_user text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor text := auth.uid()::text;
  v_uid text := coalesce(p_user, auth.uid()::text);
  v_studio text; v_cap int; v_tpl text; v_spots jsonb; v_has_spots boolean;
  v_taken int; v_pkg text; v_booking text; v_exist_id text; v_exist_st text;
begin
  if v_actor is null then raise exception 'NOT_ALLOWED'; end if;
  -- Puede reservar: uno mismo, un familiar que gestiona, o —si es STAFF— cualquier
  -- alumno de su estudio.
  if v_uid <> v_actor
     and not public.auth_manages(v_uid)
     and not (public.auth_role() = 'STUDIO_ADMIN' and public.user_in_my_studio(v_uid)) then
    raise exception 'NOT_ALLOWED';
  end if;

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
    if p_spot is null or not exists (
      select 1 from jsonb_array_elements(v_spots) e
      where (case when jsonb_typeof(e) = 'string' then e #>> '{}' else e->>'label' end) = p_spot
    ) then raise exception 'BAD_SPOT'; end if;
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
end $function$;
revoke execute on function public.book_session(text, text, text) from public, anon;
grant execute on function public.book_session(text, text, text) to authenticated;
