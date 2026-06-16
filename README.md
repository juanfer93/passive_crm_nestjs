# Passive CRM NestJS Starter

Backend NestJS para el agente conversacional que califica leads y alimenta VIVA.

## Decision de arquitectura actual

GHL se mantiene como capa de transporte de comunicacion.
VIVA se convierte en la capa de inteligencia y sistema operativo.
Retell se mantiene como capa de voz.

No reemplazar GHL todavia. WhatsApp Cloud API queda como objetivo de largo plazo solo cuando VIVA este estable y listo para multi-dealer.

```text
Meta Ads
  ↓
GHL WhatsApp
  ↓
NestJS
  ↓
VIVA
  ↓
Sofia Brain
  ↓
Retell Voice
  ↓
VIVA
  ↓
GHL WhatsApp
```

## Regla clave

NestJS conversa, entiende y extrae memoria.
VIVA decide, agenda, crea tareas, llama, envia mensajes y guarda actividad.
GHL transporta los mensajes de WhatsApp.
Retell ejecuta voz.

El cliente nunca debe salir de WhatsApp.

## Responsabilidad de NestJS

NestJS debe encargarse de:

- Recibir eventos/mensajes provenientes del transporte GHL cuando el workflow quede definido.
- AI conversation logic.
- Memory extraction.
- Lead qualification.
- Buyer DNA input generation.
- Intent detection.
- Conversation summaries.
- Sincronizacion secundaria hacia GHL cuando aplique.
- MongoDB conversation history.
- Publicar eventos hacia VIVA Sofia en `POST /api/sofia/event`.

NestJS no debe encargarse de:

- Mantener sesiones propias de WhatsApp.
- Mostrar QR de WhatsApp.
- Reemplazar GHL como transporte.
- Ejecutar llamadas.
- Ejecutar follow-ups.
- Ejecutar documentos.
- Ejecutar citas.
- Tomar decisiones operativas.
- Enviar cupones, recordatorios, links de inventario o mensajes operativos directamente al cliente.

## Responsabilidad de GHL

GHL es el transporte actual de WhatsApp.

Por ahora, todo mensaje hacia el cliente debe salir por una conversacion de GHL:

- mensajes de Sofia,
- imagen del bono de $500,
- links de inventario,
- recordatorios de cita,
- mensajes post-llamada,
- cualquier follow-up por WhatsApp.

El workflow exacto de GHL todavia no esta definido. Cuando se defina, NestJS debe integrarse a ese flujo sin crear una capa paralela de WhatsApp.

## Responsabilidad de VIVA

VIVA recibe los datos de NestJS y alimenta:

1. Sofia Brain: recibe eventos y decide que agente debe actuar.
2. Sofia Tasks: crea tareas para `voice`, `whatsapp`, `appointment`, `document` y `reactivation`.
3. Sofia Task Executor: ejecuta tareas via Retell/GHL o las deja en `manual_review`.
4. Buyer DNA Engine: clasifica leads como `ready_buyer`, `family_suv_buyer`, `work_truck_buyer`, `credit_concern`, `down_payment_problem`, `first_time_buyer`, `researching` o `no_show_risk`.
5. Voice Playbook: define como habla Sofia para Off Lease Fredericksburg.
6. Appointment Bonus Flow: cuando Sofia agenda, confirma cita, envia direccion, telefono, bono de $500, imagen del bono y guarda actividad.
7. CommHub: debe reflejar los mensajes enviados/recibidos por GHL para mantener la conversacion visible dentro de VIVA.

## Responsabilidad de Retell

Retell es la capa de voz.

Retell no decide el flujo operativo completo. Sofia/VIVA decide cuando llamar, con que contexto y que hacer despues de la llamada.

## Flujo conversacional actual de NestJS

1. NestJS recibe un mensaje desde el transporte configurado.
2. Valida idempotencia por `messageId` en MongoDB.
3. Si hay audio, lo transcribe con OpenAI.
4. Si hay imagen, la analiza con OpenAI Vision.
5. Si hay video o archivo no analizable, lo marca como archivo sin texto util y continua la calificacion.
6. El prompt del dealer responde y continua con la siguiente pregunta pendiente.
7. OpenAI extrae custom fields desde el historial.
8. MongoDB guarda mensajes, custom fields, perfil de cliente y estado de calificacion.
9. NestJS publica eventos Sofia hacia VIVA.

