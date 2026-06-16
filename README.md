# Passive CRM NestJS Starter

Backend NestJS para Meta Messenger, Instagram Messaging y WhatsApp Web.

NestJS es el cerebro conversacional: conversa con el lead, entiende el contexto, extrae memoria, califica, detecta intencion y envia datos a VIVA. VIVA OS decide y ejecuta llamadas, follow-ups, documentos, citas, tareas y reactivaciones.

## Regla clave

NestJS conversa y extrae datos. VIVA decide, agenda, llama, envia mensajes y guarda actividad.

## Arquitectura

```text
Lead
  ↓
Meta Messenger / Instagram / WhatsApp
  ↓
NestJS Agent
  ↓
Mongo Memory + Buyer DNA inputs + Intent + Lead Summary
  ↓
POST /api/sofia/event
  ↓
VIVA OS / Sofia Brain
  ↓
Sofia Tasks / Task Executor / Voice / WhatsApp / Appointment / Document / Reactivation
```

## Responsabilidad de NestJS

NestJS debe encargarse de:

- Conversaciones Messenger, Instagram y WhatsApp.
- AI conversation logic.
- Memory extraction.
- Lead qualification.
- Buyer DNA input generation.
- Intent detection.
- Conversation summaries.
- GHL synchronization.
- MongoDB conversation history.
- Publicar eventos hacia VIVA Sofia.

NestJS no debe encargarse de:

- Ejecutar llamadas.
- Ejecutar follow-ups.
- Ejecutar documentos.
- Ejecutar citas.
- Tomar decisiones operativas.

## VIVA backend esperado

VIVA recibe los eventos de NestJS y alimenta:

1. Sofia Brain: recibe eventos y decide que agente debe actuar.
2. Sofia Tasks: crea tareas para `voice`, `whatsapp`, `appointment`, `document` y `reactivation`.
3. Sofia Task Executor: ejecuta tareas via Retell/Twilio o las deja en `manual_review`.
4. Buyer DNA Engine: clasifica leads como `ready_buyer`, `family_suv_buyer`, `work_truck_buyer`, `credit_concern`, `down_payment_problem`, `first_time_buyer`, `researching` o `no_show_risk`.
5. Voice Playbook: define como habla Sofia para Off Lease Fredericksburg.
6. Appointment Bonus Flow: cuando Sofia agenda, confirma cita, envia direccion, telefono, bono de $500, imagen del bono y guarda actividad.

## Flujo conversacional

1. Meta llama `POST /webhooks/meta/messaging` desde Messenger o Instagram.
2. WhatsApp Web recibe mensajes si esta habilitado y autenticado.
3. NestJS valida idempotencia por `messageId` en MongoDB.
4. Si hay audio, lo transcribe con OpenAI.
5. Si hay imagen, la analiza con OpenAI Vision.
6. Si hay video o archivo no analizable, lo marca como archivo sin texto util y continua la calificacion.
7. El prompt del dealer responde y continua con la siguiente pregunta pendiente.
8. OpenAI extrae custom fields desde el historial.
9. MongoDB guarda mensajes, custom fields, perfil de cliente y estado de calificacion.
10. NestJS sincroniza con GHL/VIVA lead sync cuando aplica.
11. NestJS publica eventos Sofia hacia VIVA.

## Endpoint Sofia

```text
POST /api/sofia/event
```

Si no hay URL explicita para Sofia, el adapter construye el destino con la base URL de VIVA y `/api/sofia/event`. Si no hay URL disponible, registra log y no bloquea la conversacion.

## Payload enviado a Sofia

```json
{
  "event": "lead.created",
  "dealerId": 13,
  "leadId": "messenger:12345:67890",
  "ghlContactId": null,
  "customerName": "Carlos Rivera",
  "phone": "7035551234",
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
    "channel": "messenger",
    "pageId": "12345",
    "contactId": "67890"
  }
}
```

`leadId` canonico usa `channel:pageId:contactId`.

## Eventos Sofia emitidos por NestJS

| Evento | Cuándo se emite |
| --- | --- |
| `lead.created` | Primera vez que el contacto escribe |
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

## WhatsApp

WhatsApp Web ya usa el mismo cerebro conversacional que Messenger:

- mismo prompt del dealer,
- misma memoria MongoDB,
- misma extraccion de campos,
- mismo analisis de audio e imagen,
- mismos eventos Sofia,
- mismo sync a GHL/VIVA.

La autenticacion por QR/session de `whatsapp-web.js` es solo la capa de transporte y se puede reemplazar despues sin cambiar el cerebro conversacional.

## MongoDB como fuente de verdad conversacional

MongoDB conserva:

- Conversation history.
- Messages.
- AI memory.
- Lead custom fields / Buyer DNA inputs.
- Intent.
- Customer profile de Meta o WhatsApp.
- Summaries derivados del historial.

PostgreSQL pertenece a VIVA y debe conservar leads, activities, appointments, tasks, Sofia decisions, Sofia queue y revenue intelligence.

## Ejecutar

```bash
pnpm install
pnpm start:dev
```

## Simular chat

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --channel whatsapp --page whatsapp:default-client
```

## Verificacion

```bash
pnpm build
pnpm lint
pnpm test
```

## Flujo Git/GitHub

Este proyecto trabaja directo sobre `main` salvo instruccion contraria. Los commits deben usar convencion semantica: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` o `test:`.
