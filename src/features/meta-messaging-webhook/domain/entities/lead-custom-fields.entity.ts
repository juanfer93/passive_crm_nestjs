import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export interface LeadCustomFields {
  purchase_timeline?: string;
  vehicle_type?: string;
  down_payment?: string;
  document_status?: boolean | string;
  phone?: string;
}

export interface LeadCustomFieldsContext {
  channel: MetaMessagingChannel;
  contactId: string;
  recentMessages: ConversationMessage[];
}
