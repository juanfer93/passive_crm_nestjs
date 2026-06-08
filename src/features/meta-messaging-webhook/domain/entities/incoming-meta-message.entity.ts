import {
  ConversationMessageKind,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export interface IncomingMetaMessage {
  messageId: string;
  channel: MetaMessagingChannel;
  contactId: string;
  pageId?: string;
  kind: ConversationMessageKind;
  text?: string;
  mediaReference?: string;
  occurredAt: Date;
}
