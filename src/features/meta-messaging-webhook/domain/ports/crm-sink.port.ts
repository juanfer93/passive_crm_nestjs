import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export const CRM_SINK = Symbol('CRM_SINK');

export interface CrmLeadSyncContext {
  channel: ConversationMessage['channel'];
  pageId?: string;
  contactId: string;
  conversationKey: string;
  customerProfile?: CustomerProfile;
  qualificationCompletedAt?: Date;
  messages: ConversationMessage[];
}

export interface CrmSinkPort {
  recordConversationMessage(message: ConversationMessage, contactPhone: string): Promise<void>;
  updateCustomFields(
    contactPhone: string,
    fields: LeadCustomFields,
    context?: CrmLeadSyncContext,
  ): Promise<void>;
  replaceStatusTags(contactPhone: string, tags: string[]): Promise<void>;
}
