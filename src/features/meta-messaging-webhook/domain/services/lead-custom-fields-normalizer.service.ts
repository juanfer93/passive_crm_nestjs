import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export function normalizeLeadCustomFields(content?: string | null): LeadCustomFields {
  if (!content) {
    return {};
  }

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const purchaseTimeline = stringOrUndefined(parsed.purchase_timeline);
    const vehicleInterest = stringOrUndefined(parsed.vehicle_interest);
    const vehicleType = normalizeVehicleType(parsed.vehicle_type, vehicleInterest);

    return {
      vehicle_interest: vehicleInterest ?? vehicleType,
      purchase_timeline: purchaseTimeline,
      lead_temperature: normalizeLeadTemperature(parsed.lead_temperature, purchaseTimeline),
      vehicle_type: vehicleType,
      down_payment: stringOrUndefined(parsed.down_payment),
      document_status: normalizeDocumentStatus(parsed.document_status),
      bank_account_status: normalizeBankAccountStatus(parsed.bank_account_status),
      appointment_date: stringOrUndefined(parsed.appointment_date),
      phone: normalizePhone(parsed.phone),
      email: normalizeEmail(parsed.email),
      language: normalizeLanguage(parsed.language),
      credit_profile: stringOrUndefined(parsed.credit_profile),
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

function normalizeLeadTemperature(
  value: unknown,
  purchaseTimeline?: string,
): string | undefined {
  const derived = deriveLeadTemperature(purchaseTimeline);

  if (derived) {
    return derived;
  }

  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (normalized.includes('hot')) {
    return 'hot';
  }

  if (normalized.includes('warm')) {
    return 'warm';
  }

  if (normalized.includes('cold')) {
    return 'cold';
  }

  return undefined;
}

function deriveLeadTemperature(purchaseTimeline?: string): string | undefined {
  const normalized = normalizeText(purchaseTimeline);

  if (!normalized) {
    return undefined;
  }

  if (
    [
      'hoy',
      'today',
      'esta semana',
      'this week',
      'this_week',
      'lo mas pronto',
      'lo antes posible',
      'as soon as possible',
      'asap',
      'pronto',
      'soon',
      'inmediatamente',
      'immediate',
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return 'hot';
  }

  if (['este mes', 'this month', 'this_month'].some((phrase) => normalized.includes(phrase))) {
    return 'warm';
  }

  if (
    [
      'solo mirando',
      'just looking',
      'looking around',
      'mirando',
      'not ready',
      'no estoy listo',
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return 'cold';
  }

  return undefined;
}

function normalizeVehicleType(value: unknown, vehicleInterest?: string): string | undefined {
  const normalized = normalizeText([stringOrUndefined(value), vehicleInterest].filter(Boolean).join(' '));

  if (!normalized) {
    return undefined;
  }

  if (
    [
      'troca',
      'truck',
      'pickup',
      'pick up',
      'tacoma',
      'tundra',
      'f150',
      'f 150',
      'silverado',
      'sierra',
      'ram',
      'colorado',
      'ranger',
      'frontier',
      'ridgeline',
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return 'Troca';
  }

  if (
    [
      'suv',
      'rav4',
      'rav 4',
      'highlander',
      '4runner',
      'crv',
      'cr v',
      'pilot',
      'explorer',
      'expedition',
      'escape',
      'edge',
      'tahoe',
      'suburban',
      'traverse',
      'equinox',
      'acadia',
      'pathfinder',
      'rogue',
      'murano',
      'cherokee',
      'wrangler',
      'durango',
      'palisade',
      'santa fe',
      'tucson',
      'telluride',
      'sportage',
      'sorento',
      'forester',
      'outback',
      'crosstrek',
      'cx5',
      'cx 5',
      'cx9',
      'cx 9',
      'bronco',
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return 'SUV';
  }

  if (
    [
      'sedan',
      'corolla',
      'camry',
      'civic',
      'accord',
      'altima',
      'sentra',
      'maxima',
      'elantra',
      'sonata',
      'forte',
      'optima',
      'malibu',
      'impala',
      'charger',
      'versa',
      'avalon',
      'jetta',
      'passat',
      'mazda3',
      'mazda 3',
      'mazda6',
      'mazda 6',
      'prius',
      'accent',
    ].some((phrase) => normalized.includes(phrase))
  ) {
    return 'Sedan';
  }

  return stringOrUndefined(value);
}

function normalizeEmail(value: unknown): string | undefined {
  const raw = stringOrUndefined(value)?.toLowerCase();

  if (!raw) {
    return undefined;
  }

  const match = raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);
  return match?.[0];
}

function normalizeLanguage(value: unknown): string | undefined {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (['spanish', 'espanol', 'es'].some((phrase) => normalized.includes(phrase))) {
    return 'es';
  }

  if (['english', 'ingles', 'en'].some((phrase) => normalized.includes(phrase))) {
    return 'en';
  }

  return undefined;
}

function normalizeBankAccountStatus(value: unknown): string | undefined {
  const normalized = normalizeText(value);

  if (!normalized) {
    return undefined;
  }

  if (
    ['has_active_bank_account', 'active bank', 'cuenta activa', 'bank account', 'cuenta bancaria'].some(
      (phrase) => normalized.includes(phrase),
    )
  ) {
    return 'has_active_bank_account';
  }

  if (['no_bank_account', 'sin cuenta', 'no bank'].some((phrase) => normalized.includes(phrase))) {
    return 'no_bank_account';
  }

  if (normalized.includes('unknown')) {
    return 'unknown';
  }

  return stringOrUndefined(value);
}

function normalizeText(value: unknown): string | undefined {
  return stringOrUndefined(value)
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== 'null' ? trimmed : undefined;
}

function normalizeDocumentStatus(value: unknown): string | undefined {
  if (typeof value === 'boolean') {
    return value ? 'confirmed' : 'not_confirmed';
  }

  return stringOrUndefined(value);
}
