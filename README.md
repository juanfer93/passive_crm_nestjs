# Passive CRM NestJS Starter

Backend NestJS para Meta Messenger e Instagram Messaging con arquitectura Feature-First + Onion Architecture.

## Principios

- `Domain` contiene entidades, tipos y puertos puros.
- `Application` contiene casos de uso y orquestacion.
- `Infrastructure` contiene adaptadores concretos: MongoDB, Meta, OpenAI y GHL.
- `Presentation` contiene controllers y guards de NestJS.
- GHL se trata exclusivamente como endpoint de destino donde el adaptador de infraestructura inyecta JSON estructurado.
- La logica de negocio vive en NestJS. No se depende de triggers, workflows ni automatizaciones nativas del destino GHL.

## Flujo

1. Meta llama `POST /webhooks/meta/messaging` desde Messenger o Instagram.
2. El controller devuelve `200 OK` inmediatamente.
3. `AcceptMetaWebhookUseCase` agenda el procesamiento en background.
4. `ProcessIncomingMetaMessageUseCase` extrae mensajes y valida idempotencia por `messageId` en MongoDB.
5. Si el mensaje ya existe, el caso de uso detiene el procesamiento.
6. Si hay audio o imagen, el backend descarga el binario y lo procesa con OpenAI.
7. El asistente genera la respuesta y se envia por la API de Meta.
8. El estado conversacional se persiste en MongoDB usando `channel + senderId` como identidad del chat.
9. OpenAI consulta el historial reciente guardado en MongoDB y extrae custom fields de lead.
10. La escritura JSON hacia el destino GHL ocurre de forma secundaria y no bloqueante.

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
      presentation/
        controllers/
        guards/
      meta-messaging-webhook.module.ts
```

## Claves API

No pegues claves reales en el chat ni las guardes en archivos versionados. La configuracion sensible debe vivir solo en un `.env` local, en variables del proveedor de despliegue o en un gestor de secretos.

## Ejecutar

```bash
pnpm install
pnpm start:dev
```

## Simular chat en terminal

El simulador usa MongoDB para guardar historial/custom fields y OpenAI para responder, pero no llama a Meta ni a GHL.

```bash
pnpm simulate:chat -- --profile offlease-fredericksburg --contact test-lead-1
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

Webhook de Meta Messenger/Instagram:

```text
GET  /webhooks/meta/messaging
POST /webhooks/meta/messaging
```

## Verificacion

```bash
pnpm test
pnpm lint
pnpm build
```

Los tests actuales cubren extraccion de eventos Messenger/Instagram, normalizacion de custom fields, validacion de firma Meta y el formato de custom fields enviado a GHL.

## Flujo Git/GitHub

Este proyecto lo desarrolla una sola persona. Cuando Codex suba cambios a GitHub, debe trabajar directamente sobre `main` y hacer push a `main`. No crear ramas nuevas salvo que se pida explicitamente o que el proyecto pase a tener un equipo mas grande.

## Notas de resiliencia

El adaptador `GhlPassiveCrmAdapter` encapsula sus fallos con `Logger`. Si el destino GHL falla, el caso de uso principal no se interrumpe y la respuesta al usuario final por Meta sigue siendo prioritaria.
