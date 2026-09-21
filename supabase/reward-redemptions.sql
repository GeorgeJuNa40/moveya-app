-- ============================================================================
-- Move yA — Visibilidad de recompensas para el estudio
-- ----------------------------------------------------------------------------
-- Guarda QUÉ recompensa se canjeó en cada movimiento de estrellas, para que el
-- estudio vea en "Recompensas" quién canjeó qué. Las políticas actuales ya
-- permiten al personal (admin/coach) leer las estrellas y metas de sus alumnos.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-ejecutarlo.
-- ============================================================================

alter table public.star_entries add column if not exists reward_id text references public.rewards(id);

-- redeem_reward: registra reward_id en el canje (validando saldo en el servidor).
create or replace function public.redeem_reward(p_reward_id text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_studio text; v_cost int; v_active boolean; v_balance int; v_entry text;
begin
  if v_uid is null then raise exception 'NOT_ALLOWED'; end if;
  select studio_id, star_cost, active into v_studio, v_cost, v_active from public.rewards where id = p_reward_id;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;
  if v_studio <> public.auth_studio_id() then raise exception 'NOT_ALLOWED'; end if;
  if v_active is not true then raise exception 'NOT_ACTIVE'; end if;
  select coalesce(sum(delta), 0) into v_balance from public.star_entries where user_id = v_uid for update;
  if v_balance < v_cost then raise exception 'NO_STARS'; end if;
  v_entry := gen_random_uuid()::text;
  insert into public.star_entries (id, user_id, delta, reason, reward_id)
    values (v_entry, v_uid, -v_cost, 'redemption', p_reward_id);
  return json_build_object('entry_id', v_entry, 'new_balance', v_balance - v_cost);
end $$;
grant execute on function public.redeem_reward(text) to authenticated;
-- ============================================================================
