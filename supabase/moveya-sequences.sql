-- ============================================================================
-- Move yA — Secuencias de seguimiento automáticas (embudo) · Fase 3
-- ----------------------------------------------------------------------------
-- Cuando entra un lead CON correo (por captura o agenda de demo) se le programan
-- automáticamente varios correos de seguimiento (día 0, día 2, día 5…). Un cron
-- (sequence-tick) los envía a su hora vía Resend. El dueño prende/apaga la
-- automatización y edita los pasos desde el panel.
--
-- Depende de moveya_leads y is_platform_owner(). Aditivo y seguro.
-- Deploy: pégalo en Supabase → SQL Editor. (El cron va en archivo aparte.)
-- ============================================================================

-- 1) Configuración de la secuencia (una sola fila, id = 1). steps es un arreglo
--    JSON de pasos: [{ "delay_hours": int, "subject": text, "body": text }, ...]
create table if not exists public.moveya_sequence_config (
  id         int primary key default 1,
  active     boolean not null default true,
  steps      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint moveya_sequence_config_single check (id = 1)
);

-- Semilla por defecto: 3 correos (día 0, día 2, día 5). Solo si está vacía.
insert into public.moveya_sequence_config (id, active, steps)
values (1, true, $json$[
  {"delay_hours": 0,   "subject": "Gracias por tu interés en Move yA, {{nombre}}",
   "body": "Hola {{nombre}},\n\nGracias por acercarte a Move yA. Ayudamos a estudios y gimnasios a ordenar reservas, membresías, cobros y WhatsApp en una sola app con tu marca.\n\n¿Qué es lo que más te gustaría resolver hoy? Respóndeme a este correo y te oriento.\n\nUn saludo,\nMove yA"},
  {"delay_hours": 48,  "subject": "{{nombre}}, ¿te muestro Move yA en 15 minutos?",
   "body": "Hola {{nombre}},\n\nTe propongo una demo corta (15 min) para enseñarte Move yA en vivo con el caso de tu estudio. Sin compromiso.\n\nDime 2 horarios que te acomoden esta semana y lo agendamos.\n\nMove yA"},
  {"delay_hours": 120, "subject": "Última llamada, {{nombre}} 🎁",
   "body": "Hola {{nombre}},\n\nSolo para cerrar el círculo: puedes probar Move yA completo (acceso Premium) por muy poco y sin permanencia. Si te late, te ayudo a dejar tu estudio configurado en un día.\n\n¿Lo vemos? Respóndeme y arrancamos.\n\nMove yA"}
]$json$::jsonb)
on conflict (id) do nothing;

alter table public.moveya_sequence_config enable row level security;
-- Sin políticas: solo service role (cron) y el dueño por RPC.

-- 2) Cola de envíos programados. Una fila por paso y por lead enrolado.
create table if not exists public.moveya_sequence_queue (
  id         text primary key default (gen_random_uuid())::text,
  lead_id    text,
  to_email   text not null,
  to_name    text,
  step_index int  not null,
  send_at    timestamptz not null,
  status     text not null default 'pending',  -- pending | sent | canceled
  created_at timestamptz not null default now()
);
create index if not exists idx_moveya_seq_queue_due on public.moveya_sequence_queue (status, send_at);

alter table public.moveya_sequence_queue enable row level security;
-- Sin políticas: solo service role (cron) y el dueño por RPC.

