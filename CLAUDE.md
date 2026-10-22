# Move yA — contexto del proyecto

SaaS multi-rol para estudios de Pilates/fitness (Estudio-Admin, Coach, Alumno).
Este archivo lo lee Claude Code al abrir el repo: sirve para retomar el proyecto
en cualquier sesión nueva. Escribir en español (el producto es en español).

## Stack
- **Front:** React 18 + TypeScript + Vite 5 + Tailwind 3 + React Router 6 (**HashRouter**).
- **Backend:** Supabase (Postgres + Auth + RLS multi-tenant por estudio + Edge Functions en Deno).
- **Pagos:** Stripe Connect (Express, cargos directos a cada estudio) + suscripción SaaS.
- **WhatsApp:** Meta Cloud API + bot con Claude **Haiku 4.5** (Edge Function).
- **Hosting:** Vercel (deploya desde `main`).

## Cómo desplegar (flujo probado)
1. Trabaja en la rama `claude/moveya-pilates-mvp-nlye5l`.
2. `npm run build` para validar (corre `tsc -b`).
3. `git push` normal funciona en esta sesión. Luego PR (head=rama, base=`main`)
   y **merge squash** → Vercel despliega producción.
4. Tras merge: `git fetch origin main && git checkout -B <rama> origin/main` y
   `git push --force-with-lease` para re-sincronizar (el squash reescribe historia).
- **Edge Functions y SQL** se despliegan a mano: el usuario pega el código en el
  panel de Supabase (Edge Functions / SQL Editor). NO se despliegan solas.

## Estructura clave
- `src/lib/store.tsx` — Context `useStore`: estado global, auth, y TODAS las
  mutaciones (reservas, créditos, estrellas, suscripción). `plan` + `can(cap)` para gating.
- `src/lib/plans.ts` — planes, precios, capacidades por plan, código de fundador.
- `src/lib/repo.ts` — capa de datos Supabase (map*/row* snake_case↔camelCase).
- `src/lib/payments.ts` — llama a las Edge Functions de Stripe.
- `src/features/{admin,coach,student,public,onboarding}/` — pantallas por rol.
- `src/components/layout/AppShell.tsx` — navegación (sidebar + barra inferior móvil).
- `supabase/functions/` — `stripe-checkout`, `stripe-webhook`, `stripe-connect`,
  `whatsapp-webhook`, `notify-reminders`, `send-push`.
- `supabase/*.sql` — schema, RLS, RPCs. **El disparador de registro vigente vive
  en `birthdate-setup.sql`** (no en `auth-setup.sql`) — es el que hay que re-correr.

## Diseño ("Premium Zen Tech")
Paleta: salvia `#4A5D55`, menta `#88B8B7`, crema `#FAF8F3`/`#F4F1EA`, carbón `#212121`.
Tokens Tailwind: `brand` (white-label runtime), `mint`, `cream`, `ink`. Botones píldora,
sombras suaves, tarjetas `rounded-2xl`. White-label por estudio vía variables CSS.

## Reglas de PDFs (SIEMPRE)
- **Tipografía grande y legible:** el texto MÁS CHICO de cualquier PDF es **mínimo 14pt**,
  y de ahí todo escala hacia arriba (cuerpo ~16pt, subtítulos ~18pt, títulos ≥22pt).
  Nada por debajo de 14pt (ni pies de página, etiquetas, chips, notas). Priorizar claridad.
- Mantener la paleta de marca (salvia/menta/crema/carbón) y un diseño limpio.

## Modelo de negocio / promo
- Planes: **Inicio $24.99 · Pro $44.99 · Premium $84.99** (mensual).
- Prueba: **$1 · 14 días con acceso Premium**; al vencer se bloquea el panel.
- **Programa Fundador (primeros 10):** Premium a precio de Pro + $10 del bot =
  **$54.99/mes** de por vida. Código `FUNDADOR10` + tope de 10 en el servidor.
- **Bot WhatsApp:** `whatsapp.aiActive` (lo controla la plataforma) decide IA (con
  costo) vs modo básico gratis. Se enciende al pagar Premium/Fundador. `botEnabled`
  es el on/off del estudio. Sin `ANTHROPIC_API_KEY` → siempre reglas gratis.

## Reglas de seguridad (nunca romper)
- Secretos SOLO en Supabase secrets, jamás en chat/código/repo: `STRIPE_SECRET_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `whsec_*`, `WHATSAPP_TOKEN`, `WHATSAPP_VERIFY_TOKEN`,
  `ANTHROPIC_API_KEY`, claves VAPID.
- No incluir el identificador del modelo en artefactos del repo.

## Pendientes conocidos (al 22-oct-2026)
- **Usuario:** re-correr `birthdate-setup.sql` en Supabase (promo Premium en registros nuevos).
- **Usuario:** verificación de negocio en Meta (para que el bot reciba mensajes reales).
  Según capturas de oct-2026 ya fue aprobada; falta confirmar que el bot recibe mensajes reales.
- **Usuario:** al llegar primer cliente Premium: cargar saldo Anthropic, poner
  `ANTHROPIC_API_KEY`, correr `20260806_whatsapp_usage.sql`, activar `aiActive`.
- **Usuario (hardening pendiente de pegar):** correr `security-hardening.sql` en el SQL
  Editor — elimina las firmas viejas duplicadas de `book_session`/`redeem_reward` (el MCP
  bloquea `DROP`, por eso no se aplicó solo). El resto del archivo (search_path + revoke
  anon) YA está aplicado en vivo.
- **Usuario (1 clic):** activar "Leaked password protection" (HaveIBeenPwned) en
  Supabase → Authentication → Policies.

## Resuelto (histórico de auditoría)
- **Webhook de Stripe:** ya maneja renovaciones/impagos/cancelaciones (`invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.deleted`), tanto suscripción del estudio
  como membresías domiciliadas. (stripe-webhook v49, vivo).
- **Escritura directa del alumno:** cerrada. `harden-writes.sql` dejó al alumno en SOLO
  LECTURA en `user_packages`/`bookings`/`star_entries`/`payments`; sus acciones pasan por
  RPC `SECURITY DEFINER` (`book_session`, `cancel_booking`, `redeem_reward`). Vivo.
- **Hardening oct-2026:** `security-hardening.sql` — `search_path` fijo en `lock_moveya_picks`
  y revocado `anon` de las RPC de acción (conservando públicas `get_public_studio` y
  `founders_status`). Aplicado en vivo salvo los `DROP` de limpieza (ver pendiente arriba).
