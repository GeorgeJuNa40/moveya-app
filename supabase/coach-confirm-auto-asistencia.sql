-- ============================================================================
-- Move yA — Nómina coaches: asistentes AUTOMÁTICOS desde el pase de lista
-- ----------------------------------------------------------------------------
-- El coach ya no teclea asistentes. Nueva firma coach_confirm_class(session, fecha)
-- que calcula los asistentes solos = bookings con status ATTENDED de esa clase
-- (el pase de lista que el coach ya hace para las estrellas). El monto se sigue
-- sugiriendo desde coach_pay y lo ajusta el admin.
--
-- Nota: en clases fijas/recurrentes las reservas se limpian cada semana, así que
-- el conteo se "congela" al confirmar (idealmente el día de la clase). Si se
-- confirma muy tarde, el conteo puede salir en 0 y el admin lo ajusta.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- (Queda obsoleta la firma vieja coach_confirm_class(text,date,int); puedes
--  borrarla a mano con: drop function if exists public.coach_confirm_class(text, date, int);)
-- ============================================================================
create or replace function public.coach_confirm_class(p_session_id text, p_occurred_on date)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_studio text; v_coach text; v_tpl text; v_cap int; v_title text;
  v_att int; v_full boolean; v_amount numeric; v_id text;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;
  select cs.studio_id, cs.coach_id, cs.template_id, cs.capacity
    into v_studio, v_coach, v_tpl, v_cap
    from public.class_sessions cs where cs.id = p_session_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_coach is distinct from v_uid then raise exception 'NOT_ALLOWED'; end if;
  select name into v_title from public.class_templates where id = v_tpl;
  -- asistentes AUTOMÁTICOS: los que el coach marcó "Asistió" en el pase de lista.
  select count(*) into v_att from public.bookings
    where session_id = p_session_id and status = 'ATTENDED';
  v_full := v_cap > 0 and v_att >= v_cap;
  v_amount := public.coach_suggested_amount(v_uid, v_att, v_full);

  insert into public.class_logs
    (id, studio_id, coach_id, session_id, template_id, occurred_on, title, capacity, attendees, is_full, coach_confirmed_at, amount)
  values
    (gen_random_uuid()::text, v_studio, v_uid, p_session_id, v_tpl, p_occurred_on, v_title, v_cap, v_att, v_full, now(), v_amount)
  on conflict (coach_id, session_id, occurred_on) do update set
    attendees = v_att,
    is_full = v_full,
    title = excluded.title,
    capacity = excluded.capacity,
    coach_confirmed_at = now(),
    amount = case when class_logs.staff_confirmed_at is null then v_amount else class_logs.amount end
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.coach_confirm_class(text, date) from public, anon;
grant execute on function public.coach_confirm_class(text, date) to authenticated;
