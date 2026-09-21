-- ============================================================================
-- Move yA — Tiempo real (Supabase Realtime)
-- ----------------------------------------------------------------------------
-- Activa Realtime en las tablas que la app refleja en pantalla, para que los
-- cambios (reservas, compras, créditos, estrellas, clases, etc.) aparezcan al
-- instante sin recargar. La app se suscribe con la sesión del usuario, así que
-- RLS sigue aplicando: cada quien solo recibe los cambios que puede ver.
--
-- No se incluyen tablas internas/sensibles (whatsapp_accounts, push_*).
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'bookings','class_sessions','class_templates','goals','packages',
    'payments','rewards','star_entries','studios','user_packages','users'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename=t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
    -- Para que UPDATE/DELETE traigan las columnas que RLS necesita para filtrar.
    execute format('alter table public.%I replica identity full', t);
  end loop;
end $$;

-- Verifica:
--   select tablename from pg_publication_tables
--   where pubname='supabase_realtime' and schemaname='public' order by tablename;
-- ============================================================================
