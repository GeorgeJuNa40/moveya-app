-- ============================================================================
-- Move yA — Paso de WhatsApp en el Workflow (Fase 6.1)
-- ----------------------------------------------------------------------------
-- Prepara el motor para enviar WhatsApp como paso del workflow:
--   • La cola guarda también el TELÉFONO del lead (to_phone).
--   • El enrolamiento lo recibe y lo guarda (sigue con el disparo instantáneo).
--   • Los pasos tipo 'whatsapp' usan una PLANTILLA aprobada de Meta.
-- El envío real se activa cuando el número de producción + token + plantilla
-- estén listos (se leen de whatsapp_accounts del estudio 'moveya-platform').
--
-- Depende de Fase 6 + disparo instantáneo ya aplicados. Pégalo en SQL Editor.
-- (Incluye DROP de firmas viejas: el SQL Editor sí permite DROP.)
-- ============================================================================

-- 1) La cola guarda el teléfono del lead (para los pasos de WhatsApp).
alter table public.moveya_sequence_queue
  add column if not exists to_phone text;

-- 2) Enrolar: ahora recibe el TELÉFONO. Conserva el disparo instantáneo.
drop function if exists public.moveya_enroll_sequence(text, text, text, text);
create or replace function public.moveya_enroll_sequence(
  p_lead_id text, p_email text, p_name text, p_phone text, p_source text
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
  if v_trigger <> 'any' and coalesce(trim(p_source),'') <> v_trigger then return; end if;
  if v_steps is null or jsonb_typeof(v_steps) <> 'array' then return; end if;

  for v_step in select * from jsonb_array_elements(v_steps)
  loop
    insert into public.moveya_sequence_queue (lead_id, to_email, to_name, to_phone, step_index, send_at)
    values (
      p_lead_id,
      nullif(left(trim(coalesce(p_email,'')),120),''),
      nullif(left(trim(coalesce(p_name,'')), 120), ''),
      nullif(left(trim(coalesce(p_phone,'')), 40), ''),
      v_i,
      now() + (coalesce((v_step->>'delay_hours')::int, 0) || ' hours')::interval
    );
    v_i := v_i + 1;
  end loop;

  -- Disparo instantáneo (día 0 inmediato).
  if v_i > 0 then
    begin
      perform net.http_post(
        url     := 'https://sgadjoodqctjukycaauq.supabase.co/functions/v1/sequence-tick',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWRqb29kcWN0anVreWNhYXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTI3ODEsImV4cCI6MjEwMDA4ODc4MX0.WsnRchXV3Z9zZxQs4Jt25LWubQh-cFeAY9mHIlknwgk',
          'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNnYWRqb29kcWN0anVreWNhYXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1MTI3ODEsImV4cCI6MjEwMDA4ODc4MX0.WsnRchXV3Z9zZxQs4Jt25LWubQh-cFeAY9mHIlknwgk'
        ),
        body    := '{}'::jsonb
      );
    exception when others then null;
    end;
  end if;
end;
$$;

-- 3) capture_lead / request_demo: pasan el teléfono al enrolar.
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
  values (left(trim(p_name),120), nullif(left(trim(coalesce(p_owner_name,'')),120),''),
          nullif(left(trim(coalesce(p_phone,'')),40),''), nullif(left(trim(coalesce(p_email,'')),120),''),
          nullif(left(trim(coalesce(p_city,'')),80),''), 'nuevo', v_src,
          nullif(left(trim(coalesce(p_note,'')),1000),'')) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email,
    coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name), p_phone, v_src);
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
  values (left(trim(p_name),120), nullif(left(trim(coalesce(p_owner_name,'')),120),''),
          nullif(left(trim(coalesce(p_phone,'')),40),''), nullif(left(trim(coalesce(p_email,'')),120),''),
          nullif(left(trim(coalesce(p_city,'')),80),''), 'demo', v_src,
          nullif(left(trim(coalesce(p_note,'')),1000),''), v_when) returning id into v_id;
  perform public.moveya_enroll_sequence(v_id, p_email,
    coalesce(nullif(trim(coalesce(p_owner_name,'')),''), p_name), p_phone, v_src);
  return true;
end; $$;

-- 4) Permisos.
revoke execute on function public.moveya_enroll_sequence(text,text,text,text,text) from public, anon, authenticated;
grant  execute on function public.capture_lead(text,text,text,text,text,text,text)     to anon, authenticated;
grant  execute on function public.request_demo(text,text,text,text,text,text,text,text) to anon, authenticated;
