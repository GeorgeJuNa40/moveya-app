-- ============================================================================
-- Move yA — Subcuentas / perfiles vinculados (familiares)
-- ----------------------------------------------------------------------------
-- Un titular (papá/hijo) gestiona varios perfiles con una sola cuenta: él mismo
-- y sus familiares (un menor, un adulto mayor). Los familiares NO tienen login
-- (no ocupan correo). El titular puede ver su membresía, reservar, cancelar y
-- canjear por cada familiar. El servidor valida SIEMPRE que el titular de verdad
-- gestione a ese familiar (managed_by = auth.uid()).
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- (El ALTER POLICY no se puede "des-aplicar" solo; es aditivo y seguro.)
-- ============================================================================
alter table public.users add column if not exists managed_by text references public.users(id) on delete set null;

-- ¿El que llama GESTIONA a p_user? (p_user es un familiar suyo)
create or replace function public.auth_manages(p_user text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = p_user and managed_by = auth.uid()::text)
$$;
revoke all on function public.auth_manages(text) from anon;
grant execute on function public.auth_manages(text) to authenticated;

-- LECTURAS: el titular ve también los datos de sus familiares (aditivo).
alter policy bookings_read on public.bookings using (
  (user_id = (auth.uid())::text) OR public.auth_manages(user_id)
  OR ((public.auth_role() = ANY (ARRAY['STUDIO_ADMIN','COACH'])) AND public.user_in_my_studio(user_id)));
alter policy user_packages_read on public.user_packages using (
  (user_id = (auth.uid())::text) OR public.auth_manages(user_id)
  OR ((public.auth_role() = ANY (ARRAY['STUDIO_ADMIN','COACH'])) AND public.user_in_my_studio(user_id)));
alter policy star_entries_read on public.star_entries using (
  (user_id = (auth.uid())::text) OR public.auth_manages(user_id)
  OR ((public.auth_role() = ANY (ARRAY['STUDIO_ADMIN','COACH'])) AND public.user_in_my_studio(user_id)));
alter policy goals_access on public.goals
  using ((user_id = (auth.uid())::text) OR public.auth_manages(user_id)
    OR ((public.auth_role() = ANY (ARRAY['STUDIO_ADMIN','COACH'])) AND public.user_in_my_studio(user_id)))
  with check ((user_id = (auth.uid())::text) OR public.auth_manages(user_id)
    OR ((public.auth_role() = ANY (ARRAY['STUDIO_ADMIN','COACH'])) AND public.user_in_my_studio(user_id)));

-- Crear / editar un familiar (vía RPC, con validación). El correo es interno y
-- único (no sirve para login).
create or replace function public.create_managed_member(p_name text, p_birthdate text, p_initials text)
returns text language plpgsql security definer set search_path = public as $$
declare v_actor text := auth.uid()::text; v_studio text; v_id text;
begin
  if v_actor is null then raise exception 'NOT_ALLOWED'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'BAD_NAME'; end if;
  select studio_id into v_studio from public.users where id = v_actor;
  if v_studio is null then raise exception 'NOT_ALLOWED'; end if;
  v_id := gen_random_uuid()::text;
  insert into public.users (id, studio_id, role, full_name, email, phone, avatar_initials, birth_date, managed_by)
  values (v_id, v_studio, 'STUDENT', trim(p_name), 'fam.'||v_id||'@no-login.moveya', '',
          coalesce(nullif(p_initials,''), upper(left(trim(p_name),1))),
          nullif(p_birthdate,'')::date, v_actor);
  return v_id;
end $$;
grant execute on function public.create_managed_member(text,text,text) to authenticated;

create or replace function public.update_managed_member(p_user text, p_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.auth_manages(p_user) then raise exception 'NOT_ALLOWED'; end if;
  update public.users set
    full_name = coalesce(nullif(trim(p_name),''), full_name),
    phone = coalesce(p_phone, phone)
  where id = p_user;
end $$;
grant execute on function public.update_managed_member(text,text,text) to authenticated;

-- Lista de espera por RPC (titular y familiares). También arregla el caso del
-- alumno normal (antes la inserción directa chocaba con la RLS).
create or replace function public.join_waitlist(p_session_id text, p_user text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_actor text := auth.uid()::text; v_uid text := coalesce(p_user, auth.uid()::text);
  v_studio text; v_exist text; v_exist_st text; v_booking text;
begin
  if v_actor is null then raise exception 'NOT_ALLOWED'; end if;
  if v_uid <> v_actor and not public.auth_manages(v_uid) then raise exception 'NOT_ALLOWED'; end if;
  select studio_id into v_studio from public.class_sessions where id = p_session_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;
  select id, status into v_exist, v_exist_st from public.bookings where user_id = v_uid and session_id = p_session_id;
  if v_exist is not null and v_exist_st <> 'CANCELED' then
    return json_build_object('booking_id', v_exist, 'status', v_exist_st);
  end if;
  if v_exist is not null then
    update public.bookings set status='WAITLIST', user_package_id=null where id=v_exist; v_booking := v_exist;
  else
    v_booking := gen_random_uuid()::text;
    insert into public.bookings (id, user_id, session_id, user_package_id, status)
      values (v_booking, v_uid, p_session_id, null, 'WAITLIST');
  end if;
  return json_build_object('booking_id', v_booking, 'status', 'WAITLIST');
end $$;
grant execute on function public.join_waitlist(text,text) to authenticated;

create or replace function public.leave_waitlist(p_booking_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner text; v_st text;
begin
  select user_id, status into v_owner, v_st from public.bookings where id = p_booking_id for update;
  if v_owner is null then raise exception 'NOT_FOUND'; end if;
  if v_owner <> auth.uid()::text and not public.auth_manages(v_owner) then raise exception 'NOT_ALLOWED'; end if;
  if v_st = 'WAITLIST' then update public.bookings set status='CANCELED' where id = p_booking_id; end if;
end $$;
grant execute on function public.leave_waitlist(text) to authenticated;

-- ============================================================================
-- Además, en este despliegue se actualizaron (ver sus archivos / el panel):
--   • book_session(p_session_id, p_spot, p_user)  — reservar por un familiar.
--   • cancel_booking(p_booking_id)                — permite cancelar al titular.
--   • redeem_reward(p_reward_id, p_user)          — canjear por un familiar.
-- Todas validan auth_manages(p_user) del lado del servidor.
-- ============================================================================
