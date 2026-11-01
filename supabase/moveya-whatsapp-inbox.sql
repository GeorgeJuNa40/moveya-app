-- ============================================================================
-- Move yA — WhatsApp de ventas · entrega 2: BANDEJA (leer/responder)
-- ----------------------------------------------------------------------------
-- RPCs para que el DUEÑO lea la bandeja del estudio oculto 'moveya-platform'
-- (conversaciones + mensajes), marque leído y cambie el modo bot/humano. El
-- ENVÍO de respuestas va por la Edge Function whatsapp-send (adaptada para
-- permitir al platform_owner responder a 'moveya-platform').
--
-- Depende de is_platform_owner() y del estudio 'moveya-platform'.
-- Deploy: pégalo en Supabase → SQL Editor. Aditivo y seguro.
-- ============================================================================

-- Lista de conversaciones del WhatsApp de Move yA.
create or replace function public.moveya_wa_convos()
returns setof public.wa_conversations
language sql security definer set search_path = public stable as $$
  select * from public.wa_conversations
  where public.is_platform_owner() and studio_id = 'moveya-platform'
  order by last_message_at desc nulls last;
$$;

-- Mensajes de una conversación (valida que sea de Move yA).
create or replace function public.moveya_wa_thread(p_convo text)
returns setof public.wa_messages
language sql security definer set search_path = public stable as $$
  select m.* from public.wa_messages m
  where public.is_platform_owner() and m.studio_id = 'moveya-platform' and m.conversation_id = p_convo
  order by m.created_at asc;
$$;

-- Marca la conversación como leída (sin pendientes).
create or replace function public.moveya_wa_mark_read(p_convo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  update public.wa_conversations set unread = 0 where id = p_convo and studio_id = 'moveya-platform';
end; $$;

-- Cambia el modo de la conversación: 'bot' (responde el asistente) o 'human'.
create or replace function public.moveya_wa_set_mode(p_convo text, p_mode text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_owner() then raise exception 'no autorizado'; end if;
  if p_mode not in ('bot','human') then raise exception 'modo invalido'; end if;
  update public.wa_conversations set mode = p_mode where id = p_convo and studio_id = 'moveya-platform';
end; $$;

revoke execute on function public.moveya_wa_convos()                from public, anon;
revoke execute on function public.moveya_wa_thread(text)            from public, anon;
revoke execute on function public.moveya_wa_mark_read(text)         from public, anon;
revoke execute on function public.moveya_wa_set_mode(text, text)    from public, anon;
grant  execute on function public.moveya_wa_convos()                to authenticated;
grant  execute on function public.moveya_wa_thread(text)            to authenticated;
grant  execute on function public.moveya_wa_mark_read(text)         to authenticated;
grant  execute on function public.moveya_wa_set_mode(text, text)    to authenticated;
