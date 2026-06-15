export type ConversationMessageDirection = 'inbound' | 'outbound';
export type ConversationMessageKind = 'text' | 'audio' | 'image' | 'unknown';
export type MetaMessagingChannel = 'messenger' | 'instagram' | 'whatsapp';

export interface ConversationMessage {
  id: string;
  channel: MetaMessagingChannel;
  pageId?: string;
  contactId: string;
  direction: ConversationMessageDirection;
  kind: ConversationMessageKind;
  text: string;
  occurredAt: Date;
}
