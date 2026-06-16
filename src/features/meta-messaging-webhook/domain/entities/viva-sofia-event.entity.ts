export type VivaSofiaEventType =
  | 'lead.created'
  | 'lead.updated'
  | 'buyer_dna_updated'
  | 'appointment.created'
  | 'document.received'
  | 'whatsapp.message_received';

export interface VivaSofiaEventPayload {
  event: VivaSofiaEventType;
  dealerId: number;
  leadId: string;
  ghlContactId: string | null;
  metaUserId?: string | null;
  customerName: string | null;
  phone: string | null;
  vehicle_category: string | null;
  vehicle_interest: string | null;
  down_payment: number | null;
  purchase_timeline: string | null;
  document_status: string;
  bank_account_status: string;
  preferred_language: string | null;
  conversation_summary: string;
  appointment_date?: string | null;
  conversation: {
    lastMessage: string | null;
    channel: string;
    pageId: string | null;
    contactId: string;
    conversationId?: string | null;
  };
  ghl?: {
    locationId: string | null;
    contactId: string | null;
    conversationId: string | null;
    messageId: string | null;
  };
  metrics?: {
    customer_message_timestamp: string | null;
    ghl_webhook_received_at: string | null;
    nestjs_processed_at: string | null;
    viva_event_sent_at: string | null;
  };
}
