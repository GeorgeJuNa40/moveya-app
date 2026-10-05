# Move yA — Plan para integrar Mercado Pago (además de Stripe)

> Borrador 5-oct-2026. Objetivo: que el alumno pueda pagar con **Mercado Pago**
> (tarjeta, OXXO/efectivo, saldo MP) además de Stripe, y que cada estudio reciba
> su dinero. Mercado Pago es clave en México: mucha gente no tiene tarjeta
> internacional pero sí usa MP/OXXO.

## 1. La buena noticia: MP funciona casi igual que Stripe
Lo que ya construimos con Stripe se replica 1:1:

| Stripe (hoy) | Mercado Pago (equivalente) |
|---|---|
| Stripe Connect (cada estudio conecta su cuenta) | **OAuth de MP** (cada estudio conecta su cuenta MP) |
| Cargo directo + `application_fee` (tu comisión) | **Split de pagos** + `marketplace_fee` (tu comisión) |
| Stripe Checkout (página segura) | **Checkout Pro** (página segura de MP) |
| Webhook `checkout.session.completed` | **Webhook** de MP (notificación de pago) |
| Suscripción (membresías / SaaS) | **Preapproval** (suscripciones MP) |

> En el split, MP descuenta primero su comisión y luego tu `marketplace_fee`
> del resto. Igual que Stripe, el dinero del alumno va a la cuenta del estudio;
> tú solo te quedas tu comisión.

## 2. Lo que TÚ necesitas preparar (cuenta MP)
1. **Cuenta de Mercado Pago** de Move yA (la plataforma / marketplace).
2. En el **panel de desarrolladores de MP** → crear una **Aplicación**:
   - Obtienes **Client ID** y **Client Secret** (para el OAuth de los estudios).
   - **Access Token** de producción de la plataforma.
   - **Public Key**.
3. Solicitar/activar el modelo **Marketplace / Split de pagos** (puede requerir
   habilitación de MP).
4. Definir tu **comisión de marketplace** (ej. 5%).

> Los secretos (Client Secret, Access Token) van **solo en Supabase secrets**,
> jamás en el repo (misma regla que Stripe/WhatsApp).

## 3. Arquitectura (3 Edge Functions nuevas, espejo de Stripe)
- **`mp-connect`** — OAuth: el estudio conecta su MP (como `stripe-connect`).
  Guarda su `access_token`/`refresh_token` en una tabla protegida (solo service role).
- **`mp-checkout`** — crea la *preference* de Checkout Pro con `marketplace_fee`,
  usando el token del estudio. Cubre paquetes (pago único) y, en fase 2,
  membresías (preapproval).
- **`mp-webhook`** — recibe la notificación de MP, valida y crea el
  `user_package` + `payment` (como `stripe-webhook`). Se despliega con **JWT OFF**.

## 4. Cambios en la app (frontend)
- **Capa de proveedor** en `payments.ts`: elegir `stripe` | `mercadopago`.
- **Alumno:** botón "Pagar con Mercado Pago" junto a "Pagar con tarjeta".
- **Estudio:** tarjeta "Conectar Mercado Pago" (junto a `StripeConnectCard`).
- **Configuración:** el estudio elige qué proveedor(es) acepta.

## 5. Base de datos
- Tabla **`mp_accounts`** (o columnas en `studios`): `mp_user_id`,
  `access_token`, `refresh_token`, `public_key`, `connected`. RLS: **solo
  service role** (como `whatsapp_accounts`).
- **`payments`**: agregar columna `provider` ('stripe' | 'mercadopago') y el id
  de pago de MP.
- **`user_packages`**: equivalentes MP para membresías recurrentes (como ya
  existe `stripe_subscription_id`).

## 6. Fases sugeridas (de más útil a menos)
- **Fase 1 — Pagos de paquetes con MP (Checkout Pro + split).** Lo más usado
  (tarjeta + OXXO). Es el 80% del valor.
- **Fase 2 — Membresías recurrentes con MP (preapproval).**
- **Fase 3 — Suscripción SaaS del estudio con MP** (que el estudio te pague a TI
  con MP). Opcional: hoy ya lo cubre Stripe.

## 7. Decisiones que necesito de ti (para arrancar mañana)
1. ¿Empezamos por **pagos de alumnos a su estudio** (Fase 1) o por la
   **suscripción SaaS** (que el estudio te pague con MP)?  → *recomiendo Fase 1*.
2. ¿Modelo **marketplace** (cada estudio conecta su MP, tú cobras comisión),
   igual que Stripe?  → *recomendado*.
3. ¿Qué **comisión de marketplace** pones? (ej. 5%)
4. ¿Solo **México / MXN** por ahora?

## 8. Qué puedo adelantar SIN tus credenciales (si quieres)
- Scaffolding de las 3 Edge Functions (con TODO claramente marcado).
- La capa de abstracción de proveedor + el selector en la UI.
- La migración SQL de `mp_accounts` + columna `provider`.

> Nada se puede **probar/activar** hasta que crees la app de MP y me pases (a
> Supabase secrets, no al chat) el Client ID/Secret y Access Token.

---

### Resumen en una línea
Crear la app de MP (tú) → 3 Edge Functions espejo de Stripe + OAuth del estudio
+ Checkout Pro con split → selector de proveedor en la app. Encaja limpio en lo
que ya existe.
