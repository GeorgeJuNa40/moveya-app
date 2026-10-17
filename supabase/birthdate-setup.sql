-- ============================================================================
-- Move yA — Fecha de nacimiento del alumno (para el cumpleaños en el CRM)
-- ----------------------------------------------------------------------------
-- 1) Agrega la columna birth_date a la tabla users.
-- 2) Actualiza el disparador de registro para guardar la fecha de nacimiento
--    que se captura al registrarse.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Debe decir "Success".
-- Es seguro correrlo de nuevo.
-- ============================================================================

-- 1) Columna nueva (no rompe nada si ya existe).
alter table public.users add column if not exists birth_date date;

-- 2) Disparador de registro, ahora guardando birth_date.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_ceu         text  := nullif(trim(meta->>'ceu_code'), '');
  v_studio_name text  := nullif(trim(meta->>'studio_name'), '');
  v_full_name   text  := coalesce(nullif(trim(meta->>'full_name'), ''),
                                  split_part(new.email, '@', 1));
  v_signup_role text  := upper(coalesce(nullif(trim(meta->>'signup_role'), ''), 'STUDENT'));
  v_phone       text  := coalesce(nullif(trim(meta->>'phone'), ''), '');
  v_country     text  := coalesce(nullif(trim(meta->>'country'), ''), '');
  v_currency    text  := coalesce(nullif(trim(meta->>'currency'), ''), 'USD');
  v_birth       date  := nullif(trim(meta->>'birth_date'), '')::date;
  v_branch      text  := nullif(trim(meta->>'branch_id'), '');  -- sucursal (gerente/coach/alumno por link)
  -- Tipo de negocio elegido AL REGISTRARSE (estudio/gimnasio/mixto). Esta decisión
  -- es la definitiva; ya no se cambia en Configuración.
  v_studio_type text  := lower(coalesce(nullif(trim(meta->>'studio_type'), ''), 'studio'));
  v_studio_id   text;
  v_initials    text;
begin
  v_initials := upper(left(v_full_name, 1)) ||
                coalesce(upper(left(split_part(v_full_name, ' ', 2), 1)), '');

  if v_ceu is not null then
    -----------------------------------------------------------------
    -- CAMINO A: unirse a un estudio existente (el CEU debe existir)
    -----------------------------------------------------------------
    select id into v_studio_id from public.studios where ceu_code = upper(v_ceu);
    if v_studio_id is null then
      raise exception 'El código de estudio (CEU) "%" no existe.', v_ceu;
    end if;

    if v_signup_role = 'COACH' then
      insert into public.users (id, studio_id, role, full_name, email, phone, birth_date, avatar_initials, coach_status, branch_id)
      values (new.id::text, v_studio_id, 'COACH', v_full_name, new.email, v_phone, v_birth, v_initials, 'PENDING', v_branch);
    elsif v_signup_role = 'BRANCH_ADMIN' then
      -- Gerente de sucursal: administra solo su sede.
      insert into public.users (id, studio_id, role, full_name, email, phone, birth_date, avatar_initials, branch_id)
      values (new.id::text, v_studio_id, 'BRANCH_ADMIN', v_full_name, new.email, v_phone, v_birth, v_initials, v_branch);
    elsif v_signup_role = 'OPERATOR' then
      -- Operador / recepción: opera el negocio con acceso limitado (sin reportes,
      -- configuración ni datos sensibles). La APP controla qué pantallas ve.
      insert into public.users (id, studio_id, role, full_name, email, phone, birth_date, avatar_initials, branch_id)
      values (new.id::text, v_studio_id, 'OPERATOR', v_full_name, new.email, v_phone, v_birth, v_initials, v_branch);
    else
      insert into public.users (id, studio_id, role, full_name, email, phone, birth_date, avatar_initials, branch_id)
      values (new.id::text, v_studio_id, 'STUDENT', v_full_name, new.email, v_phone, v_birth, v_initials, v_branch);
    end if;

  elsif v_studio_name is not null then
    -----------------------------------------------------------------
    -- CAMINO B: ESTUDIO NUEVO — la persona se vuelve ADMIN
    -----------------------------------------------------------------
    v_studio_id := gen_random_uuid()::text;

    -- Validación: solo valores conocidos; cualquier otra cosa cae a 'studio'.
    if v_studio_type not in ('studio', 'gym', 'mixed') then
      v_studio_type := 'studio';
    end if;

    insert into public.studios (id, name, ceu_code, studio_type, phone, email, branding, whatsapp, subscription)
    values (
      v_studio_id,
      v_studio_name,
      upper(regexp_replace(left(v_studio_name, 4), '[^a-zA-Z0-9]', '', 'g'))
        || '-' || upper(substr(md5(random()::text), 1, 4)),
      v_studio_type,
      v_phone,
      new.email,
      jsonb_build_object(
        'primaryColor', '#4A5D55', 'secondaryColor', '#FAF8F3',
        'accentColor', '#212121', 'fontFamily', 'Inter', 'logoText', v_studio_name,
        'logoShape', 'rounded',
        'country', v_country, 'currencyCode', v_currency
      ),
      jsonb_build_object(
        'number', '', 'botEnabled', false, 'aiActive', false,
        'templates', '[]'::jsonb, 'knowledge', '[]'::jsonb
      ),
      -- Pagar-primero: el estudio nace BLOQUEADO (sin acceso) hasta que pague.
      -- La promo de bienvenida ($1 / $20 · 14 días Premium) se cobra en la
      -- pasarela; al confirmarse el pago, el webhook abre los 14 días.
      -- currentPeriodEnd = now() => isSubscriptionActive() es false (bloqueado).
      jsonb_build_object(
        'status', 'TRIALING', 'plan', 'premium', 'priceUsd', 99.99, 'promoPriceUsd', 1,
        'trialDays', 14, 'isPromo', true,
        'founderInvited', (coalesce(meta->>'founder_invited', '') = '1'),
        'trialEndsAt', now(),
        'currentPeriodEnd', now()
      )
    );

    insert into public.users (id, studio_id, role, full_name, email, phone, birth_date, avatar_initials)
    values (new.id::text, v_studio_id, 'STUDIO_ADMIN', v_full_name, new.email, v_phone, v_birth, v_initials);

  else
    raise exception 'Para registrarte indica un CEU (para unirte a un estudio) o un nombre de estudio (para crear uno nuevo).';
  end if;

  return new;
end;
$$;

-- El disparador ya existe; esto solo reemplaza la función. Verifica con:
--   select tgname from pg_trigger where tgname = 'on_auth_user_created';
