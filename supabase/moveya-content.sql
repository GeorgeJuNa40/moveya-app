-- ============================================================================
-- Move yA — Calendario de contenido (Panel de creador) · Fase 5
-- ----------------------------------------------------------------------------
-- Planificador de publicaciones para las redes de Move yA (Instagram, Facebook,
-- TikTok…). Es un PLANIFICADOR: guardas idea, fecha, canal, copy y estado. La
-- auto-publicación real depende de aprobación de Meta/TikTok, así que por ahora
-- organizas y copias el texto a mano. Solo lo gestiona el DUEÑO (platform_owner).
--
-- Depende de is_platform_owner(). Aditivo y seguro. Pégalo en SQL Editor.
-- ============================================================================

create table if not exists public.moveya_content (
  id            text primary key default (gen_random_uuid())::text,
  scheduled_for date not null default current_date, -- cuándo se planea publicar
  channel       text not null default 'instagram',  -- instagram|facebook|tiktok|whatsapp|otro
  title         text,                               -- título/idea interna
  caption       text,                               -- el copy a publicar
  status        text not null default 'idea',       -- idea|listo|publicado
  link          text,                               -- link al post ya publicado (opcional)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_moveya_content_date on public.moveya_content (scheduled_for, status);

alter table public.moveya_content enable row level security;
-- Sin políticas: solo service role y las RPC del dueño.

-- Listar todo (ordenado por fecha planeada).
create or replace function public.moveya_content_all()
returns setof public.moveya_content
language sql security definer set search_path = public stable as $$
  select * from public.moveya_content
  where public.is_platform_owner()
  order by scheduled_for asc, created_at asc;
$$;

-- Crear (id vacío) o editar una publicación.
create or replace function public.moveya_content_save(
  p_id text, p_scheduled_for date, p_channel text, p_title text,
  p_caption text, p_status text, p_link text
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if coalesce(p_id, '') = '' then
    insert into public.moveya_content (scheduled_for, channel, title, caption, status, link)
    values (coalesce(p_scheduled_for, current_date), coalesce(nullif(p_channel,''),'instagram'),
            nullif(p_title,''), nullif(p_caption,''), coalesce(nullif(p_status,''),'idea'), nullif(p_link,''))
    returning id into v_id;
  else
    update public.moveya_content set
      scheduled_for = coalesce(p_scheduled_for, current_date),
      channel = coalesce(nullif(p_channel,''),'instagram'),
      title = nullif(p_title,''), caption = nullif(p_caption,''),
      status = coalesce(nullif(p_status,''),'idea'), link = nullif(p_link,''),
      updated_at = now()
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $$;

-- Borrar una publicación.
create or replace function public.moveya_content_delete(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  delete from public.moveya_content where id = p_id;
end; $$;

revoke execute on function public.moveya_content_all()                              from public, anon;
revoke execute on function public.moveya_content_save(text,date,text,text,text,text,text) from public, anon;
revoke execute on function public.moveya_content_delete(text)                       from public, anon;
grant  execute on function public.moveya_content_all()                              to authenticated;
grant  execute on function public.moveya_content_save(text,date,text,text,text,text,text) to authenticated;
grant  execute on function public.moveya_content_delete(text)                       to authenticated;
