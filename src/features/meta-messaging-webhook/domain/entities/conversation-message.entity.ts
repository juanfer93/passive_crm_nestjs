export type ConversationMessageDirection = 'inbound' | 'outbound';
export type ConversationMessageKind = 'text' | 'audio' | 'image' | 'unknown';
export type MetaMessagingChannel = 'messenger' | 'instagram';

export interface ConversationMessage {
  id: string;
  channel: MetaMessagingChannel;
  contactId: string;
  direction: ConversationMessageDirection;
  kind: ConversationMessageKind;
  text: string;
  occurredAt: Date;
}
