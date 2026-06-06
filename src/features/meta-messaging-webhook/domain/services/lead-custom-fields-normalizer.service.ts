import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export function normalizeLeadCustomFields(content?: string | null): LeadCustomFields {
  if (!content) {
    return {};
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;

    return {
      purchase_timeline: stringOrUndefined(parsed.purchase_timeline),
      vehicle_type: stringOrUndefined(parsed.vehicle_type),
      down_payment: stringOrUndefined(parsed.down_payment),
      document_status: booleanOrStringOrUndefined(parsed.document_status),
      phone: normalizePhone(parsed.phone),
    };
  } catch {
    return {};
  }
}

export function normalizePhone(value: unknown): string | undefined {
  const raw = typeof value === 'number' ? String(value) : stringOrUndefined(value);

  if (!raw) {
    return undefined;
  }

  const digits = raw.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits.length >= 8 ? digits : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : undefined;
}

function booleanOrStringOrUndefined(value: unknown): boolean | string | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  return stringOrUndefined(value);
}
