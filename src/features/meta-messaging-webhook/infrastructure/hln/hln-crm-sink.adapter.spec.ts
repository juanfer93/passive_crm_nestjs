import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { HlnCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/hln-crm-sink.adapter';

describe('HlnCrmSinkAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends customer names from customerProfile instead of using the Meta user id as name', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    const adapter = new HlnCrmSinkAdapter(
      configService({
        HLN_SYNC_ENABLED: 'true',
        HLN_WEBHOOK_URL: 'https://hln.example/webhook',
        HLN_DEALER_ID: '4',
      }),
    );

    await adapter.updateCustomFields(
      '3055555555',
      {
        phone: '3055555555',
        language: 'es',
        purchase_timeline: 'esta semana',
        lead_temperature: 'hot',
        vehicle_interest: 'Toyota Corolla',
        vehicle_type: 'Sedan',
        down_payment: '2000',
        document_status: 'confirmed',
      },
      {
        channel: 'messenger',
        pageId: 'page-1',
        contactId: '9334258666654026',
        conversationKey: 'messenger:page-1:9334258666654026',
        qualificationCompletedAt: new Date('2026-06-10T01:00:00.000Z'),
        customerProfile: {
          firstName: 'Carlos',
          lastName: 'Ramirez',
          fullName: 'Carlos Ramirez',
          fetchStatus: 'success',
        },
        messages: [
          {
            id: 'message-1',
            channel: 'messenger',
            pageId: 'page-1',
            contactId: '9334258666654026',
            direction: 'inbound',
            kind: 'text',
            text: 'Quiero un Corolla',
            occurredAt: new Date('2026-06-10T00:59:00.000Z'),
          },
        ],
      },
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      metaUserId: string;
      customer: { firstName: string; lastName: string; fullName: string };
    };

    expect(payload.metaUserId).toBe('9334258666654026');
    expect(payload.customer).toEqual(
      expect.objectContaining({
        firstName: 'Carlos',
        lastName: 'Ramirez',
        fullName: 'Carlos Ramirez',
      }),
    );
    expect(payload.customer.fullName).not.toBe('9334258666654026');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'hln_webhook_sent',
        conversationKey: 'messenger:page-1:9334258666654026',
      }),
    );
  });

  it('does not require a successful Meta profile to send the complete lead sync payload', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    const adapter = new HlnCrmSinkAdapter(
      configService({
        HLN_SYNC_ENABLED: 'true',
        HLN_WEBHOOK_URL: 'https://hln.example/webhook',
        HLN_DEALER_ID: '4',
      }),
    );

    await adapter.updateCustomFields(
      '3055555555',
      {
        phone: '3055555555',
        language: 'es',
        purchase_timeline: 'esta semana',
        lead_temperature: 'hot',
        vehicle_interest: 'Toyota Corolla',
        vehicle_type: 'Sedan',
        down_payment: '2000',
        document_status: 'confirmed',
      },
      {
        channel: 'messenger',
        contactId: '9334258666654026',
        conversationKey: 'messenger:page-1:9334258666654026',
        customerProfile: {
          fetchStatus: 'failed',
        },
        messages: [],
      },
    );

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      metaUserId: string;
      customer: { firstName: string | null; lastName: string | null; fullName: string | null };
    };

    expect(payload.metaUserId).toBe('9334258666654026');
    expect(payload.customer).toEqual(
      expect.objectContaining({
        firstName: null,
        lastName: null,
        fullName: null,
      }),
    );
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'hln_webhook_sent',
        conversationKey: 'messenger:page-1:9334258666654026',
      }),
    );
  });

  it('does not send to HLN until required fields are available', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    const adapter = new HlnCrmSinkAdapter(
      configService({
        HLN_SYNC_ENABLED: 'true',
        HLN_WEBHOOK_URL: 'https://hln.example/webhook',
        HLN_DEALER_ID: '4',
      }),
    );

    await adapter.updateCustomFields(
      '3055555555',
      {
        phone: '3055555555',
        language: 'es',
        purchase_timeline: 'esta semana',
        lead_temperature: 'hot',
        vehicle_type: 'Sedan',
        down_payment: '2000',
        document_status: 'confirmed',
      },
      {
        channel: 'messenger',
        contactId: '9334258666654026',
        conversationKey: 'messenger:page-1:9334258666654026',
        customerProfile: {
          firstName: 'Carlos',
          fullName: 'Carlos',
          fetchStatus: 'success',
        },
        messages: [],
      },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'hln_webhook_skipped',
        reasons: expect.arrayContaining(['leadCustomFields.vehicle_interest is missing']),
      }),
    );
  });

  it('logs when HLN sync is disabled', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    jest.spyOn(global, 'fetch').mockImplementation(fetchMock);
    const adapter = new HlnCrmSinkAdapter(
      configService({
        HLN_SYNC_ENABLED: 'false',
        HLN_WEBHOOK_URL: 'https://hln.example/webhook',
        HLN_DEALER_ID: '4',
      }),
    );

    await adapter.updateCustomFields('3055555555', { phone: '3055555555' }, {
      channel: 'messenger',
      contactId: '9334258666654026',
      conversationKey: 'messenger:page-1:9334258666654026',
      messages: [],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'hln_webhook_skipped',
        reason: 'HLN_SYNC_ENABLED is not true',
        conversationKey: 'messenger:page-1:9334258666654026',
      }),
    );
  });
});

function configService(values: Record<string, string>): ConfigService {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService;
}
