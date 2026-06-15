import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import {
  VivaBuyerDNA,
  VivaLeadIntent,
} from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';

const POSITIVE_DOCUMENT_VALUES = ['confirmed', 'received', 'uploaded', 'yes', 'si', 'sí', 'true'];

export function buildVivaBuyerDNA(fields: LeadCustomFields): VivaBuyerDNA {
  return {
    vehicleType: normalizeVehicleType(fields.vehicle_type),
    vehicleInterest: normalizeNullable(fields.vehicle_interest),
    downPayment: parseDownPayment(fields.down_payment),
    creditProfile: normalizeTimelineValue(fields.credit_profile),
    timeline: normalizeTimelineValue(fields.purchase_timeline),
    language: normalizeLanguage(fields.language),
  };
}

export function buildVivaIntent(fields: LeadCustomFields): VivaLeadIntent {
  const purchaseIntent = calculatePurchaseIntent(fields);

  return {
    purchaseIntent,
    readyBuyer:
      purchaseIntent >= 80 ||
      Boolean(
        fields.lead_temperature === 'hot' &&
          fields.vehicle_interest &&
          fields.down_payment &&
          fields.phone,
      ),
  };
}

export function buildVivaConversationSummary(
  fields: LeadCustomFields,
  messages: ConversationMessage[],
): string {
  const lastInbound = lastInboundMessage(messages);
  const parts = [
    fields.vehicle_interest ?? fields.vehicle_type
      ? `Customer wants ${fields.vehicle_interest ?? fields.vehicle_type}`
      : undefined,
    fields.down_payment ? `has ${fields.down_payment} down` : undefined,
    fields.credit_profile ? `credit profile: ${fields.credit_profile}` : undefined,
    fields.purchase_timeline ? `timeline: ${fields.purchase_timeline}` : undefined,
    fields.document_status ? `documents: ${fields.document_status}` : undefined,
    fields.language ? `language: ${fields.language}` : undefined,
  ].filter((part): part is string => Boolean(part));

  if (parts.length > 0) {
    return parts.join(', ');
  }

  return lastInbound?.text ?? 'Lead conversation update received by NestJS.';
}

export function hasBuyerDNAChanged(previous: LeadCustomFields, current: LeadCustomFields): boolean {
  return JSON.stringify(buildVivaBuyerDNA(previous)) !== JSON.stringify(buildVivaBuyerDNA(current));
}

export function hasPurchaseIntentJustDetected(
  previous: LeadCustomFields,
  current: LeadCustomFields,
): boolean {
  return !buildVivaIntent(previous).readyBuyer && buildVivaIntent(current).readyBuyer;
}

export function hasDocumentationJustReceived(
  previous: LeadCustomFields,
  current: LeadCustomFields,
): boolean {
  return !hasDocumentationSignal(previous.document_status) && hasDocumentationSignal(current.document_status);
}

export function lastInboundMessage(messages: ConversationMessage[]): ConversationMessage | undefined {
  return messages
    .slice()
    .reverse()
    .find((message) => message.direction === 'inbound');
}

function calculatePurchaseIntent(fields: LeadCustomFields): number {
  let score = 0;
  const normalizedTimeline = normalizeForMatching(fields.purchase_timeline);

  if (fields.lead_temperature === 'hot') score += 30;
  if (fields.lead_temperature === 'warm') score += 15;
  if (
    normalizedTimeline.includes('today') ||
    normalizedTimeline.includes('hoy') ||
    normalizedTimeline.includes('this week') ||
    normalizedTimeline.includes('esta semana') ||
    normalizedTimeline.includes('asap') ||
    normalizedTimeline.includes('lo antes')
  ) {
    score += 20;
  }
  if (fields.vehicle_interest) score += 15;
  if (fields.vehicle_type) score += 10;
  if (fields.down_payment) score += 20;
  if (hasDocumentationSignal(fields.document_status)) score += 15;
  if (fields.phone) score += 10;

  return Math.min(score, 100);
}

function normalizeVehicleType(value?: string): string | null {
  const normalized = normalizeForMatching(value);

  if (!normalized) return null;
  if (normalized.includes('truck') || normalized.includes('troca') || normalized.includes('pickup')) return 'truck';
  if (normalized.includes('suv')) return 'suv';
  if (normalized.includes('sedan') || normalized.includes('carro') || normalized.includes('auto')) return 'sedan';

  return normalizedTimelineValue(value);
}

function parseDownPayment(value?: string): number | null {
  if (!value) return null;

  const normalized = value.toLowerCase().replace(/,/g, '').trim();
  const match = normalized.match(/\d+(\.\d+)?/);

  if (!match) return null;

  const parsed = Number(match[0]);

  if (Number.isNaN(parsed)) return null;

  return normalized.includes('k') ? Math.round(parsed * 1000) : Math.round(parsed);
}

function normalizeLanguage(value?: string): string | null {
  const normalized = normalizeForMatching(value);

  if (!normalized) return null;
  if (normalized.startsWith('es') || normalized.includes('spanish') || normalized.includes('espanol')) return 'es';
  if (normalized.startsWith('en') || normalized.includes('english') || normalized.includes('ingles')) return 'en';

  return normalizedTimelineValue(value);
}

function hasDocumentationSignal(value?: string): boolean {
  const normalized = normalizeForMatching(value);

  if (!normalized) return false;

  return POSITIVE_DOCUMENT_VALUES.some((positiveValue) => normalized.includes(positiveValue));
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
