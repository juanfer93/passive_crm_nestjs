import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

const POSITIVE_DOCUMENT_VALUES = [
  'confirmed',
  'received',
  'uploaded',
  'yes',
  'si',
  'sí',
  'true',
  'itin',
  'ssn',
  'social',
  'passport',
  'pasaporte',
  'id',
  'license',
  'licencia',
];

export interface VivaBuyerSnapshot {
  vehicle_category: string | null;
  vehicle_interest: string | null;
  down_payment: number | null;
  purchase_timeline: string | null;
  document_status: string;
  bank_account_status: string;
  preferred_language: string | null;
  appointment_date: string | null;
}

export function buildVivaBuyerSnapshot(fields: LeadCustomFields): VivaBuyerSnapshot {
  return {
    vehicle_category: normalizeVehicleType(fields.vehicle_type),
    vehicle_interest: normalizeNullable(fields.vehicle_interest),
    down_payment: parseDownPayment(fields.down_payment),
    purchase_timeline: normalizeTimelineValue(fields.purchase_timeline),
    document_status: normalizeTimelineValue(fields.document_status) ?? 'unknown',
    bank_account_status: normalizeTimelineValue(fields.bank_account_status) ?? inferBankAccountStatus(fields),
    preferred_language: normalizeLanguage(fields.language),
    appointment_date: normalizeNullable(fields.appointment_date),
  };
}

export function buildVivaConversationSummary(
  fields: LeadCustomFields,
  messages: ConversationMessage[],
): string {
  const lastInbound = lastInboundMessage(messages);
  const parts = [
    fields.vehicle_interest ?? fields.vehicle_type
      ? `Cliente busca ${fields.vehicle_interest ?? fields.vehicle_type}`
      : undefined,
    fields.down_payment ? `tiene ${fields.down_payment} de down` : undefined,
    fields.credit_profile ? `credito: ${fields.credit_profile}` : undefined,
    fields.purchase_timeline ? `timeline: ${fields.purchase_timeline}` : undefined,
    fields.document_status ? `documentos: ${fields.document_status}` : undefined,
    fields.bank_account_status ? `cuenta bancaria: ${fields.bank_account_status}` : undefined,
    fields.language ? `idioma: ${fields.language}` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return lastInbound?.text ?? 'Lead conversation update received by NestJS.';
}

export function hasBuyerDNAChanged(previous: LeadCustomFields, current: LeadCustomFields): boolean {
  return JSON.stringify(buildVivaBuyerSnapshot(previous)) !== JSON.stringify(buildVivaBuyerSnapshot(current));
}

export function hasDocumentationJustReceived(
  previous: LeadCustomFields,
  current: LeadCustomFields,
): boolean {
  return !hasDocumentationSignal(previous.document_status) && hasDocumentationSignal(current.document_status);
}

export function hasAppointmentJustCreated(
  previous: LeadCustomFields,
  current: LeadCustomFields,
): boolean {
  return !normalizeNullable(previous.appointment_date) && Boolean(normalizeNullable(current.appointment_date));
}

export function lastInboundMessage(messages: ConversationMessage[]): ConversationMessage | undefined {
  return messages
    .slice()
    .reverse()
    .find((message) => message.direction === 'inbound');
}

export function parseDownPayment(value?: string): number | null {
  if (!value) return null;

  const normalized = value.toLowerCase().replace(/,/g, '').trim();
  const match = normalized.match(/\d+(\.\d+)?/);

  if (!match) return null;

  const parsed = Number(match[0]);

  if (Number.isNaN(parsed)) return null;

  return normalized.includes('k') ? Math.round(parsed * 1000) : Math.round(parsed);
}

function normalizeVehicleType(value?: string): string | null {
  const normalized = normalizeForMatching(value);

  if (!normalized) return null;
  if (normalized.includes('truck') || normalized.includes('troca') || normalized.includes('pickup')) return 'truck';
  if (normalized.includes('suv')) return 'SUV';
  if (normalized.includes('sedan') || normalized.includes('carro') || normalized.includes('auto')) return 'sedan';

  return normalizeTimelineValue(value);
}

function normalizeLanguage(value?: string): string | null {
  const normalized = normalizeForMatching(value);

  if (!normalized) return null;
  if (normalized.startsWith('es') || normalized.includes('spanish') || normalized.includes('espanol')) return 'es';
  if (normalized.startsWith('en') || normalized.includes('english') || normalized.includes('ingles')) return 'en';

  return normalizeTimelineValue(value);
}

function hasDocumentationSignal(value?: string): boolean {
  const normalized = normalizeForMatching(value);

  if (!normalized) return false;

  return POSITIVE_DOCUMENT_VALUES.some((positiveValue) => normalized.includes(positiveValue));
}

function inferBankAccountStatus(fields: LeadCustomFields): string {
  const normalized = normalizeForMatching(fields.document_status);

  if (
    normalized.includes('bank') ||
    normalized.includes('banco') ||
    normalized.includes('account') ||
    normalized.includes('cuenta')
  ) {
    return 'has_active_bank_account';
  }

  return 'unknown';
}

function normalizeNullable(value?: string): string | null {
  return value?.trim() || null;
}

function normalizeTimelineValue(value?: string): string | null {
  const normalized = normalizeForMatching(value);

  if (!normalized) return null;

  return normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function normalizeForMatching(value?: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
