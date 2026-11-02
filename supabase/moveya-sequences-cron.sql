-- ============================================================================
-- Move yA — Cron de secuencias (pg_cron + pg_net) · Fase 3
-- ----------------------------------------------------------------------------
-- Hace que Supabase llame sola a la función 'sequence-tick' cada hora, para
-- enviar los correos de seguimiento que ya estén vencidos (send_at <= ahora).
--
-- PASOS:
--   1) Reemplaza  TU_ANON_KEY  por tu llave "anon public"
--      (Settings → API → Project API keys → anon public).
--   2) Ejecuta este archivo UNA VEZ en el SQL Editor.
--
-- El project ref (sgadjoodqctjukycaauq) ya está puesto. La función
-- 'sequence-tick' debe estar publicada con "Enforce JWT" DESACTIVADO
-- (la invoca el cron, no un usuario).
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Evita duplicar el trabajo si ya existía.
select cron.unschedule('moveya-sequence-tick')
where exists (select 1 from cron.job where jobname = 'moveya-sequence-tick');

-- Cada hora (minuto 7, para no chocar con otros crons): llama a sequence-tick.
select cron.schedule(
  'moveya-sequence-tick',
  '7 * * * *',
  $$
  select net.http_post(
    url     := 'https://sgadjoodqctjukycaauq.supabase.co/functions/v1/sequence-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer TU_ANON_KEY',
      'apikey', 'TU_ANON_KEY'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Para ver los trabajos programados:   select * from cron.job;
-- Para quitar este trabajo:            select cron.unschedule('moveya-sequence-tick');
