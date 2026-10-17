// ============================================================================
// Move yA — Catálogo GLOBAL "Recomendados Move yA" (plataforma)
// ----------------------------------------------------------------------------
// Links de afiliado o productos de la tienda de la plataforma. Lo administra la
// plataforma (service role); los alumnos solo leen los activos.
// ============================================================================
import { supabase } from './supabase';
import type { PlatformProduct } from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const map = (r: any): PlatformProduct => ({
  id: r.id,
  title: r.title,
  description: r.description ?? undefined,
  imageUrl: r.image_url ?? undefined,
  url: r.url,
  category: r.category ?? undefined,
  priceText: r.price_text ?? undefined,
  active: !!r.active,
  sortOrder: Number(r.sort_order ?? 0),
});

export async function fetchPlatformProducts(): Promise<PlatformProduct[]> {
  const { data, error } = await supabase
    .from('platform_products').select('*').eq('active', true)
    .order('sort_order', { ascending: true }).limit(100);
  if (error) return [];
  return (data ?? []).map(map);
}
