import { ConversationMessageKind } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export interface GhlWhatsappWakeupPayload {
  source?: string;
  event?: string;
  channel?: string;
  locationId?: string;
  contactId?: string;
  conversationId?: string;
  messageId?: string;
  phone?: string;
  timestamp?: string;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    fullName?: string | null;
    phone?: string | null;
    email?: string | null;
  };
  message?: {
    id?: string | null;
    type?: string | null;
    text?: string | null;
    timestamp?: string | null;
  };
  attachments?: GhlWhatsappAttachment[];
}

export interface GhlWhatsappAttachment {
  type?: string | null;
  url?: string | null;
  name?: string | null;
}

export interface GhlPulledConversationMessage {
  messageId: string;
  direction: 'inbound' | 'outbound';
  kind: ConversationMessageKind;
  text: string;
  occurredAt: Date;
}

export interface GhlConversationPointer {
  locationId: string;
  contactId: string;
  conversationId?: string | null;
  phone?: string | null;
}

export interface GhlWhatsAppSendInput {
  locationId?: string | null;
  contactId: string;
  conversationId?: string | null;
  message: string;
  mediaUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface GhlWhatsAppSendResult {
  provider: 'ghl';
  providerMessageId?: string;
}
