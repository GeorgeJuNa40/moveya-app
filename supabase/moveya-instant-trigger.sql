-- ============================================================================
-- Move yA — Disparo INSTANTÁNEO del workflow (día 0 inmediato)
-- ----------------------------------------------------------------------------
-- Hace que, apenas se enrola un lead, se llame a 'sequence-tick' al momento,
-- para que el correo de día 0 (retraso 0) salga en segundos en vez de esperar
-- al cron. El cron sigue corriendo cada hora para los pasos futuros (día 2, 5…).
--
-- Reemplaza moveya_enroll_sequence (Fase 6) añadiendo la llamada al final.
-- Pégalo en Supabase → SQL Editor. (La anon key es pública, igual que en el cron.)
-- ============================================================================

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

  -- Disparo instantáneo: procesa de inmediato lo que ya venció (el día 0).
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
    exception when others then
      -- Si pg_net no está listo, no rompe el registro: el cron lo enviará luego.
      null;
    end;
  end if;
end;
$$;
