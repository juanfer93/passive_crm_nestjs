import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { ConversationState } from '@/features/meta-messaging-webhook/domain/entities/conversation-state.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import { FollowUpState } from '@/features/meta-messaging-webhook/domain/entities/follow-up-state.entity';
import {
  LeadCustomFields,
  LeadQualificationState,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export const CONVERSATION_STATE_REPOSITORY = Symbol('CONVERSATION_STATE_REPOSITORY');

export interface ConversationStateRepository {
  appendMessage(message: ConversationMessage): Promise<void>;
  getState(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): Promise<ConversationState | null>;
  mergeLeadCustomFields(
    channel: MetaMessagingChannel,
    contactId: string,
    fields: LeadCustomFields,
    pageId?: string,
  ): Promise<LeadQualificationState>;
  reactivateLeadQualification(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): Promise<void>;
  getRecentMessages(
    channel: MetaMessagingChannel,
    contactId: string,
    limit: number,
    pageId?: string,
  ): Promise<ConversationMessage[]>;
  scheduleFollowUp(
    channel: MetaMessagingChannel,
    contactId: string,
    followUp: FollowUpState,
    pageId?: string,
  ): Promise<void>;
  cancelFollowUp(channel: MetaMessagingChannel, contactId: string, pageId?: string): Promise<void>;
  findDueFollowUps(now: Date, limit: number): Promise<ConversationState[]>;
  recordFollowUpAttempt(
    channel: MetaMessagingChannel,
    contactId: string,
    followUp: FollowUpState,
    pageId?: string,
  ): Promise<void>;
  updateCustomerProfile(
    channel: MetaMessagingChannel,
    contactId: string,
    profile: CustomerProfile,
    pageId?: string,
  ): Promise<void>;
}
