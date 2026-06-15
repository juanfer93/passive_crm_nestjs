# Passive CRM NestJS Starter

Backend NestJS para Meta Messenger, Instagram Messaging y WhatsApp Web.

Este repositorio queda definido como el cerebro conversacional de VIVA: conversa con el lead, entiende el contexto, extrae memoria, genera Buyer DNA, detecta intencion y sincroniza datos conversacionales. VIVA es el sistema operativo que decide y ejecuta acciones operativas.

## Arquitectura final VIVA

```text
Lead
  ↓
Meta / WhatsApp
  ↓
NestJS Agent
  ↓
Mongo Memory
  ↓
Buyer DNA
  ↓
Intent Analysis
  ↓
Lead Summary
  ↓
POST /api/sofia/event en VIVA
  ↓
Sofia Brain
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

NestJS no debe encargarse de:

- Ejecutar llamadas.
- Ejecutar follow-ups.
- Ejecutar documentos.
- Ejecutar citas.
- Tomar decisiones operativas.

Esas responsabilidades pertenecen a VIVA y a Sofia Brain dentro del sistema operativo.

## Principios

- `Domain` contiene entidades, tipos, servicios puros y puertos.
- `Application` contiene casos de uso y orquestacion conversacional.
- `Infrastructure` contiene adaptadores concretos: MongoDB, Meta, OpenAI, GHL y VIVA webhooks.
- `Presentation` contiene controllers y guards de NestJS.
- MongoDB sigue siendo la fuente de verdad para conversaciones, mensajes, AI memory, Buyer DNA, intent y summaries.
- GHL sigue siendo un destino de sincronizacion CRM.
- VIVA recibe eventos enriquecidos y ejecuta la operacion.
- No se duplica logica operativa en NestJS.

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
10. La escritura JSON hacia GHL ocurre de forma secundaria y no bloqueante.
11. NestJS publica eventos enriquecidos hacia VIVA para que Sofia Brain decida y ejecute.

## Eventos enviados a VIVA

NestJS envia un webhook a VIVA cuando detecta alguno de estos eventos dentro del flujo conversacional:

- `new_lead`
- `buyer_dna_updated`
- `purchase_intent_detected`
- `documentation_received`
- `appointment_created` cuando exista un hook conversacional que cree citas.
- `call_completed` cuando exista un hook conversacional que reciba llamadas completadas.

Endpoint esperado en VIVA:

```text
POST /api/sofia/event
```

Variables soportadas:

```bash
VIVA_SYNC_ENABLED=true
VIVA_SOFIA_EVENT_URL=https://viva.example.com/api/sofia/event
# o alternativa:
VIVA_API_BASE_URL=https://viva.example.com

# opcional si VIVA protege el endpoint interno:
VIVA_INTERNAL_API_KEY=your-internal-key

