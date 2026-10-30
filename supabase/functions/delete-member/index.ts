// ============================================================================
// Move yA — Edge Function: delete-member   (Verify JWT: ACTIVADO)
// ----------------------------------------------------------------------------
// Elimina a un miembro Y su cuenta de acceso (auth), para que su CORREO quede
// LIBRE y se pueda volver a registrar (p. ej. una persona que estaba como
// alumna y ahora entra como asistente/otro rol).
//
// Seguridad: solo el dueño/gerente (STUDIO_ADMIN/BRANCH_ADMIN) puede borrar, y
// solo a miembros de SU MISMO estudio; nunca al dueño. Usa service role para
// poder borrar la cuenta de auth (que la RLS normal no permite).
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
// ============================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud.user) return json({ ok: false, error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.userId ?? '');
    if (!targetId) return json({ ok: false, error: 'Falta el id' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: target } = await admin.from('users').select('studio_id, role').eq('id', targetId).maybeSingle();
    if (!target) return json({ ok: false, error: 'No encontrado' }, 404);

    const isSelf = targetId === ud.user.id;
    if (isSelf) {
      // Auto-eliminación: cualquier miembro puede borrar SU propia cuenta (y liberar
      // su correo), salvo el DUEÑO del estudio (debe cancelar su suscripción primero).
      if (target.role === 'STUDIO_ADMIN') {
        return json({ ok: false, error: 'El dueño no puede eliminar su cuenta aquí. Cancela tu suscripción primero.' }, 403);
      }
    } else {
      // Borrado por el personal: solo dueño/gerente, del mismo estudio, y nunca al dueño.
      const { data: me } = await admin.from('users').select('studio_id, role').eq('id', ud.user.id).maybeSingle();
      if (!me) return json({ ok: false, error: 'No encontrado' }, 404);
      if (!['STUDIO_ADMIN', 'BRANCH_ADMIN'].includes(me.role)) return json({ ok: false, error: 'Sin permiso' }, 403);
      if (target.studio_id !== me.studio_id) return json({ ok: false, error: 'Otro estudio' }, 403);
      if (target.role === 'STUDIO_ADMIN') return json({ ok: false, error: 'No se puede eliminar al dueño' }, 403);
    }

    // Desliga invitados (2x1) que lo tuvieran como anfitrión.
    try { await admin.from('class_guests').update({ host_user_id: null }).eq('host_user_id', targetId); } catch { /* best-effort */ }

    // Borra la ficha del miembro (tablas con cascade se limpian solas).
    await admin.from('users').delete().eq('id', targetId);

    // Borra su cuenta de acceso (auth) para LIBERAR el correo. Si era un miembro
    // manual (sin login), no existe cuenta de auth: se ignora el error.
    try { await admin.auth.admin.deleteUser(targetId); } catch { /* sin cuenta de auth */ }

    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
