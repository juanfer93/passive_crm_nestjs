import {
  LeadCustomFields,
  LeadCustomFieldsContext,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export const LEAD_CUSTOM_FIELDS_EXTRACTOR = Symbol('LEAD_CUSTOM_FIELDS_EXTRACTOR');

export interface LeadCustomFieldsExtractorPort {
  extractLeadCustomFields(context: LeadCustomFieldsContext): Promise<LeadCustomFields>;
}
