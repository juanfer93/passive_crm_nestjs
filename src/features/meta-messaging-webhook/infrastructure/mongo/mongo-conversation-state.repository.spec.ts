import { Model } from 'mongoose';
import { MongoConversationStateRepository } from '@/features/meta-messaging-webhook/infrastructure/mongo/mongo-conversation-state.repository';
import {
  ConversationDocument,
} from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';

describe('MongoConversationStateRepository', () => {
  it('keeps the same contact separated by Meta page id', async () => {
    const updateOne = jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) }));
    const repository = new MongoConversationStateRepository({
      updateOne,
    } as unknown as Model<ConversationDocument>);

    await repository.appendMessage({
      id: 'message-1',
      channel: 'messenger',
      pageId: 'page-1',
      contactId: 'same-contact',
      direction: 'inbound',
      kind: 'text',
      text: 'Hola page 1',
      occurredAt: new Date('2026-06-09T23:00:00.000Z'),
    });
    await repository.appendMessage({
      id: 'message-2',
      channel: 'messenger',
      pageId: 'page-2',
      contactId: 'same-contact',
      direction: 'inbound',
      kind: 'text',
      text: 'Hola page 2',
      occurredAt: new Date('2026-06-09T23:01:00.000Z'),
    });

    expect(updateOne).toHaveBeenNthCalledWith(
      1,
      { conversationKey: 'messenger:page-1:same-contact' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          conversationKey: 'messenger:page-1:same-contact',
          pageId: 'page-1',
        }),
      }),
      { upsert: true },
    );
    expect(updateOne).toHaveBeenNthCalledWith(
      2,
      { conversationKey: 'messenger:page-2:same-contact' },
      expect.objectContaining({
        $setOnInsert: expect.objectContaining({
          conversationKey: 'messenger:page-2:same-contact',
          pageId: 'page-2',
        }),
      }),
      { upsert: true },
    );
  });
});
