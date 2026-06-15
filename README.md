# Passive CRM NestJS Starter

Backend NestJS para Meta Messenger, Instagram Messaging y WhatsApp Web.

NestJS es el cerebro conversacional: conversa con el lead, entiende el contexto, extrae memoria, genera Buyer DNA, detecta intencion y guarda historial en MongoDB. VIVA OS es el sistema operativo: decide y ejecuta llamadas, follow-ups, documentos, citas, tareas y reactivaciones.

## Arquitectura VIVA

```text
Lead
  ↓
Meta / WhatsApp
  ↓
NestJS Agent
  ↓
Mongo Memory + Buyer DNA + Intent + Lead Summary
  ↓
Canal A: VIVA lead sync
Canal B: VIVA Sofia event
  ↓
VIVA OS / Sofia Brain
  ↓
Voice Agent / WhatsApp Agent / Appointment Agent / Document Agent / Reactivation Agent
```

## Responsabilidad de NestJS

NestJS debe encargarse de:

- WhatsApp conversations.
- AI conversation logic.
- Memory extraction.
- Lead qualification.
- Buyer DNA generation.
- Intent detection.
- Conversation summaries.
- GHL synchronization.
- MongoDB conversation history.
- Publicar contexto enriquecido hacia VIVA por dos canales independientes.

NestJS no debe encargarse de:

- Ejecutar llamadas.
- Ejecutar follow-ups.
- Ejecutar documentos.
- Ejecutar citas.
- Tomar decisiones operativas.

## Flujo conversacional

1. Meta llama `POST /webhooks/meta/messaging` desde Messenger o Instagram.
2. El controller devuelve `200 OK` inmediatamente.
3. `AcceptMetaWebhookUseCase` agenda el procesamiento en background.
4. `ProcessIncomingMetaMessageUseCase` extrae mensajes y valida idempotencia por `messageId` en MongoDB.
5. Si el mensaje ya existe, el caso de uso detiene el procesamiento.
6. Si hay audio o imagen, el backend descarga el binario y lo procesa con OpenAI.
7. El asistente genera la respuesta y se envia por la API de Meta.
8. El estado conversacional se persiste en MongoDB usando `channel + pageId + senderId` como identidad del chat.
9. OpenAI consulta el historial reciente guardado en MongoDB y extrae custom fields de lead.
10. La escritura hacia GHL ocurre de forma secundaria y no bloqueante.
11. Canal A sincroniza el lead completo hacia VIVA.
12. Canal B publica eventos enriquecidos hacia Sofia Brain.

## Integracion VIVA: dos canales activos

| Canal | Endpoint VIVA | Adapter NestJS | Responsabilidad en VIVA |
| --- | --- | --- | --- |
| Canal A — Sincronizacion completa | `POST /api/ai-agent/webhook` | `HlnCrmSinkAdapter` via `CompositeCrmSinkAdapter` | Crear/actualizar lead, recalcular score y permitir Retell auto-call si aplica |
| Canal B — Eventos Sofia | `POST /api/sofia/nest-event` | `VivaSofiaEventAdapter` | Notificar a Sofia Brain para generar decisiones y tareas automaticas |

Ambos canales corren en background. Si uno falla, no bloquea la respuesta del bot al lead.

## Canal A — Payload de sincronizacion completa

`HlnCrmSinkAdapter` genera el payload para VIVA lead sync desde `syncToPassiveCrm()` cuando el lead ya tiene telefono y custom fields suficientes.

