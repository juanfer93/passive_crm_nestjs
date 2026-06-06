import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';
import { MetaWebhookPayload } from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';

describe('MetaWebhookMessageExtractor', () => {
  const extractor = new MetaWebhookMessageExtractor();

  it('extracts Messenger text messages from entry.messaging', () => {
    const payload: MetaWebhookPayload = {
      object: 'page',
      entry: [
        {
          id: 'page-1',
          messaging: [
            {
              sender: { id: 'sender-1' },
              timestamp: 1710000000000,
              message: {
                mid: 'mid-1',
                text: 'Busco una SUV este mes',
              },
            },
          ],
        },
      ],
    };

    expect(extractor.extract(payload)).toEqual([
      {
        messageId: 'mid-1',
        channel: 'messenger',
        contactId: 'sender-1',
        kind: 'text',
        text: 'Busco una SUV este mes',
        mediaReference: undefined,
        occurredAt: new Date(1710000000000),
      },
    ]);
  });

  it('extracts Instagram image attachments as media references', () => {
    const payload: MetaWebhookPayload = {
      object: 'instagram',
      entry: [
        {
          id: 'ig-1',
          messaging: [
            {
              sender: { id: 'ig-sender-1' },
              timestamp: 1710000001000,
              message: {
                mid: 'ig-mid-1',
                attachments: [
                  {
                    type: 'image',
                    payload: { url: 'https://cdn.example/image.jpg' },
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    expect(extractor.extract(payload)).toEqual([
      {
        messageId: 'ig-mid-1',
        channel: 'instagram',
        contactId: 'ig-sender-1',
        kind: 'image',
        text: undefined,
        mediaReference: 'https://cdn.example/image.jpg',
        occurredAt: new Date(1710000001000),
      },
    ]);
  });

  it('ignores unsupported Meta objects and events without sender/message', () => {
    expect(extractor.extract({ object: 'whatsapp_business_account', entry: [] })).toEqual([]);

    expect(
      extractor.extract({
        object: 'page',
        entry: [{ id: 'page-1', messaging: [{ sender: { id: 'sender-1' } }] }],
      }),
    ).toEqual([]);
  });
});
