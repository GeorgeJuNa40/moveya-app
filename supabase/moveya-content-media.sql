-- ============================================================================
-- Move yA — Material del post en el Calendario de contenido (Fase 5+)
-- ----------------------------------------------------------------------------
-- Agrega al panel del creador la posibilidad de adjuntar MATERIAL a cada post:
--   • Imágenes: se SUBEN a Storage (bucket público 'moveya-content', tope 15 MB).
--   • Videos/Reels: se guardan como LINK (Drive/YouTube/Vimeo/Dropbox) para NO
--     consumir el almacenamiento (los videos HD no caben en el plan gratis:
--     límite 50 MB/archivo, 1 GB total, 5 GB/mes de egress).
--
-- 'media' es un array JSON de objetos: { kind:'image'|'video', url, name?, path? }
--   - image: url = URL pública, path = ruta en el bucket (para poder borrarla).
--   - video: url = el link pegado.
--
-- Aplicado en vivo (13-nov-2026) vía MCP. Solo el dueño (platform_owner) sube/borra.
-- Idempotente y seguro de re-correr. Pégalo en Supabase → SQL Editor si hace falta.
-- ============================================================================

-- 1) Columna media
alter table public.moveya_content add column if not exists media jsonb not null default '[]'::jsonb;

-- 2) RPC de guardado con media (8 args; convive con la firma anterior de 7).
create or replace function public.moveya_content_save(
  p_id text, p_scheduled_for date, p_channel text, p_title text,
  p_caption text, p_status text, p_link text, p_media jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if coalesce(p_id,'') = '' then
    insert into public.moveya_content (scheduled_for, channel, title, caption, status, link, media)
    values (coalesce(p_scheduled_for, current_date), coalesce(nullif(p_channel,''),'instagram'),
            nullif(p_title,''), nullif(p_caption,''), coalesce(nullif(p_status,''),'idea'),
            nullif(p_link,''), coalesce(p_media,'[]'::jsonb))
    returning id into v_id;
  else
    update public.moveya_content set
      scheduled_for = coalesce(p_scheduled_for, current_date),
      channel = coalesce(nullif(p_channel,''),'instagram'),
      title = nullif(p_title,''), caption = nullif(p_caption,''),
      status = coalesce(nullif(p_status,''),'idea'), link = nullif(p_link,''),
      media = coalesce(p_media,'[]'::jsonb), updated_at = now()
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $$;
revoke execute on function public.moveya_content_save(text,date,text,text,text,text,text,jsonb) from public, anon;
grant  execute on function public.moveya_content_save(text,date,text,text,text,text,text,jsonb) to authenticated;

-- 3) Bucket público para imágenes (tope 15 MB, solo imágenes).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moveya-content','moveya-content', true, 15728640,
        array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 4) Permisos del bucket: solo el dueño sube/borra; lectura pública.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='moveya_content_owner_write') then
    create policy "moveya_content_owner_write" on storage.objects for insert to authenticated
      with check (bucket_id='moveya-content' and public.is_platform_owner());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='moveya_content_owner_del') then
    create policy "moveya_content_owner_del" on storage.objects for delete to authenticated
      using (bucket_id='moveya-content' and public.is_platform_owner());
  end if;
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='moveya_content_read') then
    create policy "moveya_content_read" on storage.objects for select to anon, authenticated
      using (bucket_id='moveya-content');
  end if;
end $$;
