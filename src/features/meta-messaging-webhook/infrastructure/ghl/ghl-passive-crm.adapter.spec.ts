import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { GhlPassiveCrmAdapter } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-passive-crm.adapter';

describe('GhlPassiveCrmAdapter', () => {
  it('sends only known custom fields with values', async () => {
    const axiosRef = {
      get: jest.fn().mockResolvedValue({ data: { contacts: [{ id: 'contact-1' }] } }),
      put: jest.fn().mockResolvedValue({ data: {} }),
    };
    const adapter = new GhlPassiveCrmAdapter(
      { axiosRef } as unknown as HttpService,
      configService(),
    );

    await adapter.updateCustomFields('3055550101', {
      purchase_timeline: 'este mes',
      vehicle_type: undefined,
      down_payment: '',
      document_status: false,
      phone: '3055550101',
    });

    expect(axiosRef.put).toHaveBeenCalledWith(
      'https://services.leadconnectorhq.com/contacts/contact-1',
      {
        customFields: [
          { key: 'purchase_timeline', value: 'este mes' },
          { key: 'document_status', value: false },
          { key: 'phone', value: '3055550101' },
        ],
      },
      {
        headers: {
          Authorization: 'Bearer ghl-token',
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
      },
    );
  });
});

function configService(): ConfigService {
  const values: Record<string, string> = {
    GHL_ACCESS_TOKEN: 'ghl-token',
    GHL_API_BASE_URL: 'https://services.leadconnectorhq.com',
    GHL_API_VERSION: '2021-07-28',
    GHL_LOCATION_ID: 'location-1',
  };

  return {
    get: <T>(key: string, defaultValue?: T) => (values[key] ?? defaultValue) as T,
    getOrThrow: <T>(key: string) => values[key] as T,
  } as unknown as ConfigService;
}
