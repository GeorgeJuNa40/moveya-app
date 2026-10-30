// ============================================================================
// Move yA — Edge Function: set-member-email   (Verify JWT: ACTIVADO)
// ----------------------------------------------------------------------------
// Cambia el CORREO de un miembro corrigiendo TAMBIÉN su cuenta de acceso (Auth),
// no solo la ficha. Sirve para arreglar un correo mal capturado sin tener que
// borrar y re-registrar.
//
// Seguridad: solo el dueño/gerente (STUDIO_ADMIN/BRANCH_ADMIN) del MISMO estudio;
// no se cambia el correo del dueño por aquí. Usa service role para tocar Auth.
//
// Respuestas: { ok:true, authUpdated } · { ok:false, error }
//   - Si el correo nuevo ya está en uso → ok:false con mensaje claro.
//   - Si el miembro es manual (sin cuenta de acceso) → solo se actualiza la ficha.
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

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Método no permitido' }, 405);
  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: ud } = await asUser.auth.getUser();
    if (!ud.user) return json({ ok: false, error: 'No autorizado' }, 401);

    const body = await req.json().catch(() => ({}));
    const targetId = String(body.userId ?? '');
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!targetId) return json({ ok: false, error: 'Falta el id' }, 400);
    if (!emailOk(email)) return json({ ok: false, error: 'Correo no válido.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: me } = await admin.from('users').select('studio_id, role').eq('id', ud.user.id).maybeSingle();
    const { data: target } = await admin.from('users').select('studio_id, role').eq('id', targetId).maybeSingle();
    if (!me || !target) return json({ ok: false, error: 'No encontrado' }, 404);

    // Solo dueño/gerente, del mismo estudio. El correo del dueño no se cambia aquí.
    if (!['STUDIO_ADMIN', 'BRANCH_ADMIN'].includes(me.role)) return json({ ok: false, error: 'Sin permiso' }, 403);
    if (target.studio_id !== me.studio_id) return json({ ok: false, error: 'Otro estudio' }, 403);
    if (target.role === 'STUDIO_ADMIN') return json({ ok: false, error: 'El correo del dueño no se cambia por aquí.' }, 403);

    // 1) Actualiza el correo de ACCESO (Auth). Si el miembro no tiene cuenta de
    //    acceso (alta manual), devuelve "not found": se ignora y solo se guarda la ficha.
    let authUpdated = false;
    const { error: authErr } = await admin.auth.admin.updateUserById(targetId, { email, email_confirm: true });
    if (authErr) {
      const msg = (authErr.message || '').toLowerCase();
      if (/not found|user not found/.test(msg)) {
        authUpdated = false; // miembro manual sin login → seguimos con la ficha
      } else if (/registered|already|exists|duplicate/.test(msg)) {
        return json({ ok: false, error: 'Ese correo ya está en uso por otra cuenta.' }, 409);
      } else {
        return json({ ok: false, error: authErr.message }, 400);
      }
    } else {
      authUpdated = true;
    }

    // 2) Actualiza la ficha (contacto).
    const { error: rowErr } = await admin.from('users').update({ email }).eq('id', targetId);
    if (rowErr) return json({ ok: false, error: rowErr.message }, 400);

    return json({ ok: true, authUpdated });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
