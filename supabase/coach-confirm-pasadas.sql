-- ============================================================================
-- Move yA — Nómina coaches: el coach confirma clases PASADAS (semana pasada, etc.)
-- ----------------------------------------------------------------------------
-- Problema: la confirmación del coach vivía solo en su calendario (próximos 7
-- días), así que no podía confirmar clases ya pasadas. Solución: una lista propia
-- "Clases por confirmar" en su panel. Para alimentarla, ampliamos ensure_class_logs
-- para que el COACH también pueda generar SUS propias ocurrencias pendientes
-- (antes era solo para admin). Sigue acotado a su estudio y, para el coach, a sus
-- propias clases. La confirmación se hace con coach_confirm_class (ya existe).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================
create or replace function public.ensure_class_logs(p_from date, p_to date)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_uid    text := auth.uid()::text;
  v_role   text := public.auth_role();
  v_studio text := public.auth_studio_id();
  v_to     date := least(p_to, current_date);
  v_count  int := 0;
begin
  if v_uid is null or v_studio is null or p_from > v_to then return 0; end if;
  -- El staff (STUDIO_ADMIN) genera para todo el estudio; el coach solo sus clases.
  if v_role <> 'STUDIO_ADMIN' and v_role <> 'COACH' then raise exception 'NOT_ALLOWED'; end if;

  with days as (
    select d::date as day from generate_series(p_from, v_to, interval '1 day') d
  ),
  occ as (
    select cs.id as session_id, cs.coach_id, cs.template_id, cs.capacity, d.day,
           coalesce(ct.name, 'Clase') as title
    from public.class_sessions cs
    join days d on (
      case when cs.recurring
        then extract(dow from cs.starts_at) = extract(dow from d.day)
        else (cs.starts_at at time zone 'UTC')::date = d.day
      end
    )
    left join public.class_templates ct on ct.id = cs.template_id
    where cs.studio_id = v_studio
      and cs.coach_id is not null
      and (v_role = 'STUDIO_ADMIN' or cs.coach_id = v_uid)
  )
  insert into public.class_logs
    (id, studio_id, coach_id, session_id, template_id, occurred_on, title, capacity, attendees, is_full, amount)
  select gen_random_uuid()::text, v_studio, occ.coach_id, occ.session_id, occ.template_id,
         occ.day, occ.title, occ.capacity, 0, false, 0
  from occ
  on conflict (coach_id, session_id, occurred_on) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.ensure_class_logs(date, date) from public, anon;
grant execute on function public.ensure_class_logs(date, date) to authenticated;
