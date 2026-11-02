-- ============================================================================
-- Move yA — Automatizaciones / Workflow (Fase 6)
-- ----------------------------------------------------------------------------
-- Extiende la secuencia (Fase 3) para que sea un workflow configurable:
--   • Disparador por ORIGEN del lead (todos o un canal específico).
--   • Pasos con TIPO: 'email' (asunto+cuerpo) o 'stage' (cambia la etapa del
--     lead en el CRM), cada uno con su retraso en días.
-- Reusa moveya_sequence_config / _queue / sequence-tick.
--
-- Depende de Fase 3 (moveya-sequences.sql) ya aplicada. Pégalo en SQL Editor.
-- (Incluye DROP de firmas viejas: el SQL Editor sí permite DROP.)
-- ============================================================================

-- 1) Disparador por origen en la config (default 'any' = todos).
alter table public.moveya_sequence_config
  add column if not exists trigger_source text not null default 'any';

-- 2) La cola ahora permite correo nulo (pasos de tipo 'stage' no necesitan email).
alter table public.moveya_sequence_queue
  alter column to_email drop not null;

-- 3) Enrolar: ahora recibe el ORIGEN y respeta el disparador. Enrola aunque el
--    lead no tenga correo (los pasos 'email' sin correo se omiten en el envío).
drop function if exists public.moveya_enroll_sequence(text, text, text);
create or replace function public.moveya_enroll_sequence(
  p_lead_id text, p_email text, p_name text, p_source text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_active  boolean;
  v_trigger text;
  v_steps   jsonb;
  v_step    jsonb;
  v_i       int := 0;
begin
  select active, coalesce(trigger_source,'any'), steps
    into v_active, v_trigger, v_steps
  from public.moveya_sequence_config where id = 1;

  if not coalesce(v_active, false) then return; end if;
  -- Disparador: si no es 'any', solo enrola a los leads de ese origen.
  if v_trigger <> 'any' and coalesce(trim(p_source),'') <> v_trigger then return; end if;
  if v_steps is null or jsonb_typeof(v_steps) <> 'array' then return; end if;

  for v_step in select * from jsonb_array_elements(v_steps)
  loop
    insert into public.moveya_sequence_queue (lead_id, to_email, to_name, step_index, send_at)
    values (
      p_lead_id,
      nullif(left(trim(coalesce(p_email,'')),120),''),
      nullif(left(trim(coalesce(p_name,'')), 120), ''),
      v_i,
      now() + (coalesce((v_step->>'delay_hours')::int, 0) || ' hours')::interval
    );
    v_i := v_i + 1;
  end loop;
end;
$$;

-- 4) capture_lead / request_demo: pasan el origen al enrolar.
create or replace function public.capture_lead(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_id text; v_src text;
begin
  if coalesce(trim(p_name), '') = '' then return false; end if;
  v_src := coalesce(nullif(trim(coalesce(p_source,'')),''),'formulario');
  insert into public.moveya_leads (name, owner_name, phone, email, city, status, source, notes)
  values (
    left(trim(p_name),120), nullif(left(trim(coalesce(p_owner_name,'')),120),''),
    nullif(left(trim(coalesce(p_phone,'')),40),''), nullif(left(trim(coalesce(p_email,'')),120),''),
    nullif(left(trim(coalesce(p_city,'')),80),''), 'nuevo', v_src,
    nullif(left(trim(coalesce(p_note,'')),1000),'')
  ) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email, coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name), v_src);
  return true;
end; $$;

create or replace function public.request_demo(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text, p_demo_at text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_when timestamptz; v_id text; v_src text;
begin
  if coalesce(trim(p_name), '') = '' then return false; end if;
  begin v_when := nullif(trim(coalesce(p_demo_at,'')),'')::timestamptz; exception when others then v_when := null; end;
  v_src := coalesce(nullif(trim(coalesce(p_source,'')),''),'agenda-demo');
  insert into public.moveya_leads (name, owner_name, phone, email, city, status, source, notes, demo_at)
  values (
    left(trim(p_name),120), nullif(left(trim(coalesce(p_owner_name,'')),120),''),
    nullif(left(trim(coalesce(p_phone,'')),40),''), nullif(left(trim(coalesce(p_email,'')),120),''),
    nullif(left(trim(coalesce(p_city,'')),80),''), 'demo', v_src,
    nullif(left(trim(coalesce(p_note,'')),1000),''), v_when
  ) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email, coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name), v_src);
  return true;
end; $$;

-- 5) Guardar config: ahora incluye el disparador por origen.
drop function if exists public.moveya_seq_config_save(boolean, jsonb);
create or replace function public.moveya_seq_config_save(
  p_active boolean, p_steps jsonb, p_trigger_source text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if jsonb_typeof(p_steps) <> 'array' then raise exception 'steps debe ser un arreglo'; end if;
  insert into public.moveya_sequence_config (id, active, steps, trigger_source, updated_at)
  values (1, coalesce(p_active,true), p_steps, coalesce(nullif(trim(coalesce(p_trigger_source,'')),''),'any'), now())
  on conflict (id) do update set
    active = excluded.active, steps = excluded.steps,
    trigger_source = excluded.trigger_source, updated_at = now();
end; $$;

-- Recrea el getter para reflejar la columna nueva.
create or replace function public.moveya_seq_config_get()
returns public.moveya_sequence_config
language sql security definer set search_path = public stable as $$
  select * from public.moveya_sequence_config where id = 1 and public.is_platform_owner();
$$;

-- 6) Permisos.
revoke execute on function public.moveya_enroll_sequence(text,text,text,text) from public, anon, authenticated;
grant  execute on function public.capture_lead(text,text,text,text,text,text,text)     to anon, authenticated;
grant  execute on function public.request_demo(text,text,text,text,text,text,text,text) to anon, authenticated;
revoke execute on function public.moveya_seq_config_save(boolean, jsonb, text) from public, anon;
grant  execute on function public.moveya_seq_config_save(boolean, jsonb, text) to authenticated;
revoke execute on function public.moveya_seq_config_get() from public, anon;
grant  execute on function public.moveya_seq_config_get() to authenticated;
