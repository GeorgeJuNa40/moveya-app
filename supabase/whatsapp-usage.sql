-- ============================================================================
-- Move yA — Tope de uso de la IA del bot de WhatsApp (por estudio / mes)
-- ----------------------------------------------------------------------------
-- Cuenta cuántos mensajes respondió la IA (Claude) para cada estudio en el mes
-- en curso. El webhook (whatsapp-webhook) llama a bump_whatsapp_usage en cada
-- respuesta con IA; si el contador supera WHATSAPP_AI_MONTHLY_CAP, el bot pasa a
-- respuestas con reglas (gratis) para que el costo no se dispare.
--
-- Solo es NECESARIO cuando enciendes la IA (primer cliente Premium). Correrlo
-- antes no tiene efecto negativo: la tabla queda lista y vacía.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================

-- 1. Tabla de contadores: una fila por estudio y mes ("2026-08").
create table if not exists public.whatsapp_ai_usage (
  studio_id  text not null references public.studios(id) on delete cascade,
  ym         text not null,                      -- año-mes, formato "YYYY-MM"
  count      integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (studio_id, ym)
);

alter table public.whatsapp_ai_usage enable row level security;

-- Lectura opcional para el admin del estudio (el webhook usa service role y
-- salta RLS). Así en el futuro el panel podría mostrar "mensajes IA este mes".
drop policy if exists whatsapp_ai_usage_read on public.whatsapp_ai_usage;
create policy whatsapp_ai_usage_read on public.whatsapp_ai_usage
  for select using (
    public.auth_role() = 'STUDIO_ADMIN' and studio_id = public.auth_studio_id()
  );

-- 2. Función: suma 1 al contador del mes y devuelve el nuevo total (atómico).
create or replace function public.bump_whatsapp_usage(p_studio text, p_ym text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.whatsapp_ai_usage (studio_id, ym, count, updated_at)
    values (p_studio, p_ym, 1, now())
  on conflict (studio_id, ym)
    do update set count = public.whatsapp_ai_usage.count + 1, updated_at = now()
  returning count into v_count;
  return v_count;
end;
$$;

-- El webhook la invoca con la SERVICE ROLE KEY; no se expone a alumnos.
revoke all on function public.bump_whatsapp_usage(text, text) from public, anon, authenticated;
grant execute on function public.bump_whatsapp_usage(text, text) to service_role;

-- ============================================================================
-- LISTO. Verifica:
--   select proname from pg_proc where proname = 'bump_whatsapp_usage';
--   select * from public.whatsapp_ai_usage;
-- ============================================================================
