import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

const followUpPrefixes = [
  'Hola, solo paso a confirmar:',
  'Cuando tengas un momento,',
  'Cuando quieras continuar, puedes responder por aqui y con gusto retomamos:',
];

export function buildLeadFollowUpMessage(fields: LeadCustomFields, attempt: number): string {
  const prefix = followUpPrefixes[Math.min(Math.max(attempt - 1, 0), followUpPrefixes.length - 1)];
  const question = nextPendingQuestion(fields);

  return `${prefix} ${question}`;
}

function nextPendingQuestion(fields: LeadCustomFields): string {
  if (!fields.purchase_timeline) {
    return 'para cuando te gustaria tener tu vehiculo, esta semana, este mes o solo estas mirando?';
  }

  if (!fields.vehicle_type) {
    return 'buscas un sedan, un SUV o una troca?';
  }

  if (!fields.down_payment) {
    return 'con cuanto contarias para el enganche?';
  }

  if (fields.document_status === undefined || fields.document_status === null) {
    return 'cuentas con identificacion vigente y cuenta bancaria?';
  }

  if (!fields.phone) {
    return 'cual es el mejor numero para contactarte?';
  }

  return 'si quieres continuar, responde este mensaje y retomamos por aqui.';
}
