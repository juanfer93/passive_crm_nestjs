export function buildCompletedLeadCourtesyReply(userMessage: string): string | null {
  const normalized = normalizeMessage(userMessage);

  if (!hasCourtesyIntent(normalized)) {
    return null;
  }

  if (isEnglishMessage(normalized)) {
    return 'You are welcome. A specialist will contact you soon.';
  }

  return 'Con gusto. Un especialista se comunicará contigo pronto.';
}

function normalizeMessage(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function hasCourtesyIntent(value: string): boolean {
  return [
    'gracias',
    'muchas gracias',
    'mil gracias',
    'ok gracias',
    'perfecto gracias',
    'thank you',
    'thanks',
    'thx',
    'appreciate it',
  ].some((phrase) => value.includes(phrase));
}

function isEnglishMessage(value: string): boolean {
  return ['thank you', 'thanks', 'thx', 'appreciate it'].some((phrase) =>
    value.includes(phrase),
  );
}
