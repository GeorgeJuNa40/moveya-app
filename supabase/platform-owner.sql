-- ============================================================================
-- Move yA — Dueño de PLATAFORMA + Panel de creador
-- ----------------------------------------------------------------------------
-- Agrega la bandera platform_owner al usuario y la RPC moveya_overview que
-- devuelve el consolidado de TODO lo que vende Move yA (estudios, planes,
-- estados, MRR, fundadores). La RPC es SECURITY DEFINER y valida que quien
-- llama sea dueño de plataforma, así NO se abre la RLS (cada admin sigue viendo
-- solo su estudio). Aditivo y seguro.
--
-- Deploy: pégalo en Supabase → SQL Editor.
-- ============================================================================

-- 1) Bandera de dueño de plataforma (god-mode de negocio). Por defecto nadie.
alter table public.users add column if not exists platform_owner boolean not null default false;

-- 2) Marca a Jorge (dueño de Move yA) como dueño de plataforma.
update public.users set platform_owner = true where lower(email) = 'jorgejuareznava34@gmail.com';

-- 3) Consolidado para el panel de creador. Solo lo puede leer el dueño.
create or replace function public.moveya_overview()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_owner boolean;
  v_studios  json;
begin
  select coalesce(bool_or(platform_owner), false) into v_is_owner
    from public.users where id = auth.uid();
  if not coalesce(v_is_owner, false) then
    raise exception 'no autorizado';
  end if;

  select json_agg(x order by x.created_at) into v_studios from (
    select
      s.id,
      s.name,
      s.created_at,
      s.subscription->>'plan'                    as plan,
      s.subscription->>'status'                  as status,
      (s.subscription->>'isPromo')::boolean      as is_promo,
      (s.subscription->>'founder')::boolean      as founder,
      (s.subscription->>'legacyPricing')::boolean as legacy,
      (s.subscription->>'priceUsd')::numeric     as price_usd,
      s.subscription->>'provider'                as provider,
      s.subscription->>'billingInterval'         as billing,
      s.subscription->>'currentPeriodEnd'        as current_period_end,
      s.subscription->>'trialEndsAt'             as trial_ends_at,
      (select count(*) from public.users u where u.studio_id = s.id and u.role = 'STUDENT') as students,
      coalesce(s.stripe_charges_enabled, false)  as stripe_ok,
      exists (select 1 from public.mp_accounts m where m.studio_id = s.id and m.connected) as mp_ok
    from public.studios s
  ) x;

  return json_build_object('ok', true, 'studios', coalesce(v_studios, '[]'::json));
end;
$$;

-- La RPC la llama el dueño (usuario autenticado); la validación interna es el
-- candado real. Fuera anon.
revoke execute on function public.moveya_overview() from public, anon;
grant  execute on function public.moveya_overview() to authenticated;
