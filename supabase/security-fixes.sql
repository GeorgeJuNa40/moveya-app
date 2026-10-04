-- ============================================================================
-- Move yA — Correcciones de seguridad (auditoría 4-oct-2026)
-- ----------------------------------------------------------------------------
-- Cierra 3 huecos encontrados en la auditoría:
--   1) CRÍTICO: un alumno/coach podía editar su propia fila en `users` y
--      cambiar su `role` a STUDIO_ADMIN (o su `studio_id`) y auto-ascenderse,
--      porque auth_role()/auth_studio_id() leen el rol DESDE esa tabla y la
--      política users_update solo exigía id = auth.uid(). Lo blindamos con un
--      trigger BEFORE UPDATE que congela columnas sensibles.
--   2) ALTO: award_goal daba estrellas con metas de objetivo 0 (vía API el
--      alumno podía crear goals con target_value=0). Se exige target >= 1.
--   3) MEDIO: roll_recurring_sessions() y handle_new_user() eran ejecutables por
--      anon/authenticated vía RPC. Se revoca ese EXECUTE (solo service role/cron).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) BLINDAJE DE `users`: nadie (salvo service role) cambia rol/estudio por API.
--    - El propio usuario (alumno/coach) NUNCA cambia role, studio_id ni
--      coach_status (se congelan a su valor anterior).
--    - El admin SÍ gestiona a los usuarios DE SU estudio (aprobar coaches, etc.),
--      pero NO puede mover a nadie a otro estudio.
--    - El service role (webhook/trigger, auth.uid() nulo) no tiene restricción.
-- ----------------------------------------------------------------------------
create or replace function public.guard_users_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller        text := auth.uid()::text;
  v_caller_role   text;
  v_caller_studio text;
begin
  -- Sin usuario = service role / servidor: sin restricción.
  if v_caller is null then
    return new;
  end if;

  select role::text, studio_id into v_caller_role, v_caller_studio
  from public.users where id = v_caller;

  -- Admin del MISMO estudio del registro: puede cambiar rol/estado del usuario,
  -- pero nunca moverlo a otro estudio.
  if v_caller_role = 'STUDIO_ADMIN' and v_caller_studio = old.studio_id then
    new.studio_id := old.studio_id;
    return new;
  end if;

  -- Cualquier otro caso (incl. el propio usuario editándose): congela columnas
  -- sensibles para impedir auto-ascenso o cambio de estudio.
  new.role         := old.role;
  new.studio_id    := old.studio_id;
  new.coach_status := old.coach_status;
  return new;
end;
$$;

drop trigger if exists trg_guard_users_update on public.users;
create trigger trg_guard_users_update
  before update on public.users
  for each row execute function public.guard_users_update();


-- ----------------------------------------------------------------------------
-- 2) award_goal: exige objetivo >= 1 (cierra el "regalo" de estrellas con
--    metas de objetivo 0 creadas por API). El resto de la lógica no cambia.
-- ----------------------------------------------------------------------------
create or replace function public.award_goal(p_goal_id text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     text := auth.uid()::text;
  v_owner   text;
  v_target  int;
  v_end     timestamptz;
  v_created timestamptz;
  v_ach     boolean;
  v_studio  text;
  v_reward  int;
  v_count   int;
  v_entry   text;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;

  select user_id, target_value, period_end, created_at, achieved
    into v_owner, v_target, v_end, v_created, v_ach
  from public.goals
  where id = p_goal_id
  for update;

  if v_owner is null then raise exception 'NOT_FOUND'; end if;
  if v_owner <> v_uid then raise exception 'NOT_ALLOWED'; end if;
  -- Objetivo inválido (<=0): no otorga estrellas (evita el abuso por API).
  if coalesce(v_target, 0) < 1 then raise exception 'INVALID_GOAL'; end if;

  -- Progreso: clases ASISTIDAS del alumno dentro de la ventana de la meta.
  select count(*) into v_count
  from public.bookings b
  join public.class_sessions s on s.id = b.session_id
  where b.user_id = v_uid
    and b.status = 'ATTENDED'
    and s.starts_at >= v_created
    and s.starts_at <= v_end;

  if v_ach then
    return json_build_object('achieved', true, 'already', true, 'progress', v_count, 'stars', 0);
  end if;

  if v_count < v_target then
    update public.goals set current_value = v_count where id = p_goal_id;
    return json_build_object('achieved', false, 'progress', v_count, 'stars', 0);
  end if;

  select studio_id into v_studio from public.users where id = v_uid;
  select coalesce(nullif(branding->>'goalStarReward','')::int, 5) into v_reward
  from public.studios where id = v_studio;
  if v_reward is null then v_reward := 5; end if;

  update public.goals set achieved = true, current_value = v_count where id = p_goal_id;

  if v_reward > 0 then
    v_entry := gen_random_uuid()::text;
    insert into public.star_entries (id, user_id, delta, reason)
      values (v_entry, v_uid, v_reward, 'bonus');
  end if;

  return json_build_object('achieved', true, 'progress', v_count, 'stars', v_reward);
end;
$$;


-- ----------------------------------------------------------------------------
-- 2b) LÍMITE de metas activas por alumno: cierra el "multiplicador" (crear
--     muchas metas y que la MISMA asistencia cuente para todas). El alumno
--     puede tener como máximo UNA meta sin lograr a la vez; el staff no tiene
--     límite (gestiona las metas de sus miembros).
-- ----------------------------------------------------------------------------
create or replace function public.guard_goals_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller text := auth.uid()::text;
  v_role   text;
  v_open   int;
begin
  if v_caller is null then return new; end if; -- service role
  select role::text into v_role from public.users where id = v_caller;
  if v_role in ('STUDIO_ADMIN','COACH') then return new; end if; -- staff sin límite
  if new.user_id = v_caller then
    select count(*) into v_open from public.goals
      where user_id = v_caller and achieved = false;
    if v_open >= 1 then
      raise exception 'GOAL_LIMIT';  -- ya tiene una meta activa
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_goals_insert on public.goals;
create trigger trg_guard_goals_insert
  before insert on public.goals
  for each row execute function public.guard_goals_insert();


-- ----------------------------------------------------------------------------
-- 3) Quita el EXECUTE público de funciones que NO deben llamarse desde la API.
--    (Siguen funcionando por trigger / cron / service role.)
-- ----------------------------------------------------------------------------
revoke all on function public.roll_recurring_sessions()  from public, anon, authenticated;
revoke all on function public.handle_new_user()           from public, anon, authenticated;
-- Helpers internos de RLS: no necesitan ser llamables por anónimos.
revoke all on function public.auth_role()                 from anon;
revoke all on function public.auth_studio_id()            from anon;
revoke all on function public.user_in_my_studio(text)     from anon;

-- ============================================================================
-- Verificación sugerida:
--   select tgname from pg_trigger where tgrelid='public.users'::regclass;
--   -- debe aparecer trg_guard_users_update
-- ============================================================================
