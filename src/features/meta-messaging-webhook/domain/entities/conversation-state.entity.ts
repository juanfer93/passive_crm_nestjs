import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import {
  LeadCustomFields,
  LeadQualificationStatus,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export interface ConversationState {
  channel: MetaMessagingChannel;
  contactId: string;
  messages: ConversationMessage[];
  leadCustomFields: LeadCustomFields;
  qualificationStatus: LeadQualificationStatus;
  qualificationCompletedAt?: Date;
}
