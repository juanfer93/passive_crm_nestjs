import { ConversationMessage, MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { DealerProfile } from '@/features/meta-messaging-webhook/domain/entities/dealer-profile.entity';

export interface LeadCustomFields {
  vehicle_interest?: string;
  purchase_timeline?: string;
  lead_temperature?: string;
  vehicle_type?: string;
  down_payment?: string;
  document_status?: string;
  bank_account_status?: string;
  appointment_date?: string;
  phone?: string;
  email?: string;
  language?: string;
  credit_profile?: string;
}

export type LeadQualificationStatus = 'active' | 'completed';

export interface LeadQualificationState {
  customFields: LeadCustomFields;
  status: LeadQualificationStatus;
  completedAt?: Date;
}

export interface LeadCustomFieldsContext {
  channel: MetaMessagingChannel;
  contactId: string;
  recentMessages: ConversationMessage[];
  knownFields?: LeadCustomFields;
  dealerProfile?: DealerProfile;
}

export function hasCompletedLeadCustomFields(fields: LeadCustomFields): boolean {
  return Boolean(
    fields.purchase_timeline &&
      fields.lead_temperature &&
      fields.vehicle_interest &&
      fields.vehicle_type &&
      fields.down_payment &&
      fields.document_status !== undefined &&
      fields.document_status !== null &&
      fields.language &&
      fields.phone,
  );
}