```json
{
  "source": "nestjs_ai_agent",
  "dealerId": 1,
  "ghlContactId": null,
  "metaUserId": "67890",
  "conversationId": "messenger:12345:67890",
  "customer": {
    "firstName": "Juan",
    "lastName": "Garcia",
    "fullName": "Juan Garcia",
    "phone": "5551234567",
    "email": null,
    "language": "es"
  },
  "qualification": {
    "vehicle_interest": "Toyota Tundra",
    "vehicle_type": "truck",
    "down_payment": "3000",
    "document_status": "itin",
    "purchase_timeline": "this_week",
    "credit_profile": "fair",
    "contact_preference": "messenger",
    "lead_temperature": "hot"
  },
  "conversation": {
    "summary": "Cliente busca Toyota Tundra, tiene 3000 de enganche, documentos: itin",
    "last_message": "Si, tengo 3000 de enganche",
    "intent": "purchase",
    "buying_intent_score": 75
  },
  "timestamps": {
    "qualified_at": "2026-06-15T19:00:00.000Z",
    "last_message_at": "2026-06-15T18:58:00.000Z"
  }
}
```

VIVA debe buscar/crear el lead usando `metaUserId`, `phone` o `email`. El nombre del perfil Meta se envia si esta disponible, pero no bloquea la sincronizacion.

## Canal B — Eventos Sofia

Eventos soportados:

- `new_lead`
- `buyer_dna_updated`
- `purchase_intent_detected`
- `documentation_received`
- `appointment_created` reservado hasta conectar citas.
- `call_completed` reservado para uso futuro.

Endpoint esperado:

```text
POST /api/sofia/nest-event
```

Si no hay URL explicita para Sofia, el adapter construye el destino con la base URL de VIVA y `/api/sofia/nest-event`. Si no hay URL disponible, registra log y no bloquea la conversacion.

```json
{
  "event": "purchase_intent_detected",
  "leadId": "messenger:12345:67890",
  "ghlContactId": null,
  "customer": {
    "firstName": "Juan",
    "lastName": "Garcia",
    "fullName": "Juan Garcia"
  },
  "buyerDNA": {
    "vehicleType": "truck",
    "vehicleInterest": "Toyota Tundra",
    "downPayment": 3000,
    "creditProfile": "fair",
    "timeline": "this_week",
    "language": "es"
  },
  "intent": {
    "purchaseIntent": 75,
    "readyBuyer": false
  },
  "conversation": {
    "summary": "Customer wants Toyota Tundra, has 3000 down, credit profile: fair, timeline: this_week, documents: itin, language: es",
    "lastMessage": "Si, tengo 3000 de enganche",
    "channel": "messenger",
    "pageId": "12345",
    "contactId": "67890"
  }
}
```

`leadId` canonico usa `channel:pageId:contactId`. El bloque `customer` viene del perfil de Meta guardado en MongoDB; si Meta no devuelve nombre, se envia `null` en `firstName`, `lastName` y `fullName`.

## Mapeo de eventos Sofia

| Evento NestJS | Cuándo se emite | Evento esperado en VIVA |
| --- | --- | --- |
| `new_lead` | Primera vez que el contacto escribe | `lead.created` |
| `buyer_dna_updated` | Cambia Buyer DNA | `lead.updated` |
| `purchase_intent_detected` | El intent cruza el umbral ready buyer | `lead.scored` |
| `documentation_received` | `document_status` pasa a valor positivo: `confirmed`, `received`, `itin`, `ssn`, `passport`, `id`, etc. | `document.received` |
| `appointment_created` | Reservado hasta agregar `appointment_date` al extractor | `appointment.created` |
| `call_completed` | Reservado para uso futuro | `ai_call.completed` |

## MongoDB como fuente de verdad conversacional

MongoDB conserva:

- Conversation history.
- Messages.
- AI memory.
- Buyer DNA / lead custom fields.
- Intent.
- Customer profile de Meta.
- Summaries derivados del historial.

PostgreSQL pertenece a VIVA y debe conservar leads, activities, appointments, tasks, Sofia decisions, Sofia queue y revenue intelligence.

## Custom fields extraidos por OpenAI

