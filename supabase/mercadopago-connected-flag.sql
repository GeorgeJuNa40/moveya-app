-- ============================================================================
-- Move yA — Mercado Pago: bandera pública de "estudio conectó su MP"
-- ----------------------------------------------------------------------------
-- El token del estudio vive en mp_accounts (protegida, solo service role). Para
-- que el ALUMNO sepa si el estudio acepta Mercado Pago (y mostrar/ocultar el
-- botón), guardamos aquí solo un booleano NO sensible en la tabla studios.
-- La Edge Function mp-connect lo prende al conectar y lo apaga al desconectar.
-- ============================================================================

alter table public.studios
  add column if not exists mp_connected boolean not null default false;