## Transporte WhatsApp

La integracion directa `whatsapp-web.js` queda removida del runtime.

Motivo:

- GHL es el transporte oficial por ahora.
- No se debe operar una sesion QR paralela.
- No se debe enviar WhatsApp directo desde NestJS.
- VIVA/Sofia debe usar GHL API o workflows de GHL para enviar mensajes al cliente.

El canal logico `whatsapp` puede seguir existiendo en la memoria y en los payloads, pero significa "mensaje proveniente de GHL WhatsApp", no una sesion WhatsApp Web propia de NestJS.

## Endpoint Sofia

```text
POST /api/sofia/event
```

Si no hay URL explicita para Sofia, el adapter construye el destino con la base URL de VIVA y `/api/sofia/event`. Si no hay URL disponible, registra log y no bloquea la conversacion.

## Payload enviado a Sofia

```json
{
  "event": "lead.updated",
  "dealerId": 13,
  "leadId": "ghl:LOCATION_ID:CONTACT_ID",
  "ghlContactId": "CONTACT_ID",
  "metaUserId": null,
  "customerName": "Carlos Rivera",
  "phone": "+15715551234",
  "vehicle_category": "SUV",
  "vehicle_interest": "Honda CR-V",
  "down_payment": 2500,
  "purchase_timeline": "this_week",
  "document_status": "unknown",
  "bank_account_status": "has_active_bank_account",
  "preferred_language": "es",
  "conversation_summary": "Cliente busca SUV, tiene 2500 de down y quiere venir esta semana.",
  "appointment_date": null,
  "conversation": {
    "lastMessage": "Tengo 2500 y quiero ir esta semana",
    "channel": "whatsapp",
    "pageId": "ghl-location-id",
    "contactId": "ghl-contact-id"
  }
}
```

`leadId` debe ser estable y debe permitir que VIVA evite duplicados. El orden de matching recomendado en VIVA es:

```text
leadId → ghlContactId → metaUserId → phone
```

## Eventos Sofia emitidos por NestJS

| Evento | Cuando se emite |
| --- | --- |
| `lead.created` | Primera vez que el contacto entra al flujo |
| `lead.updated` | Cambian datos relevantes del lead |
| `buyer_dna_updated` | Cambian datos que alimentan Buyer DNA |
| `appointment.created` | Aparece `appointment_date` por primera vez |
| `document.received` | El lead envia archivo/imagen o cambia `document_status` a positivo |

## Custom fields extraidos por OpenAI

```json
{
  "vehicle_interest": "Honda CR-V",
  "vehicle_type": "SUV",
  "down_payment": "2500",
  "document_status": "unknown | confirmed | not_confirmed | itin | ssn | passport | id",
  "bank_account_status": "unknown | has_active_bank_account | no_bank_account",
  "appointment_date": "2026-06-20T15:00:00-04:00",
  "purchase_timeline": "this_week",
  "credit_profile": "fair",
  "phone": "7035551234",
  "email": "cliente@example.com",
  "language": "es",
  "lead_temperature": "hot"
}
```

`appointment_date` solo se llena cuando el cliente confirma una fecha/hora de visita o cita. Si no existe, va como `null` o no se guarda.

## MongoDB como fuente de verdad conversacional

MongoDB conserva:

- Conversation history.
- Messages.
- AI memory.
- Lead custom fields / Buyer DNA inputs.
- Intent.
- Customer profile del transporte.
- Summaries derivados del historial.

PostgreSQL pertenece a VIVA y debe conservar leads, activities, appointments, tasks, Sofia decisions, Sofia queue, CommHub y revenue intelligence.

## Funcionalidad removida o desmontada

- `WhatsappWebModule` ya no esta montado en `AppModule`.
- Dependencias de `whatsapp-web.js`, `puppeteer`, `qrcode` y `qrcode-terminal` fueron removidas del package.
- NestJS ya no debe iniciar cliente WhatsApp Web ni pedir QR.

## Ejecutar

```bash
pnpm install
pnpm start:dev
```

## Simular chat

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --channel whatsapp --page ghl-location-id
```

## Verificacion

```bash
pnpm install
pnpm build
pnpm lint
pnpm test
```

## Flujo Git/GitHub

Este proyecto trabaja directo sobre `main` salvo instruccion contraria. Los commits deben usar convencion semantica: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` o `test:`.
