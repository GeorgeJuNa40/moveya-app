-- ============================================================================
-- Move yA — Captura pública de leads (formulario de embudo)
-- ----------------------------------------------------------------------------
-- Una página pública (sin login) donde un prospecto deja sus datos y se crea un
-- lead en moveya_leads (status 'nuevo'). La función es SECURITY DEFINER y SOLO
-- inserta (no lee), con límites de longitud para evitar abuso. El dueño lo ve
-- en su CRM.
--
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

create or replace function public.capture_lead(
  p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_note text, p_source text
) returns boolean
language plpgsql security definer set search_path = public as $$
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
  );
  return true;
end;
$$;

-- Pública: la llama cualquiera desde el formulario (solo inserta un lead).
grant execute on function public.capture_lead(text,text,text,text,text,text,text) to anon, authenticated;
