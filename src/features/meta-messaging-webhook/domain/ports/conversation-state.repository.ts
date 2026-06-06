import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export const CONVERSATION_STATE_REPOSITORY = Symbol('CONVERSATION_STATE_REPOSITORY');

export interface ConversationStateRepository {
  appendMessage(message: ConversationMessage): Promise<void>;
  getRecentMessages(
    channel: MetaMessagingChannel,
    contactId: string,
    limit: number,
  ): Promise<ConversationMessage[]>;
}