-- 3) Enrolar un lead en la secuencia (interna). La llaman capture_lead y
--    request_demo. Solo programa si la automatización está activa y hay correo.
create or replace function public.moveya_enroll_sequence(
  p_lead_id text, p_email text, p_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_active boolean;
  v_steps  jsonb;
  v_step   jsonb;
  v_i      int := 0;
begin
  if coalesce(trim(p_email), '') = '' then return; end if;

  select active, steps into v_active, v_steps
  from public.moveya_sequence_config where id = 1;

  if not coalesce(v_active, false) then return; end if;
  if v_steps is null or jsonb_typeof(v_steps) <> 'array' then return; end if;

  for v_step in select * from jsonb_array_elements(v_steps)
  loop
    insert into public.moveya_sequence_queue (lead_id, to_email, to_name, step_index, send_at)
    values (
      p_lead_id,
      left(trim(p_email), 120),
      nullif(left(trim(coalesce(p_name,'')), 120), ''),
      v_i,
      now() + (coalesce((v_step->>'delay_hours')::int, 0) || ' hours')::interval
    );
    v_i := v_i + 1;
  end loop;
end;
$$;

-- 4) capture_lead y request_demo: ahora enrolan al lead (si trae correo).
--    Se re-crean con el enrolamiento añadido (idempotente).
create or replace function public.capture_lead(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if coalesce(trim(p_name), '') = '' then return false; end if;
  insert into public.moveya_leads (name, owner_name, phone, email, city, status, source, notes)
  values (
    left(trim(p_name), 120),
    nullif(left(trim(coalesce(p_owner_name,'')), 120), ''),
    nullif(left(trim(coalesce(p_phone,'')), 40), ''),
    nullif(left(trim(coalesce(p_email,'')), 120), ''),
    nullif(left(trim(coalesce(p_city,'')), 80), ''),
    'nuevo',
    coalesce(nullif(trim(coalesce(p_source,'')), ''), 'formulario'),
    nullif(left(trim(coalesce(p_note,'')), 1000), '')
  ) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email, coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name));
  return true;
end;
$$;

create or replace function public.request_demo(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text, p_demo_at text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_when timestamptz; v_id text;
begin
  if coalesce(trim(p_name), '') = '' then return false; end if;
  begin
    v_when := nullif(trim(coalesce(p_demo_at,'')), '')::timestamptz;
  exception when others then
    v_when := null;
  end;
  insert into public.moveya_leads (name, owner_name, phone, email, city, status, source, notes, demo_at)
  values (
    left(trim(p_name), 120),
    nullif(left(trim(coalesce(p_owner_name,'')), 120), ''),
    nullif(left(trim(coalesce(p_phone,'')), 40), ''),
    nullif(left(trim(coalesce(p_email,'')), 120), ''),
    nullif(left(trim(coalesce(p_city,'')), 80), ''),
    'demo',
    coalesce(nullif(trim(coalesce(p_source,'')), ''), 'agenda-demo'),
    nullif(left(trim(coalesce(p_note,'')), 1000), ''),
    v_when
  ) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email, coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name));
  return true;
end;
$$;

-- 5) RPCs del dueño: leer/guardar la config y ver estadísticas.
create or replace function public.moveya_seq_config_get()
returns public.moveya_sequence_config
language sql security definer set search_path = public stable as $$
  select * from public.moveya_sequence_config
  where id = 1 and public.is_platform_owner();
$$;

create or replace function public.moveya_seq_config_save(p_active boolean, p_steps jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'steps debe ser un arreglo'; end if;
  insert into public.moveya_sequence_config (id, active, steps, updated_at)
  values (1, coalesce(p_active, true), p_steps, now())
  on conflict (id) do update set active = excluded.active, steps = excluded.steps, updated_at = now();
end;
$$;

-- Estadística simple: cuántos envíos pendientes y enviados.
create or replace function public.moveya_seq_stats()
returns table(pending bigint, sent bigint)
language sql security definer set search_path = public stable as $$
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'sent')
  from public.moveya_sequence_queue
  where public.is_platform_owner();
$$;

-- 6) Permisos.
-- Internas / cron: nadie las ejecuta por API (solo service role).
revoke execute on function public.moveya_enroll_sequence(text,text,text) from public, anon, authenticated;
-- capture_lead / request_demo siguen públicas (las llama el formulario).
grant execute on function public.capture_lead(text,text,text,text,text,text,text)        to anon, authenticated;
grant execute on function public.request_demo(text,text,text,text,text,text,text,text)    to anon, authenticated;
-- Config y stats: solo el dueño.
revoke execute on function public.moveya_seq_config_get()                 from public, anon;
revoke execute on function public.moveya_seq_config_save(boolean, jsonb)  from public, anon;
revoke execute on function public.moveya_seq_stats()                      from public, anon;
grant  execute on function public.moveya_seq_config_get()                 to authenticated;
grant  execute on function public.moveya_seq_config_save(boolean, jsonb)  to authenticated;
grant  execute on function public.moveya_seq_stats()                      to authenticated;
