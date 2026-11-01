-- ============================================================================
-- Move yA — CRM de leads (Panel de creador) · prospectos de estudios/gyms
-- ----------------------------------------------------------------------------
-- Tabla de prospectos (estudios que aún no se registran) con su etapa en el
-- embudo y notas. Solo la gestiona el DUEÑO DE PLATAFORMA, vía RPC SECURITY
-- DEFINER (se valida platform_owner). La tabla no expone políticas de RLS, así
-- que nadie la toca por API directa: todo pasa por las funciones.
--
-- Depende de is_platform_owner() (se crea en moveya-products-admin.sql).
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

create table if not exists public.moveya_leads (
  id            text primary key default (gen_random_uuid())::text,
  name          text not null,              -- nombre del estudio/gym o del prospecto
  owner_name    text,                       -- nombre de la persona de contacto
  phone         text,
  email         text,
  city          text,
  status        text not null default 'nuevo', -- nuevo|contactado|demo|prueba|pagando|perdido
  source        text,                       -- de dónde llegó: whatsapp, instagram, referido...
  notes         text,
  next_followup date,                       -- próximo seguimiento
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_moveya_leads_status on public.moveya_leads (status, next_followup);

alter table public.moveya_leads enable row level security;
-- Sin políticas a propósito: solo el service role y las RPC del dueño acceden.

-- Listar todos los leads — solo el dueño.
create or replace function public.moveya_leads_all()
returns setof public.moveya_leads
language sql security definer set search_path = public stable as $$
  select * from public.moveya_leads
  where public.is_platform_owner()
  order by
    case status
      when 'prueba' then 0 when 'demo' then 1 when 'contactado' then 2
      when 'nuevo' then 3 when 'pagando' then 4 else 5 end,
    coalesce(next_followup, '9999-12-31'::date),
    created_at desc;
$$;

-- Crear (id vacío) o editar un lead.
create or replace function public.moveya_lead_save(
  p_id text, p_name text, p_owner_name text, p_phone text, p_email text,
  p_city text, p_status text, p_source text, p_notes text, p_next_followup date
) returns text
language plpgsql security definer set search_path = public as $$
declare v_id text;
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'falta el nombre'; end if;

  if coalesce(p_id, '') = '' then
    insert into public.moveya_leads (name, owner_name, phone, email, city, status, source, notes, next_followup)
    values (p_name, nullif(p_owner_name,''), nullif(p_phone,''), nullif(p_email,''), nullif(p_city,''),
            coalesce(nullif(p_status,''),'nuevo'), nullif(p_source,''), nullif(p_notes,''), p_next_followup)
    returning id into v_id;
  else
    update public.moveya_leads set
      name = p_name, owner_name = nullif(p_owner_name,''), phone = nullif(p_phone,''),
      email = nullif(p_email,''), city = nullif(p_city,''),
      status = coalesce(nullif(p_status,''),'nuevo'), source = nullif(p_source,''),
      notes = nullif(p_notes,''), next_followup = p_next_followup, updated_at = now()
    where id = p_id returning id into v_id;
  end if;
  return v_id;
end; $$;

-- Borrar un lead.
create or replace function public.moveya_lead_delete(p_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  delete from public.moveya_leads where id = p_id;
end; $$;

revoke execute on function public.moveya_leads_all()                                              from public, anon;
revoke execute on function public.moveya_lead_save(text,text,text,text,text,text,text,text,text,date) from public, anon;
revoke execute on function public.moveya_lead_delete(text)                                         from public, anon;
grant  execute on function public.moveya_leads_all()                                              to authenticated;
grant  execute on function public.moveya_lead_save(text,text,text,text,text,text,text,text,text,date) to authenticated;
grant  execute on function public.moveya_lead_delete(text)                                         to authenticated;