# opcional:
VIVA_WEBHOOK_TIMEOUT_MS=10000
```

Si `VIVA_SOFIA_EVENT_URL` no existe, el adaptador construye el endpoint con `VIVA_API_BASE_URL + /api/sofia/event`. Si ninguna variable existe, el evento se omite con log y no bloquea la conversacion.

## Payload enviado a VIVA

```json
{
  "event": "new_lead",
  "leadId": "messenger:meta-page-1:12345",
  "ghlContactId": null,
  "buyerDNA": {
    "vehicleType": "truck",
    "vehicleInterest": "Toyota Tacoma",
    "downPayment": 3500,
    "creditProfile": "rebuilding",
    "timeline": "this_week",
    "language": "es"
  },
  "intent": {
    "purchaseIntent": 91,
    "readyBuyer": true
  },
  "conversation": {
    "summary": "Customer wants Toyota Tacoma, has 3500 down, timeline: this week, language: es",
    "lastMessage": "Tengo 3500 y quiero una Tacoma este sabado",
    "channel": "messenger",
    "pageId": "meta-page-1",
    "contactId": "12345"
  }
}
```

`leadId` canonico usa `channel:pageId:contactId`, por ejemplo `messenger:meta-page-1:12345`.

## MongoDB como fuente de verdad conversacional

MongoDB conserva:

- Conversation history.
- Messages.
- AI memory.
- Buyer DNA / lead custom fields.
- Intent.
- Summaries derivados del historial.

PostgreSQL pertenece a VIVA y debe conservar:

- Leads.
- Activities.
- Appointments.
- Tasks.
- Sofia Decisions.
- Sofia Queue.
- Revenue Intelligence.

## Custom fields enviados a GHL

OpenAI extrae este JSON desde el historial de chat:

```json
{
  "vehicle_interest": "Toyota Tacoma 2022",
  "purchase_timeline": "esta semana | este mes | solo estoy mirando | el otro mes",
  "lead_temperature": "hot | warm | cold",
  "vehicle_type": "Sedan | SUV | Troca",
  "down_payment": "string",
  "document_status": "confirmed",
  "phone": "3055555555",
  "email": "cliente@example.com",
  "language": "es | en",
  "credit_profile": "string"
}
```

`phone` se normaliza como digitos sin `+`. Si viene con indicativo `1` y tiene 11 digitos, se guarda como numero nacional de 10 digitos. Para otros paises se conserva el indicativo sin el signo `+`.

`credit_profile` y `email` son opcionales y solo se guardan si el cliente los menciona. `lead_temperature` se deriva del timeline: hoy/esta semana/lo antes posible es `hot`, este mes es `warm`, y solo mirando es `cold`.

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

## Claves API

No pegues claves reales en el chat ni las guardes en archivos versionados. La configuracion sensible debe vivir solo en un `.env` local, en variables del proveedor de despliegue o en un gestor de secretos.

## Ejecutar

```bash
pnpm install
pnpm start:dev
```

## Simular chat en terminal

El simulador usa MongoDB para guardar historial/custom fields y OpenAI para responder, pero no llama a Meta ni a GHL. VIVA solo recibe eventos si configuras `VIVA_SOFIA_EVENT_URL` o `VIVA_API_BASE_URL`.

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1
```

