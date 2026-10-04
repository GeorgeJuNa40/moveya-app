# Move yA — Guía WhatsApp (manual) + Estado del proyecto

> Última revisión: 4-oct-2026

---

## PARTE A — Conectar el WhatsApp de un estudio MANUALMENTE (Camino A)

Esto es lo que haces **hoy**, mientras Meta aprueba la App Review. Sirve para tus
primeros estudios. Cuando aprueben, cada estudio se conectará solo con un botón.

### Requisitos (una sola vez — ya los tienes ✅)
- Cuenta de WhatsApp Business (WABA) en Meta.
- Token permanente (System User) puesto en Supabase como `WHATSAPP_TOKEN`.
- Webhook configurado y verificado + WABA suscrita a la app.
- Verificación del negocio aprobada.

### Para CADA estudio nuevo
1. Entra a **developers.facebook.com** → tu app **Move yA** → menú **WhatsApp → API Setup** (Configuración de la API).
2. En la sección del número ("From"/"Número de teléfono") pulsa **Add phone number** (Agregar número de teléfono).
3. Captura:
   - **Nombre para mostrar** del estudio (ej. "Move yA Studio").
   - **Categoría** y, si pide, descripción.
   - El **número dedicado del estudio**. ⚠️ Debe ser un número que **NO** tenga
     WhatsApp normal ni la app WhatsApp Business activos (si los tiene, primero
     elimina esa cuenta desde el celular).
4. **Verifica el número** con el código que Meta envía por **SMS o llamada**.
5. Meta revisa el **nombre para mostrar** (puede tardar de minutos a unas horas).
6. En **Move yA**: entra como **admin de ese estudio** → sección **WhatsApp IA**
   → **"¿Prefieres registrarlo manualmente?"** → escribe el número en **formato
   internacional sin +** (ej. `521234567890`) → **Guardar**.
7. Enciende **"Respuestas automáticas"**.
8. **Prueba:** desde otro celular manda **"Hola"** a ese número. El bot debe
   responder (en modo básico/gratis con reglas; con IA cuando actives Premium).

> Nota: el bot responde usando el identificador del número que viene en cada
> mensaje entrante, por eso en modo manual solo necesitas capturar el número.

---

## PARTE B — Estado del proyecto (verificado) y qué sigue

### ✅ Ya está hecho / funcionando
- **Landing** nueva en producción (Premium destacado y grande, toggle
  Mensual/Anual, botón WhatsApp, logo "Move yA").
- **Suscripción mensual/anual** (Inicio $249 · Pro $449 · Premium $799 al año).
- **Bot de WhatsApp** respondiendo (acceso estándar, números agregados a mano).
- **App Review enviada** a Meta (acceso avanzado a los 2 permisos) → en revisión (~20 días).
- **Verificación del negocio** en Meta → aprobada.
- **Blindaje de seguridad** de créditos/estrellas/pagos → **aplicado** en la BD:
  el alumno es solo-lectura; canjes y cancelaciones pasan por RPC seguras.
  (RPC `book_session`, `cancel_booking`, `redeem_reward`, rutinas: todas existen.)
- **Trigger de registro** (`on_auth_user_created`) activo.

### ⏳ Esperando a terceros (no depende de ti)
- **App Review de Meta** (~20 días). Al aprobarse: generamos el `CONFIG_ID` y se
  enciende el botón self-service para que cada estudio conecte su propio WhatsApp.

### 📌 Pendiente real en Supabase (listo para aplicar)
- **Función `bump_whatsapp_usage`** (tope mensual de mensajes con IA por estudio,
  para controlar el costo). Está escrita en `supabase/whatsapp-usage.sql`.
  Solo hace falta cuando **enciendas la IA** (primer cliente Premium). Para
  aplicarla: Supabase → SQL Editor → pega el contenido de ese archivo → Run.

### 🔵 Cuando llegue tu primer cliente Premium (encender la IA)
1. Cargar saldo en Anthropic y poner `ANTHROPIC_API_KEY` en Supabase (secrets).
2. Correr `supabase/whatsapp-usage.sql` (tope de uso).
3. Activar `aiActive` del estudio (se enciende solo al pagar Premium/Fundador).

### ⚪ Roadmap futuro (parqueado)
- Botón self-service a escala (tras App Review).
- Marketplace + reloj inteligente → V2.
