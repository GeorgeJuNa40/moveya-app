-- ============================================================================
-- Move yA — Buzón de sugerencias del alumno
-- ----------------------------------------------------------------------------
-- El alumno envía una sugerencia (categoría + mensaje) y elige si va ANÓNIMA o
-- con su nombre. El estudio la ve y puede RESPONDER. El alumno ve la respuesta
-- en su app (aunque la haya enviado anónima).
--
-- ANONIMATO REAL: guardamos user_id SIEMPRE (para poder entregarle la respuesta
-- al alumno), pero el estudio NO tiene SELECT directo sobre la tabla: lee por el
-- RPC admin_list_suggestions(), que OMITE el nombre y el user_id cuando la
-- sugerencia es anónima. Así ni por la API se filtra la identidad.
--
-- Cómo usarlo: Supabase → SQL Editor → pega TODO → Run. Es seguro re-correrlo.
-- ============================================================================

create table if not exists public.suggestions (
  id          text primary key,
  studio_id   text not null references public.studios(id) on delete cascade,
  user_id     text not null references public.users(id)   on delete cascade,
  anonymous   boolean not null default false,
  category    text not null default 'otro',
  message     text not null,
  status      text not null default 'nueva',   -- nueva | leida | resuelta
  reply       text,
  replied_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_suggestions_studio on public.suggestions (studio_id, created_at desc);
create index if not exists idx_suggestions_user   on public.suggestions (user_id, created_at desc);

alter table public.suggestions enable row level security;

-- Privilegios base (RLS filtra las filas). El alumno inserta y lee; nadie hace
-- UPDATE/DELETE directo (el estudio responde por RPC con permisos elevados).
grant select, insert on public.suggestions to authenticated;

-- El alumno SOLO ve SUS propias sugerencias (y ahí lee la respuesta del estudio).
drop policy if exists suggestions_read_own on public.suggestions;
create policy suggestions_read_own on public.suggestions
  for select using ( user_id = auth.uid()::text );

-- El alumno inserta su propia sugerencia, dentro de su estudio.
drop policy if exists suggestions_insert_own on public.suggestions;
create policy suggestions_insert_own on public.suggestions
  for insert with check (
    user_id = auth.uid()::text
    and studio_id = public.auth_studio_id()
    and public.auth_role() = 'STUDENT'
  );

-- NOTA: el estudio (admin) NO tiene SELECT/UPDATE directo → usa los RPC de abajo.

-- ----------------------------------------------------------------------------
-- RPC para el estudio: lista las sugerencias OMITIENDO la identidad si es anónima.
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_suggestions()
returns table (
  id text, category text, message text, status text, reply text,
  replied_at timestamptz, created_at timestamptz, anonymous boolean, sender_name text
)
language sql stable security definer set search_path = public as $$
  select s.id, s.category, s.message, s.status, s.reply, s.replied_at, s.created_at,
         s.anonymous,
         case when s.anonymous then null
              else (select u.full_name from public.users u where u.id = s.user_id)
         end as sender_name
  from public.suggestions s
  where public.auth_role() = 'STUDIO_ADMIN'
    and s.studio_id = public.auth_studio_id()
  order by s.created_at desc
$$;

-- RPC: el estudio responde una sugerencia (y la marca como resuelta).
create or replace function public.admin_reply_suggestion(p_id text, p_reply text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() <> 'STUDIO_ADMIN' then raise exception 'NOT_ALLOWED'; end if;
  update public.suggestions
     set reply = p_reply, replied_at = now(), status = 'resuelta'
   where id = p_id and studio_id = public.auth_studio_id();
end;
$$;

-- RPC: el estudio cambia el estado (nueva / leida / resuelta).
create or replace function public.admin_set_suggestion_status(p_id text, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() <> 'STUDIO_ADMIN' then raise exception 'NOT_ALLOWED'; end if;
  if p_status not in ('nueva','leida','resuelta') then raise exception 'BAD_STATUS'; end if;
  update public.suggestions set status = p_status
   where id = p_id and studio_id = public.auth_studio_id();
end;
$$;

-- Permisos de los RPC: solo usuarios autenticados (y el guard interno exige admin).
revoke all on function public.admin_list_suggestions()                from anon;
revoke all on function public.admin_reply_suggestion(text, text)      from anon;
revoke all on function public.admin_set_suggestion_status(text, text) from anon;
grant execute on function public.admin_list_suggestions()                to authenticated;
grant execute on function public.admin_reply_suggestion(text, text)      to authenticated;
grant execute on function public.admin_set_suggestion_status(text, text) to authenticated;

-- ============================================================================
-- LISTO. Verifica:
--   select * from public.suggestions;
--   select proname from pg_proc where proname like 'admin_%suggestion%';
-- ============================================================================
