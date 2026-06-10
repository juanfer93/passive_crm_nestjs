import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import { FollowUpState } from '@/features/meta-messaging-webhook/domain/entities/follow-up-state.entity';
import {
  LeadCustomFields,
  LeadQualificationStatus,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export interface ConversationState {
  channel: MetaMessagingChannel;
  pageId?: string;
  contactId: string;
  messages: ConversationMessage[];
  customerProfile?: CustomerProfile;
  leadCustomFields: LeadCustomFields;
  qualificationStatus: LeadQualificationStatus;
  qualificationCompletedAt?: Date;
  followUp?: FollowUpState;
}
