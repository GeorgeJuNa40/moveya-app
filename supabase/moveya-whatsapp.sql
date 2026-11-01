-- ============================================================================
-- Move yA — WhatsApp de la PLATAFORMA (ventas) · entrega 1: base + config
-- ----------------------------------------------------------------------------
-- El bot/bandeja de WhatsApp ya existe por estudio (wa_conversations, etc.),
-- con FK obligatorio a studios. Para que el WhatsApp de VENTAS de Move yA
-- reutilice TODA esa infraestructura sin tocar el webhook, se crea un estudio
-- OCULTO "Move yA" (is_platform=true). Se excluye del panel de negocio y no es
-- un cliente. El dueño lo configura desde el panel vía RPC (platform_owner).
--
-- Depende de is_platform_owner() (moveya-products-admin.sql).
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

-- 1) Bandera de estudio-plataforma (oculto) + estudio Move yA.
alter table public.studios add column if not exists is_platform boolean not null default false;

insert into public.studios (id, name, ceu_code, is_platform, studio_type, whatsapp, subscription)
values (
  'moveya-platform', 'Move yA', 'MOVEYA', true, 'studio',
  '{"botEnabled":false,"aiActive":false,"number":"","knowledge":[],"templates":[]}'::jsonb,
  '{"status":"PLATFORM"}'::jsonb
)
on conflict (id) do nothing;

-- 2) El panel de negocio NO debe contar el estudio-plataforma.
create or replace function public.moveya_overview()
returns json language plpgsql security definer set search_path = public as $$
declare v_is_owner boolean; v_studios json;
begin
  select coalesce(bool_or(platform_owner), false) into v_is_owner
    from public.users where id = (auth.uid())::text;
  if not coalesce(v_is_owner, false) then raise exception 'no autorizado'; end if;

  select json_agg(x order by x.created_at) into v_studios from (
    select
      s.id, s.name, s.created_at,
      s.subscription->>'plan' as plan, s.subscription->>'status' as status,
      (s.subscription->>'isPromo')::boolean as is_promo,
      (s.subscription->>'founder')::boolean as founder,
      (s.subscription->>'legacyPricing')::boolean as legacy,
      (s.subscription->>'priceUsd')::numeric as price_usd,
      s.subscription->>'provider' as provider,
      s.subscription->>'billingInterval' as billing,
      s.subscription->>'currentPeriodEnd' as current_period_end,
      s.subscription->>'trialEndsAt' as trial_ends_at,
      (select count(*) from public.users u where u.studio_id = s.id and u.role = 'STUDENT') as students,
      coalesce(s.stripe_charges_enabled, false) as stripe_ok,
      exists (select 1 from public.mp_accounts m where m.studio_id = s.id and m.connected) as mp_ok
    from public.studios s
    where coalesce(s.is_platform, false) = false
  ) x;

  return json_build_object('ok', true, 'studios', coalesce(v_studios, '[]'::json));
end; $$;

-- 3) Config del WhatsApp de ventas (lee/escribe el estudio oculto). Solo el dueño.
create or replace function public.moveya_wa_config()
returns json language sql security definer set search_path = public stable as $$
  select case when public.is_platform_owner() then json_build_object(
    'botEnabled',   coalesce((s.whatsapp->>'botEnabled')::boolean, false),
    'aiActive',     coalesce((s.whatsapp->>'aiActive')::boolean, false),
    'number',       coalesce(s.whatsapp->>'number', ''),
    'knowledge',    coalesce(s.whatsapp->'knowledge', '[]'::jsonb),
    'connected',    exists (select 1 from public.whatsapp_accounts w where w.studio_id = 'moveya-platform'),
    'phoneNumberId',coalesce((select phone_number_id from public.whatsapp_accounts where studio_id = 'moveya-platform'), '')
  ) else null end
  from public.studios s where s.id = 'moveya-platform';
$$;

create or replace function public.moveya_wa_config_set(
  p_bot_enabled boolean, p_ai_active boolean, p_number text, p_knowledge jsonb
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  update public.studios
    set whatsapp = coalesce(whatsapp, '{}'::jsonb) || jsonb_build_object(
      'botEnabled', coalesce(p_bot_enabled, false),
      'aiActive',   coalesce(p_ai_active, false),
      'number',     coalesce(p_number, ''),
      'knowledge',  coalesce(p_knowledge, '[]'::jsonb)
    )
  where id = 'moveya-platform';
end; $$;

revoke execute on function public.moveya_wa_config() from public, anon;
revoke execute on function public.moveya_wa_config_set(boolean,boolean,text,jsonb) from public, anon;
grant  execute on function public.moveya_wa_config() to authenticated;
grant  execute on function public.moveya_wa_config_set(boolean,boolean,text,jsonb) to authenticated;
