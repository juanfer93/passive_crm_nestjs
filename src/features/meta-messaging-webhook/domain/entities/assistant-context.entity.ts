import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export interface AssistantContext {
  channel: MetaMessagingChannel;
  contactId: string;
  userMessage: string;
  recentMessages: ConversationMessage[];
}
