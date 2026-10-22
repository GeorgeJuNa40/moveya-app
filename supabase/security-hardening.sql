-- ============================================================================
-- Move yA — Hardening de seguridad (quick wins de auditoría, oct-2026)
-- ----------------------------------------------------------------------------
-- Cierra hallazgos MENORES del linter de Supabase. Nada aquí es crítico: el
-- blindaje real (RLS solo-lectura del alumno + RPC SECURITY DEFINER) ya está
-- vivo (ver harden-writes.sql). Esto es defensa en profundidad + limpieza.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es idempotente y seguro
-- de re-correr.
--
-- NO incluido a propósito:
--   * Mover la extensión pg_net fuera de 'public': la usa push-cron (pg_net.http_post).
--     Moverla rompería los recordatorios/push. Se deja como está (cosmético).
--   * Tablas con RLS activo y sin políticas (mp_accounts, push_sent_log,
--     whatsapp_accounts): es correcto — solo las escribe el service role, así
--     que "sin política" = deny-all para usuarios. Intencional.
--   * Protección de contraseñas filtradas (HaveIBeenPwned): es un toggle de
--     Supabase → Authentication → Policies, NO es SQL. Actívalo ahí.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- B) search_path fijo en el trigger lock_moveya_picks (evita secuestro por
--    search_path mutable). Las demás funciones ya lo tienen.
-- ----------------------------------------------------------------------------
alter function public.lock_moveya_picks() set search_path = public;

-- ----------------------------------------------------------------------------
-- C) Quitar a 'anon' (visitantes sin sesión) el permiso de ejecutar las RPC de
--    ACCIÓN. Todas validan auth.uid() internamente y ya fallaban para anon;
--    esto elimina el endpoint por completo para no-autenticados. Los usuarios
--    con sesión ('authenticated') conservan el permiso.
--
--    OJO: Postgres concede EXECUTE a PUBLIC por defecto, y 'anon' lo hereda; por
--    eso hay que revocar de PUBLIC (y de anon) y RE-conceder a 'authenticated'.
--    Los dueños/superusuario (postgres, service_role) conservan acceso siempre.
--
--    Se CONSERVA acceso público en get_public_studio y founders_status:
--    alimentan las páginas públicas (landing, página del estudio, cupos de
--    fundador) antes de iniciar sesión. NO se tocan los helpers de RLS (auth_*,
--    user_in_my_studio, etc.) porque se evalúan dentro de las políticas también
--    para anon.
-- ----------------------------------------------------------------------------
do $$
declare
  f text;
  action_rpcs text[] := array[
    'public.book_session(text)',
    'public.book_session(text, text)',
    'public.book_session(text, text, text)',
    'public.cancel_booking(text)',
    'public.redeem_reward(text)',
    'public.redeem_reward(text, text)',
    'public.join_waitlist(text, text)',
    'public.leave_waitlist(text)',
    'public.award_goal(text)',
    'public.create_managed_member(text, text, text)',
    'public.update_managed_member(text, text, text)',
    'public.pos_sell(text, integer, text, text)',
    'public.mark_routine_done(text)',
    'public.confirm_routine_completion(text)',
    'public.access_check_in(text, text)',
    'public.admin_list_suggestions()',
    'public.admin_reply_suggestion(text, text)',
    'public.admin_set_suggestion_status(text, text)',
    'public.accept_moveya_picks()',
    'public.claim_guest_source()'
  ];
begin
  foreach f in array action_rpcs loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Garantiza que las dos funciones públicas sigan accesibles para visitantes.
grant execute on function public.get_public_studio(text) to anon, authenticated;
grant execute on function public.founders_status()       to anon, authenticated;

-- ----------------------------------------------------------------------------
-- F) Limpieza: eliminar las firmas VIEJAS y duplicadas de RPC. El front ya usa
--    book_session(text,text,text) y redeem_reward(text,text). Las firmas de
--    menos argumentos quedaron como código muerto (la vieja de redeem_reward
--    aún tenía el bug FOR UPDATE + agregado, pero era inalcanzable).
-- ----------------------------------------------------------------------------
drop function if exists public.book_session(text);
drop function if exists public.book_session(text, text);
drop function if exists public.redeem_reward(text);

-- ============================================================================
-- LISTO. Verificación opcional:
--   -- ya no debe listar las firmas viejas:
--   select proname, pg_get_function_identity_arguments(oid)
--   from pg_proc where proname in ('book_session','redeem_reward') order by 1,2;
-- ============================================================================
