import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';

export type SofiaRecommendedAction =
  | 'sofia_call'
  | 'send_whatsapp'
  | 'send_sms'
  | 'confirm_appointment'
  | 'request_documents'
  | 'reengage_lead'
  | 'create_bdc_task'
  | 'notify_manager';

export type SofiaActionType =
  | 'call_with_retell'
  | 'send_sms'
  | 'send_whatsapp'
  | 'confirm_appointment'
  | 'request_documents'
  | 'reengage_lead'
  | 'leave_voicemail'
  | 'create_task'
  | 'update_lead_status';

export type SofiaPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SofiaRiskLevel = 'low' | 'medium' | 'high';
export type SofiaChannel = 'messenger' | 'instagram' | 'whatsapp' | 'sms' | 'phone' | 'internal';

export interface SofiaContext {
  lead: {
    id: string;
    contactId: string;
    channel: string;
    pageId?: string;
    name?: string | null;
    phone?: string;
    email?: string;
    status: string;
  };
  dealer: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
  buyerDNA: LeadCustomFields;
  qualification: {
    status: string;
    completedAt?: Date;
    missingFields: string[];
  };
  conversationSummary: string;
  lastMessages: Array<{
    id: string;
    direction: string;
    kind: string;
    text: string;
    occurredAt: Date;
  }>;
  activities: unknown[];
  appointment: { status: 'unknown' | 'requested' | 'confirmed'; details?: string };
  documents: { status: string; complete: boolean };
  lastContact?: Date;
  rules: string[];
  riskFactors: string[];
  opportunities: string[];
}

export interface SofiaRecommendation {
  recommendedAction: SofiaRecommendedAction;
  priority: SofiaPriority;
  reason: string;
  confidence: number;
  potentialRevenue: number | null;
  nextBestActions: SofiaRecommendedAction[];
  riskLevel: SofiaRiskLevel;
  suggestedChannel: SofiaChannel;
  prompt: string;
}

export interface ExecuteSofiaActionInput {
  leadId: string;
  actionType: SofiaActionType;
  channel: SofiaChannel;
  approvedByUser: boolean;
  payload?: Record<string, unknown>;
}