```json
{
  "vehicle_interest": "Toyota Tacoma 2022",
  "purchase_timeline": "esta semana | este mes | solo estoy mirando | el otro mes",
  "lead_temperature": "hot | warm | cold",
  "vehicle_type": "Sedan | SUV | Troca",
  "down_payment": "string",
  "document_status": "confirmed | itin | ssn | passport | id",
  "phone": "3055555555",
  "email": "cliente@example.com",
  "language": "es | en",
  "credit_profile": "string"
}
```

## Estructura

```text
src/
  app.module.ts
  main.ts
  features/
    meta-messaging-webhook/
      domain/
        entities/
        ports/
        services/
        types/
      application/
        services/
        use-cases/
      infrastructure/
        background/
        ghl/
        hln/
        meta/
        mongo/
        openai/
        viva/
      presentation/
        controllers/
        guards/
      meta-messaging-webhook.module.ts
    whatsapp-web/
```

## Ejecutar

```bash
pnpm install
pnpm start:dev
```

## Simular chat en terminal

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --page meta-page-1
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --page meta-page-2
```

Perfiles disponibles:

- `offlease-fredericksburg`
- `offlease-motors-fredericksburg`
- `offlease-stafford`

## Simular media local

```bash
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-image-1 --file C:\dev\imagen_de_prueba.jpg
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-audio-1 --file C:\dev\audio_de_prueba.ogg
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-audio-transcribe-only --file C:\dev\audio_de_prueba.ogg --transcribe-only
```

## Follow-ups automaticos

NestJS ya no ejecuta follow-ups automaticos. La conversacion activa sigue respondiendo al lead, pero tareas, reactivaciones y seguimientos operativos deben ser creados y ejecutados por VIVA despues de recibir eventos en `/api/sofia/nest-event`.

## Sofia Brain

Sofia Brain vive en VIVA. NestJS no monta endpoints internos `/api/sofia/context`, `/api/sofia/recommendation`, `/api/sofia/execute`, `/api/sofia/learning` ni `/api/sofia/activity` en la aplicacion principal.

## Pendiente del flujo VIVA/NestJS

1. Confirmar que VIVA acepte Canal A con el payload actual de `HlnCrmSinkAdapter`.
2. Confirmar que VIVA acepte Canal B con `event`, `leadId`, `ghlContactId`, `customer`, `buyerDNA`, `intent` y `conversation`.
3. Definir si VIVA necesita un `ghlContactId` real. Actualmente NestJS envia `ghlContactId: null`.
4. Conectar `appointment_created` cuando exista en NestJS un flujo real de citas o se agregue `appointment_date` al extractor.
5. Conectar `call_completed` cuando exista un hook real de llamadas completadas.
6. Decidir si `documentation_received` debe dispararse tambien por media/documentos adjuntos, no solo por `document_status`.
7. Validar y calibrar el scoring de `purchaseIntent` con data real.
8. Revisar si se eliminan definitivamente archivos legacy de `src/features/sofia-engine/`.
9. Revisar si se eliminan definitivamente `ProcessDueFollowUpsUseCase` y `NodeFollowUpWorker`.
10. Agregar tests unitarios para el factory y adapter de VIVA.
11. Agregar test de integracion para `ProcessIncomingMetaMessageUseCase -> VivaSofiaEventPublisherPort`.

## Verificacion

```bash
pnpm test
pnpm lint
pnpm build
```

## Flujo Git/GitHub

Este proyecto lo desarrolla una sola persona. Cuando Codex suba cambios a GitHub, debe trabajar directamente sobre `main` y hacer push a `main`. No crear ramas nuevas salvo que se pida explicitamente.

Los commits deben usar convencion semantica: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` o `test:`.

## Resiliencia

`GhlPassiveCrmAdapter`, `HlnCrmSinkAdapter` y `VivaSofiaEventAdapter` encapsulan fallos con `Logger`. Si GHL o VIVA fallan, el caso de uso principal no se interrumpe y la respuesta al lead por Meta sigue siendo prioritaria.
