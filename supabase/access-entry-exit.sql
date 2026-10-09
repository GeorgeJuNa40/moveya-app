-- ============================================================================
-- Move yA — Accesos de gimnasio: ENTRADA y SALIDA + aforo en tiempo real
-- ----------------------------------------------------------------------------
-- Antes el check-in solo registraba ENTRADA. Ahora cada fila de access_checkins
-- es una VISITA: created_at = entrada, exited_at = salida (NULL = sigue dentro).
-- El mismo QR hace toggle: 1er escaneo = entrada, 2º = salida. "Aforo" = visitas
-- sin salida (iniciadas en las últimas 16 h). Permanencia = exited_at - created_at.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================

alter table public.access_checkins add column if not exists exited_at timestamptz;

create or replace function public.access_check_in(p_user_id text default null::text, p_method text default 'member_qr'::text)
returns json language plpgsql security definer set search_path to 'public' as $function$
declare
  v_caller text := auth.uid()::text;
  v_target text;
  v_studio text;
  v_name   text;
  v_active boolean;
  v_open_id text;
  v_open_created timestamptz;
  v_last_exit timestamptz;
  v_id text;
  v_mins int;
begin
  if v_caller is null then raise exception 'NOT_ALLOWED'; end if;
  v_target := coalesce(nullif(p_user_id, ''), v_caller);

  select studio_id, full_name into v_studio, v_name from public.users where id = v_target;
  if v_studio is null then raise exception 'NOT_FOUND'; end if;

  if v_target <> v_caller then
    if not (public.auth_role() in ('STUDIO_ADMIN','COACH') and public.auth_studio_id() = v_studio) then
      raise exception 'NOT_ALLOWED';
    end if;
  end if;

  select exists(
    select 1 from public.user_packages
    where user_id = v_target and active = true and expires_at > now()
  ) into v_active;

  -- Visita abierta "de hoy": dentro = sin salida e iniciada en las ultimas 16 h.
  select id, created_at into v_open_id, v_open_created
  from public.access_checkins
  where studio_id = v_studio and user_id = v_target
    and exited_at is null and created_at > now() - interval '16 hours'
  order by created_at desc limit 1;

  if v_open_id is not null then
    -- Esta dentro -> SALIDA (anti-rebote: si acaba de entrar hace <30 s, ignora).
    if v_open_created > now() - interval '30 seconds' then
      return json_build_object('action','in','duplicate',true,'active',v_active,'name',v_name,'checkin_id',v_open_id);
    end if;
    update public.access_checkins set exited_at = now() where id = v_open_id;
    v_mins := greatest(0, floor(extract(epoch from (now() - v_open_created)) / 60)::int);
    return json_build_object('action','out','duplicate',false,'active',v_active,'name',v_name,'checkin_id',v_open_id,'duration_min',v_mins);
  end if;

  -- No esta dentro -> ENTRADA (anti-rebote: si salio hace <30 s, ignora).
  select exited_at into v_last_exit
  from public.access_checkins
  where studio_id = v_studio and user_id = v_target and exited_at is not null
  order by exited_at desc limit 1;
  if v_last_exit is not null and v_last_exit > now() - interval '30 seconds' then
    return json_build_object('action','out','duplicate',true,'active',v_active,'name',v_name);
  end if;

  v_id := gen_random_uuid()::text;
  insert into public.access_checkins (id, studio_id, user_id, method)
    values (v_id, v_studio, v_target, coalesce(nullif(p_method, ''), 'member_qr'));
  return json_build_object('action','in','duplicate',false,'active',v_active,'name',v_name,'checkin_id',v_id);
end;
$function$;
