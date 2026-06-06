import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export const META_MESSENGER = Symbol('META_MESSENGER');

export interface MetaMessengerPort {
  sendTextMessage(channel: MetaMessagingChannel, recipientId: string, text: string): Promise<void>;
}
