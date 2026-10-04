# Move yA — Auditoría de seguridad y app (4-oct-2026)

Revisión por dentro (código, base de datos, Edge Functions, RLS) y por fuera
(HTTPS/headers, candados por rol y por plan). Ordenado por urgencia.

---

## 🔴 CRÍTICO — arreglar YA

### C1. Escalada de privilegios: un alumno puede volverse admin
- **Qué:** `auth_role()` y `auth_studio_id()` leen el rol/estudio **desde la tabla
  `users`**. La política `users_update` permite que un usuario edite **su propia
  fila** (`id = auth.uid()`), sin restringir columnas, y **no hay trigger** que
  proteja `role`/`studio_id`.
- **Impacto:** Desde la API (no desde la app), un alumno o coach puede hacer
  `UPDATE users SET role='STUDIO_ADMIN'` en su propia fila y **tomar control de su
  estudio** (ver/editar todo, crear paquetes, regalarse créditos y estrellas —
  porque las políticas de escritura confían en `auth_role()`). También podría
  cambiar su `studio_id` y cruzarse a otro estudio.
- **Fix:** trigger `BEFORE UPDATE` que congela `role`/`studio_id`/`coach_status`
  salvo para el admin del estudio y el service role. → `supabase/security-fixes.sql` (sección 1).

---

## 🟠 ALTO

### A1. Estrellas gratis vía `award_goal` + metas con objetivo 0
- **Qué:** El alumno crea sus propias metas (RLS lo permite). El cliente limita el
  objetivo a mínimo 1, **pero por API se puede insertar una meta con
  `target_value = 0`**, y `award_goal` no lo valida → otorga estrellas sin asistir.
- **Impacto:** Estrellas ilimitadas → canjear recompensas gratis (rompe la
  economía de gamificación).
- **Fix aplicado en el SQL:** `award_goal` exige `target >= 1` (sección 2).
- **Residual a decidir (producto):** aun con objetivo ≥ 1, la MISMA asistencia
  cuenta para varias metas que se traslapen (crear N metas, asistir 1 clase →
  5·N estrellas). Opciones: (a) limitar nº de metas activas por alumno, (b) que
  las metas las cree el staff, o (c) no contar una asistencia en más de una meta.
  Dime cuál prefieres y lo implemento.

---

## 🟡 MEDIO

### M1. Funciones internas expuestas por la API
- `roll_recurring_sessions()` (recorre clases recurrentes de **todos** los
  estudios) y `handle_new_user()` (trigger de registro) eran ejecutables por
  `anon`/`authenticated` vía `/rest/v1/rpc/...`. **Fix:** revocar ese EXECUTE
  (solo cron/service role) → `security-fixes.sql` (sección 3).

### M2. Faltan headers de seguridad (navegador)
- El candado 🔒 del navegador **sí está** (Vercel sirve HTTPS con certificado
  válido). Pero faltaban headers de endurecimiento. **Fix (preparado en
  `vercel.json`):** `Strict-Transport-Security`, `X-Frame-Options: DENY`
  (anti-clickjacking del login), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (cámara solo propia, para el QR).

### M3. Función de diagnóstico `wa-diag` en producción
- Es una Edge Function de depuración (la usamos para arreglar el bot). Conviene
  **borrarla** para no exponer información de diagnóstico. (La borro si me dices.)

### M4. `bump_whatsapp_usage` no existe aún
- El tope mensual de mensajes con IA no está en la BD. Solo aplica cuando
  enciendas la IA. SQL listo en `supabase/whatsapp-usage.sql`.

---

## ⚪ BAJO / hardening

- **B1.** Revocar `EXECUTE` de `auth_role`/`auth_studio_id`/`user_in_my_studio`
  a `anon` (fuga mínima de contexto). Incluido en `security-fixes.sql`.
- **B2.** `notify-reminders` (Edge Function cron) tiene `verify_jwt` apagado —
  conviene revisar que valide un secreto o solo la invoque el cron.
- **B3.** Protección de contraseñas filtradas (HaveIBeenPwned) **desactivada** en
  Supabase Auth → activarla (Dashboard → Authentication → Passwords).
- **B4.** Extensión `pg_net` en el esquema `public` (mover a `extensions`) —
  cosmético.

---

## ✅ Lo que está BIEN (candados correctos y verificados)

- **RLS activado en las 22 tablas.** Multi-tenant por estudio con `auth_studio_id()`.
- **Créditos, estrellas, pagos y reservas: blindados** (alumno solo-lectura;
  mutaciones por RPC `book_session`, `cancel_booking`, `redeem_reward`).
- **RPCs sensibles validan identidad/rol en el servidor:** `access_check_in`,
  `cancel_booking`, `redeem_reward`, `mark_routine_done`,
  `confirm_routine_completion` (coach/admin), `award_goal` (dueño).
- **Sin llave de servicio en el frontend.** Solo `anon key` + VAPID pública +
  IDs públicos de Facebook (correcto).
- **`whatsapp_accounts` / `push_sent_log`:** RLS sin política = solo service role.
- **Candados por rol y plan en las rutas:** `RequireRole`, `SubscriptionGate`,
  `PlanGate` (rewards/services/whatsapp/reports). No se abren pantallas por URL.
- **Stripe:** webhook con verificación de firma y ciclo completo (alta, renovación
  mensual/anual, impago, cancelación). `verify_jwt` correcto en cada función.
- **HTTPS 🔒 activo** con certificado válido (Vercel).

---

## Qué preparé (listo para aplicar, aún NO aplicado)
1. `supabase/security-fixes.sql` — C1, A1, M1, B1.
2. `vercel.json` — headers de seguridad (M2).

## Siguiente paso (con tu OK)
- Aplicar `security-fixes.sql` en Supabase (yo lo corro o lo pegas tú).
- Desplegar los headers (commit + merge a main).
- Opcional: borrar `wa-diag`, activar protección de contraseñas, decidir el
  residual de metas (A1).
