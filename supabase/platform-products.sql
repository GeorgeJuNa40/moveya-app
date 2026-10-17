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
-- ============================================================================
