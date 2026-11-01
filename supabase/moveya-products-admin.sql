-- ============================================================================
-- Move yA — Gestión del catálogo "Recomendados Move yA" desde el Panel de creador
-- ----------------------------------------------------------------------------
-- La tabla platform_products solo la podía escribir el service role (a mano por
-- SQL). Estas RPC permiten al DUEÑO DE PLATAFORMA administrarla desde la app
-- (listar todo, crear/editar y borrar), validando platform_owner. Los alumnos
-- siguen viendo solo los activos (política de lectura existente, sin cambios).
--
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

-- Helper: ¿el que llama es dueño de plataforma?
create or replace function public.is_platform_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select platform_owner from public.users where id = (auth.uid())::text), false);
$$;

-- Listar TODO el catálogo (incluye inactivos) — solo el dueño.
create or replace function public.moveya_products_all()
returns setof public.platform_products
language sql
security definer
set search_path = public
stable
as $$
  select * from public.platform_products
  where public.is_platform_owner()
  order by sort_order, created_at;
$$;

-- Crear o editar un producto. Si p_id viene vacío/null → crea; si no → edita.
create or replace function public.moveya_product_save(
  p_id          text,
  p_title       text,
  p_description text,
  p_image_url   text,
  p_url         text,
  p_category    text,
  p_price_text  text,
  p_active      boolean,
  p_sort        int
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_id text;
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_url), '') = '' then
    raise exception 'faltan datos (título y link son obligatorios)';
  end if;

  if coalesce(p_id, '') = '' then
    insert into public.platform_products (title, description, image_url, url, category, price_text, active, sort_order)
    values (p_title, nullif(p_description, ''), nullif(p_image_url, ''), p_url,
            nullif(p_category, ''), nullif(p_price_text, ''), coalesce(p_active, true), coalesce(p_sort, 0))
    returning id into v_id;
  else
    update public.platform_products set
      title = p_title,
      description = nullif(p_description, ''),
      image_url = nullif(p_image_url, ''),
      url = p_url,
      category = nullif(p_category, ''),
      price_text = nullif(p_price_text, ''),
      active = coalesce(p_active, true),
      sort_order = coalesce(p_sort, 0)
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Borrar un producto.
create or replace function public.moveya_product_delete(p_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  delete from public.platform_products where id = p_id;
end;
$$;

-- Permisos: las llama el dueño (autenticado); la validación interna es el candado.
revoke execute on function public.is_platform_owner()                                   from public, anon;
revoke execute on function public.moveya_products_all()                                 from public, anon;
revoke execute on function public.moveya_product_save(text,text,text,text,text,text,text,boolean,int) from public, anon;
revoke execute on function public.moveya_product_delete(text)                           from public, anon;
grant  execute on function public.is_platform_owner()                                   to authenticated;
grant  execute on function public.moveya_products_all()                                 to authenticated;
grant  execute on function public.moveya_product_save(text,text,text,text,text,text,text,boolean,int) to authenticated;
grant  execute on function public.moveya_product_delete(text)                           to authenticated;