Para simular el mismo contacto en paginas distintas sin mezclar estado:

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --page meta-page-1
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1 --page meta-page-2
```

Perfiles disponibles:

- `offlease-fredericksburg`
- `offlease-motors-fredericksburg`
- `offlease-stafford`

## Simular media local

El simulador de media lee un archivo local, usa OpenAI para describir imagenes o transcribir audio, y luego pasa ese texto al mismo flujo de conversacion. Los archivos sin texto util para calificacion, incluidos videos/documentos/stickers u otros tipos no soportados, se tratan como `unknown` y el bot continua con la siguiente pregunta pendiente.

```bash
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-image-1 --file C:\dev\imagen_de_prueba.jpg
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-audio-1 --file C:\dev\audio_de_prueba.ogg
```

Tambien puedes indicar el tipo explicitamente:

```bash
pnpm simulate:media -- --type image --file C:\dev\imagen_de_prueba.jpg
pnpm simulate:media -- --type audio --file C:\dev\audio_de_prueba.ogg
```

Para revisar solo la transcripcion de OpenAI sin ejecutar el flujo del bot:

```bash
pnpm simulate:media -- --profile offlease-fredericksburg --contact media-audio-transcribe-only --file C:\dev\audio_de_prueba.ogg --transcribe-only
```

El output muestra `OpenAI audio transcription>` para audio, `Image analysis>` para imagenes y `Media notice>` para archivos no analizables.

## Follow-ups automaticos

NestJS ya no ejecuta follow-ups automaticos. La conversacion activa sigue respondiendo al lead, pero las tareas, reactivaciones y seguimientos operativos deben ser creados y ejecutados por VIVA despues de recibir eventos en `/api/sofia/event`.

Quedan metodos de limpieza de estado conversacional para evitar residuos antiguos en MongoDB, pero no se monta un worker de follow-ups en `AppModule` ni en `MetaMessagingWebhookModule`.

Webhook de Meta Messenger/Instagram:

```text
GET  /webhooks/meta/messaging
POST /webhooks/meta/messaging
```

## Sofia Brain

Sofia Brain vive en VIVA.

Este backend NestJS no monta endpoints internos `/api/sofia/context`, `/api/sofia/recommendation`, `/api/sofia/execute`, `/api/sofia/learning` ni `/api/sofia/activity` en la aplicacion principal.

NestJS solo alimenta a Sofia Brain con contexto enriquecido mediante eventos HTTP. La decision operativa, las llamadas, las citas, los documentos, las tareas, la reactivacion y la cola Sofia pertenecen a VIVA.

## Pendiente del flujo VIVA/NestJS

Estas piezas quedan pendientes para completar el flujo end-to-end y deben validarse despues de correr `pnpm build`, `pnpm lint` y `pnpm test`:

1. Configurar en ambiente la URL real de VIVA: `VIVA_SOFIA_EVENT_URL` o `VIVA_API_BASE_URL`.
2. Configurar `VIVA_INTERNAL_API_KEY` si el endpoint `POST /api/sofia/event` de VIVA exige autenticacion interna.
3. Confirmar que VIVA acepte el payload actual con `event`, `leadId`, `ghlContactId`, `buyerDNA`, `intent` y `conversation`.
4. Definir si VIVA necesita un `ghlContactId` real en el payload. Actualmente NestJS envia `ghlContactId: null` porque el adaptador GHL resuelve el contacto internamente por telefono y no expone ese ID al publisher de VIVA.
5. Conectar `appointment_created` cuando exista en NestJS un flujo real que cree citas o reciba confirmacion conversacional de una cita creada.
6. Conectar `call_completed` cuando exista en NestJS un hook real de llamadas completadas o cuando Retell/VIVA reporte ese evento al backend conversacional.
7. Decidir si `documentation_received` debe dispararse solo por `document_status` o tambien por media/documentos adjuntos detectados por Meta/WhatsApp.
8. Validar el scoring de `purchaseIntent` con data real de leads. El scoring actual es heuristico y debe calibrarse con Sofia/VIVA.
9. Revisar si se eliminan definitivamente los archivos legacy de `src/features/sofia-engine/`. Por ahora no estan montados en `AppModule`, pero siguen en el repo para evitar un borrado agresivo antes de validar build/lint/test.
10. Revisar si se eliminan definitivamente `ProcessDueFollowUpsUseCase` y `NodeFollowUpWorker`. Por ahora no estan registrados en el modulo principal, pero siguen en el repo para evitar romper imports o tests existentes hasta validar localmente.
11. Agregar tests unitarios para `viva-sofia-event-factory.service.ts` y `viva-sofia-event.adapter.ts` despues de confirmar el contrato final de VIVA.
12. Agregar un test de integracion del flujo `ProcessIncomingMetaMessageUseCase -> VivaSofiaEventPublisherPort` para asegurar que cada evento se dispara una sola vez por mensaje idempotente.

## Verificacion

```bash
pnpm test
pnpm lint
pnpm build
```

Los tests actuales cubren extraccion de eventos Messenger/Instagram, normalizacion de custom fields, validacion de firma Meta y el formato de custom fields enviado a GHL.

## Flujo Git/GitHub

Este proyecto lo desarrolla una sola persona. Cuando Codex suba cambios a GitHub, debe trabajar directamente sobre `main` y hacer push a `main`. No crear ramas nuevas salvo que se pida explicitamente o que el proyecto pase a tener un equipo mas grande.

A partir de este punto, los commits deben usar convencion semantica: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:` o `test:` segun el tipo de cambio.

## Notas de resiliencia

El adaptador `GhlPassiveCrmAdapter` encapsula sus fallos con `Logger`. Si el destino GHL falla, el caso de uso principal no se interrumpe y la respuesta al usuario final por Meta sigue siendo prioritaria.

El adaptador `VivaSofiaEventAdapter` tambien es no bloqueante. Si VIVA no responde, el evento se registra en logs, pero la conversacion del lead continua.
