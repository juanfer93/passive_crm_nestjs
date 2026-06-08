import {
  normalizeLeadCustomFields,
  normalizePhone,
} from '@/features/meta-messaging-webhook/domain/services/lead-custom-fields-normalizer.service';

describe('lead custom fields normalizer', () => {
  it('normalizes supported lead custom fields from OpenAI JSON', () => {
    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          vehicle_interest: ' Toyota Tacoma 2022 ',
          purchase_timeline: ' este mes ',
          lead_temperature: 'hot',
          vehicle_type: 'Truck',
          down_payment: '$2,000',
          document_status: true,
          phone: '+1 (305) 555-0101',
          email: 'CARLOS.TEST@EXAMPLE.COM',
          language: 'Spanish',
          credit_profile: 'rebuilding',
          ignored: 'value',
        }),
      ),
    ).toEqual({
      vehicle_interest: 'Toyota Tacoma 2022',
      purchase_timeline: 'este mes',
      lead_temperature: 'warm',
      vehicle_type: 'Troca',
      down_payment: '$2,000',
      document_status: 'confirmed',
      phone: '3055550101',
      email: 'carlos.test@example.com',
      language: 'es',
      credit_profile: 'rebuilding',
    });
  });

  it('classifies vehicle interest when the model name is known', () => {
    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          vehicle_interest: 'Toyota Corolla',
        }),
      ).vehicle_type,
    ).toBe('Sedan');

    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          vehicle_interest: 'Toyota RAV4',
        }),
      ).vehicle_type,
    ).toBe('SUV');
  });

  it('keeps non +1 country codes without plus sign', () => {
    expect(normalizePhone('+57 300 555 0101')).toBe('573005550101');
  });

  it('keeps document status as a string even when OpenAI returns a boolean', () => {
    expect(normalizeLeadCustomFields(JSON.stringify({ document_status: true }))).toEqual({
      document_status: 'confirmed',
    });

    expect(normalizeLeadCustomFields(JSON.stringify({ document_status: false }))).toEqual({
      document_status: 'not_confirmed',
    });
  });

  it('omits unknown, empty, null-like, invalid, or too-short values', () => {
    expect(
      normalizeLeadCustomFields(
        JSON.stringify({
          vehicle_interest: '',
          purchase_timeline: 'null',
          lead_temperature: null,
          vehicle_type: '',
          down_payment: null,
          document_status: 'pendiente',
          phone: '1234',
          email: 'not-an-email',
          language: 'unknown',
          credit_profile: '',
        }),
      ),
    ).toEqual({
      vehicle_interest: undefined,
      purchase_timeline: undefined,
      lead_temperature: undefined,
      vehicle_type: undefined,
      down_payment: undefined,
      document_status: 'pendiente',
      phone: undefined,
      email: undefined,
      language: undefined,
      credit_profile: undefined,
    });

    expect(normalizeLeadCustomFields('not-json')).toEqual({});
  });
});
