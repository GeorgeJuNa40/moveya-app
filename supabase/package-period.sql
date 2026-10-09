-- ============================================================================
-- Move yA — Periodo de cobro flexible en paquetes/membresías
-- ----------------------------------------------------------------------------
-- El estudio/gym elige cómo cobra cada membresía de acceso: día suelto, semanal,
-- quincenal, mensual o trimestral. Se guarda en packages.period y define la
-- vigencia (validity_days). "Por clase" sigue siendo un paquete de créditos.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================

alter table public.packages add column if not exists period text;
-- Valores esperados (membresías de acceso): 'day','week','biweekly','month','quarter'.
