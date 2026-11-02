-- ============================================================================
-- Move yA — Agenda de demos (embudo) · Fase 4
-- ----------------------------------------------------------------------------
-- Una página pública (sin login) donde un prospecto agenda una demo: elige
-- día y hora y deja sus datos. Se crea un lead en moveya_leads directamente en
-- la etapa 'demo' con la fecha/hora solicitada en demo_at. El dueño lo ve en su
-- CRM (columna "Demo") con la fecha.
--
-- Depende de la tabla moveya_leads (moveya-crm.sql). Aditivo y seguro.
-- Deploy: pégalo en Supabase → SQL Editor.
-- ============================================================================

-- 1) Nueva columna para la fecha/hora de la demo solicitada.
alter table public.moveya_leads
  add column if not exists demo_at timestamptz;

-- 2) RPC pública: agendar demo. Inserta el lead en etapa 'demo' con demo_at.
--    SECURITY DEFINER, solo INSERTA (no lee), con límites de longitud.
create or replace function public.request_demo(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text, p_demo_at text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_when timestamptz;
begin
  if coalesce(trim(p_name), '') = '' then return false; end if;

  -- Interpreta la fecha/hora (ISO). Si viene vacía o inválida, queda null.
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
  );
  return true;
end;
$$;

-- Pública: la llama cualquiera desde la página de agenda (solo inserta un lead).
grant execute on function public.request_demo(text,text,text,text,text,text,text,text) to anon, authenticated;
