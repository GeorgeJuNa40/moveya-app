-- ============================================================================
-- Move yA — Catálogo GLOBAL "Recomendados Move yA" (de la plataforma)
-- ----------------------------------------------------------------------------
-- Productos/links que administra SOLO la plataforma (tú). No pertenecen a ningún
-- estudio, así que no compiten con los productos de tus clientes. Cada estudio
-- decide si los muestra a sus alumnos (toggle en Configuración → "Recomendados
-- Move yA"). Sirve para links de afiliado o para tu propia tienda en línea.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Seguro re-correrlo.
-- ============================================================================
create table if not exists public.platform_products (
  id          text primary key default (gen_random_uuid())::text,
  title       text not null,
  description text,
  image_url   text,
  url         text not null,
  category    text,
  price_text  text,
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_platform_products_active on public.platform_products (active, sort_order);

alter table public.platform_products enable row level security;
grant select on public.platform_products to authenticated;

drop policy if exists platform_products_read on public.platform_products;
create policy platform_products_read on public.platform_products
  for select using (active = true);

-- ----------------------------------------------------------------------------
-- CÓMO AGREGAR PRODUCTOS (ejemplo). Cambia los valores y descomenta para usar.
-- El 'url' es tu link de afiliado (o de tu tienda). 'sort_order' ordena (menor
-- primero). 'active=false' lo oculta sin borrarlo.
-- ----------------------------------------------------------------------------
-- insert into public.platform_products (title, description, image_url, url, category, price_text, sort_order) values
--   ('Proteína Whey 1kg', 'Proteína de suero, sabor chocolate.', 'https://.../img.jpg', 'https://tu-link-afiliado...', 'Suplementos', '$499 MXN', 1),
--   ('Banda de resistencia', 'Set de 3 bandas para entrenamiento.', 'https://.../img.jpg', 'https://tu-link-afiliado...', 'Accesorios', 'Desde $199', 2);

-- ----------------------------------------------------------------------------
-- CANDADO PERMANENTE por estudio: el estudio DECIDE unirse al programa y, una
-- vez dentro, no se puede revertir (así tus productos no se quitan a capricho).
-- ----------------------------------------------------------------------------
alter table public.studios add column if not exists moveya_picks boolean not null default false;

-- El estudio acepta el programa (one-way). Solo prende; nunca apaga.
create or replace function public.accept_moveya_picks()
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() <> 'STUDIO_ADMIN' then raise exception 'NOT_ALLOWED'; end if;
  update public.studios set moveya_picks = true where id = public.auth_studio_id();
end;
$$;
revoke all on function public.accept_moveya_picks() from anon;
grant execute on function public.accept_moveya_picks() to authenticated;

-- Blindaje: una vez true, no se puede volver a false (ni por API directa).
create or replace function public.lock_moveya_picks()
returns trigger language plpgsql as $$
begin
  if OLD.moveya_picks = true and NEW.moveya_picks = false then
    NEW.moveya_picks := true;
  end if;
  return NEW;
end;
$$;
drop trigger if exists trg_lock_moveya_picks on public.studios;
create trigger trg_lock_moveya_picks before update on public.studios
  for each row execute function public.lock_moveya_picks();
-- Para TÚ (plataforma) encender el programa a un estudio puntual (service role):
--   update public.studios set moveya_picks = true where id = '<studio_id>';
-- ============================================================================
