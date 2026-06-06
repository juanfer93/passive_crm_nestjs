import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export const CRM_SINK = Symbol('CRM_SINK');

export interface CrmSinkPort {
  recordConversationMessage(message: ConversationMessage, contactPhone: string): Promise<void>;
  updateCustomFields(contactPhone: string, fields: LeadCustomFields): Promise<void>;
  replaceStatusTags(contactPhone: string, tags: string[]): Promise<void>;
}
