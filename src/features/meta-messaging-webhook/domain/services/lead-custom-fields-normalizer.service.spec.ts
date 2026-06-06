import {
  normalizeLeadCustomFields,
  normalizePhone,
} from '@/features/meta-messaging-webhook/domain/services/lead-custom-fields-normalizer.service';

describe('lead custom fields normalizer', () => {
  it('normalizes supported lead custom fields from OpenAI JSON', () => {
    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          purchase_timeline: ' este mes ',
          vehicle_type: 'SUV',
          down_payment: '$2,000',
          document_status: true,
          phone: '+1 (305) 555-0101',
          ignored: 'value',
        }),
      ),
    ).toEqual({
      purchase_timeline: 'este mes',
      vehicle_type: 'SUV',
      down_payment: '$2,000',
      document_status: true,
      phone: '3055550101',
    });
  });

  it('keeps non +1 country codes without plus sign', () => {
    expect(normalizePhone('+57 300 555 0101')).toBe('573005550101');
  });

  it('omits unknown, empty, null-like, invalid, or too-short values', () => {
    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          purchase_timeline: 'null',
          vehicle_type: '',
          down_payment: null,
          document_status: 'pendiente',
          phone: '1234',
        }),
      ),
    ).toEqual({
      purchase_timeline: undefined,
      vehicle_type: undefined,
      down_payment: undefined,
      document_status: 'pendiente',
      phone: undefined,
    });

    expect(normalizeLeadCustomFields('not-json')).toEqual({});
  });
});
