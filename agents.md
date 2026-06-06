# Passive CRM Agent Context

## Project Summary

This is a NestJS 10 backend written in TypeScript. It receives Meta Messenger and Instagram Messaging webhooks, stores chat history in MongoDB, uses OpenAI to reply and extract lead custom fields, then syncs structured JSON to GoHighLevel.

The package manager is pnpm.

## Architecture

- `src/main.ts`: Nest bootstrap.
- `src/app.module.ts`: global config, MongoDB connection, feature modules.
- `src/features/meta-messaging-webhook`: legacy folder name; current behavior is Meta Messenger/Instagram messaging.
- `domain`: source of truth for types, entities, and ports.
- `application`: use cases and orchestration.
- `infrastructure`: adapters for MongoDB, Meta, OpenAI, GHL, and background tasks.
- `presentation`: Nest controllers and guards.

## Current Webhook Flow

1. Meta calls `GET /webhooks/meta/messaging` for verification.
2. Meta calls `POST /webhooks/meta/messaging` for Messenger/Instagram events.
3. The controller returns `200 OK` immediately.
4. `AcceptMetaWebhookUseCase` schedules processing in background.
5. `ProcessIncomingMetaMessageUseCase` extracts `entry.messaging` events, reserves the message ID in MongoDB, and skips duplicates.
6. Conversations are stored using `channel + contactId`, where `channel` is `messenger` or `instagram`.
7. OpenAI generates a reply.
8. Meta Send API sends the reply to Messenger or Instagram.
9. A secondary background task asks OpenAI to extract lead custom fields from recent MongoDB history.
10. If a phone is identified, GHL custom fields and conversation messages are synced.

## Lead Custom Fields

The lead extraction JSON is:

```json
{
  "purchase_timeline": "string",
  "vehicle_type": "string",
  "down_payment": "string",
  "document_status": true,
  "phone": "3055555555"
}
```

`phone` is stored as a digit-only string to preserve exact digits. If a US/Canada `+1` number has 11 digits, the leading `1` is removed. Other country codes are kept without `+`.

## Import Rules

Internal imports must use the `@/` alias. The alias is configured in `tsconfig.json` as `@/* -> src/*`.

The build script runs `scripts/resolve-path-aliases.js` after `nest build` so compiled `dist` files do not keep unresolved `@/` runtime imports.

## Verification

Run these before handing off changes:

```bash
pnpm test
pnpm lint
pnpm build
```

If pnpm is unavailable in the local shell but dependencies already exist, `npm.cmd test`, `npm.cmd run lint`, and `npm.cmd run build` are acceptable for local verification on Windows.

## Notes

- Do not treat native GHL workflows as business logic. NestJS owns the business logic.
- GHL failures are logged and should not block the primary user response.
- The folder name `meta-messaging-webhook` is historical and can be renamed later as a separate cleanup.
