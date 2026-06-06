# Project Skills

## Meta Messaging Webhooks

Use this project skill when changing inbound Messenger or Instagram behavior.

- Primary webhook route: `GET/POST /webhooks/meta/messaging`.
- Expected Meta payload source: `entry[].messaging[]`.
- Supported channels: `messenger`, `instagram`.
- Chat identity: `channel + sender.id`.
- Do not assume a phone number exists in the inbound platform payload.

## Lead Field Extraction

Use this project skill when changing lead qualification or vehicle preference logic.

- The domain types are the truth source.
- Current type: `LeadCustomFields`.
- OpenAI extracts fields from recent MongoDB conversation history.
- Unknown values should be omitted before writing to GHL.
- Phone values should be normalized to digits only and kept as strings.

## GHL Sync

Use this project skill when changing CRM behavior.

- GHL writes are secondary and non-blocking.
- A GHL contact is currently resolved by phone.
- If no phone has been extracted yet, CRM sync is skipped for that message.
- Custom fields are sent as JSON keys matching the domain type names.

## Import Hygiene

Use `@/` for internal source imports. After source import changes, run:

```bash
pnpm build
```

The build also rewrites compiled aliases through `scripts/resolve-path-aliases.js`.

## Test Hygiene

Use Jest unit tests for business logic and adapter payload shaping. Avoid tests that call Meta, OpenAI, GHL, or MongoDB over the network unless explicitly setting up integration tests.
