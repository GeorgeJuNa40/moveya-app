-- ============================================================================
-- Move yA — Aislamiento por sucursal (endurecer RLS del Gerente / BRANCH_ADMIN)
-- ----------------------------------------------------------------------------
-- auth_role() mapea BRANCH_ADMIN -> STUDIO_ADMIN para que el gerente pueda
-- ADMINISTRAR su estudio a nivel de BD. Eso le daba acceso (a nivel de BD) a
-- TODAS las sucursales; la app solo filtraba la vista. Aquí agregamos políticas
-- RESTRICTIVE (se AND-ean con las permisivas existentes) para confinar al
-- BRANCH_ADMIN a los datos de SU sucursal, sin cambiar nada para el dueño,
-- coaches o alumnos.
--
-- Seguro de aplicar: no toca las políticas existentes y hoy no hay ningún
-- BRANCH_ADMIN, así que no afecta a ningún usuario actual.
-- ============================================================================

-- Rol REAL (sin mapear) del usuario en sesión.
create or replace function public.auth_real_role()
returns text language sql stable security definer set search_path to 'public'
as $$ select role::text from public.users where id = auth.uid()::text $$;

-- Sucursal del usuario en sesión (el gerente la tiene; el dueño no).
create or replace function public.auth_branch()
returns text language sql stable security definer set search_path to 'public'
as $$ select branch_id from public.users where id = auth.uid()::text $$;

-- ¿El usuario NO es gerente de sucursal? (para no restringir a los demás).
create or replace function public.not_branch_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select not coalesce(public.auth_real_role() = 'BRANCH_ADMIN', false) $$;

-- ¿La fila (de un miembro) pertenece a la sucursal del gerente? Para quien NO es
-- gerente, siempre true (no se restringe).
create or replace function public.branch_owns_user(p_user_id text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select public.not_branch_admin()
    or exists (
      select 1 from public.users u
      where u.id = p_user_id and u.branch_id = public.auth_branch()
    )
$$;

-- --- Aislamiento de los MIEMBROS por sucursal ---
create policy branch_isolation on public.users as restrictive for all
  using (public.not_branch_admin() or branch_id = public.auth_branch())
  with check (public.not_branch_admin() or branch_id = public.auth_branch());

-- --- Aislamiento de los DATOS de miembros (por user_id) ---
create policy branch_isolation on public.payments           as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.user_packages       as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.bookings            as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.star_entries        as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.goals               as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.suggestions         as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.member_measurements as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.routines            as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.routine_completions as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.access_checkins     as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));
create policy branch_isolation on public.store_orders        as restrictive for all using (public.branch_owns_user(user_id)) with check (public.branch_owns_user(user_id));

-- --- El gerente NO modifica la configuración del negocio (es del dueño) ---
-- (SELECT no se restringe: necesita leer paquetes/productos para operar.)
create policy no_branch_settings on public.studios as restrictive for update
  using (public.not_branch_admin()) with check (public.not_branch_admin());

create policy no_branch_pkg_ins on public.packages as restrictive for insert with check (public.not_branch_admin());
create policy no_branch_pkg_upd on public.packages as restrictive for update using (public.not_branch_admin()) with check (public.not_branch_admin());
create policy no_branch_pkg_del on public.packages as restrictive for delete using (public.not_branch_admin());

create policy no_branch_prod_ins on public.products as restrictive for insert with check (public.not_branch_admin());
create policy no_branch_prod_upd on public.products as restrictive for update using (public.not_branch_admin()) with check (public.not_branch_admin());
create policy no_branch_prod_del on public.products as restrictive for delete using (public.not_branch_admin());
