-- ============================================================================
-- Move yA — Adeudo de mensualidad (pago pendiente)
-- ----------------------------------------------------------------------------
-- Permite dar acceso "a crédito": el miembro ya tiene su membresía corriendo
-- pero el pago aún no se registra. Mientras `payment_pending = true`:
--   • al ALUMNO le aparece un banner persistente de "pago pendiente";
--   • al ESTUDIO le aparece en el CRM un estado "Pago pendiente" junto a
--     activo/por vencer/vencido.
-- Al registrar el pago (o condonarlo) se limpia la bandera.
--
-- No hace falta cambiar RLS: son columnas nuevas de una tabla que el estudio
-- ya puede escribir (registra planes) y el alumno ya puede leer (sus paquetes).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================
alter table public.user_packages add column if not exists payment_pending boolean not null default false;
alter table public.user_packages add column if not exists pending_due date;
