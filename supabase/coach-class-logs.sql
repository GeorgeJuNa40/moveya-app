-- ============================================================================
-- Move yA — Registro de clases dadas por coach (doble confirmación) · Fase 2
-- ----------------------------------------------------------------------------
-- Cada "ocurrencia" (una clase, un día) se registra para la NÓMINA del coach.
-- Para que cuente como PAGABLE necesita DOBLE confirmación:
--   • El COACH confirma "di esta clase" (y deja los asistentes).
--   • El ADMIN/recepción confirma (y puede ajustar asistentes y el monto).
-- Con ambas → 'confirmada'. Con una o ninguna → 'pendiente'. El monto se SUGIERE
-- desde users.coach_pay (Fase 1) y SIEMPRE es editable por el admin.
--
-- Esto NO toca la asistencia (sigue igual: el coach la marca, el admin la ve);
-- es un registro aparte solo para calcular el pago.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================

create table if not exists public.class_logs (
  id                 text primary key,
  studio_id          text not null,
  coach_id           text not null,
  session_id         text,
  template_id        text,
  occurred_on        date not null,
  title              text,
  capacity           int  not null default 0,
  attendees          int  not null default 0,
  is_full            boolean not null default false,
  coach_confirmed_at timestamptz,
  staff_confirmed_at timestamptz,
  staff_confirmed_by text,
  amount             numeric not null default 0,  -- monto FINAL a pagar (editable)
  note               text,
  created_at         timestamptz not null default now()
);

-- Dedupe: una sola ocurrencia por coach + clase + día.
create unique index if not exists class_logs_dedupe
  on public.class_logs (coach_id, session_id, occurred_on);
create index if not exists class_logs_studio_date on public.class_logs (studio_id, occurred_on);

alter table public.class_logs enable row level security;

-- Lectura: el personal ve todo lo de su estudio; el coach ve solo lo suyo.
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'class_logs' and policyname = 'class_logs_read') then
    create policy class_logs_read on public.class_logs for select using (
      studio_id = public.auth_studio_id()
      and (public.auth_role() = 'STUDIO_ADMIN' or coach_id = auth.uid()::text)
    );
  end if;
end $$;
-- Sin política de escritura: todo pasa por las RPC (SECURITY DEFINER) de abajo.

-- ----------------------------------------------------------------------------
-- Monto sugerido según la config de pago del coach (users.coach_pay).
-- ----------------------------------------------------------------------------
create or replace function public.coach_suggested_amount(p_coach text, p_attendees int, p_full boolean)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when (pay->>'mode') = 'por_asistente' then coalesce((pay->>'rate')::numeric, 0) * greatest(p_attendees, 0)
    when (pay->>'mode') = 'fijo' then 0
    when (pay->>'mode') = 'por_clase' and p_full and nullif(pay->>'rateFull','') is not null then (pay->>'rateFull')::numeric
    when (pay->>'mode') = 'por_clase' then coalesce((pay->>'rate')::numeric, 0)
    else 0
  end
  from (select coach_pay as pay from public.users where id = p_coach) q
$$;

-- ----------------------------------------------------------------------------
-- El COACH confirma que dio una clase (crea/actualiza la ocurrencia).
-- ----------------------------------------------------------------------------
create or replace function public.coach_confirm_class(p_session_id text, p_occurred_on date, p_attendees int default 0)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_studio text; v_coach text; v_tpl text; v_cap int; v_title text;
  v_full boolean; v_amount numeric; v_id text; v_att int := greatest(coalesce(p_attendees,0), 0);
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;
  select cs.studio_id, cs.coach_id, cs.template_id, cs.capacity
    into v_studio, v_coach, v_tpl, v_cap
    from public.class_sessions cs where cs.id = p_session_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_coach is distinct from v_uid then raise exception 'NOT_ALLOWED'; end if; -- solo el coach de la clase
  select name into v_title from public.class_templates where id = v_tpl;
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
    -- solo re-sugerimos el monto si el admin aún NO lo confirmó/ajustó
    amount = case when public.class_logs.staff_confirmed_at is null then v_amount else public.class_logs.amount end
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.coach_confirm_class(text, date, int) from public, anon;
grant execute on function public.coach_confirm_class(text, date, int) to authenticated;

-- ----------------------------------------------------------------------------
-- El ADMIN/recepción confirma (y puede ajustar asistentes y el monto).
-- ----------------------------------------------------------------------------
create or replace function public.staff_confirm_class(p_log_id text, p_attendees int default null, p_amount numeric default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_studio text; v_cap int; v_att int;
begin
  if public.auth_role() <> 'STUDIO_ADMIN' then raise exception 'NOT_ALLOWED'; end if;
  select studio_id, capacity into v_studio, v_cap from public.class_logs where id = p_log_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;
  update public.class_logs set
    staff_confirmed_at = now(),
    staff_confirmed_by = auth.uid()::text,
    attendees = coalesce(p_attendees, attendees),
    is_full = (capacity > 0 and coalesce(p_attendees, attendees) >= capacity),
    amount = coalesce(p_amount, amount)
  where id = p_log_id;
end $$;
revoke execute on function public.staff_confirm_class(text, int, numeric) from public, anon;
grant execute on function public.staff_confirm_class(text, int, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- El ADMIN edita el monto de una ocurrencia en cualquier momento (campo confiable).
-- ----------------------------------------------------------------------------
create or replace function public.set_class_amount(p_log_id text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare v_studio text;
begin
  if public.auth_role() <> 'STUDIO_ADMIN' then raise exception 'NOT_ALLOWED'; end if;
  select studio_id into v_studio from public.class_logs where id = p_log_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;
  update public.class_logs set amount = greatest(coalesce(p_amount, 0), 0) where id = p_log_id;
end $$;
revoke execute on function public.set_class_amount(text, numeric) from public, anon;
grant execute on function public.set_class_amount(text, numeric) to authenticated;

-- ============================================================================
-- LISTO. (La generación automática de "pendientes" para clases olvidadas y el
-- reporte de nómina con PDF llegan en la Fase 3.)
-- ============================================================================
