import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { DealerProfile } from '@/features/meta-messaging-webhook/domain/entities/dealer-profile.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export interface AssistantContext {
  channel: MetaMessagingChannel;
  contactId: string;
  userMessage: string;
  recentMessages: ConversationMessage[];
  hasPriorConversation: boolean;
  leadCustomFields: LeadCustomFields;
  dealerProfile: DealerProfile;
}
