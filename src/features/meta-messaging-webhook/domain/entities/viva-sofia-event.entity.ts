export type VivaSofiaEventType =
  | 'new_lead'
  | 'buyer_dna_updated'
  | 'purchase_intent_detected'
  | 'documentation_received'
  | 'appointment_created'
  | 'call_completed';

export interface VivaCustomer {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}

export interface VivaBuyerDNA {
  vehicleType: string | null;
  vehicleInterest: string | null;
  downPayment: number | null;
  creditProfile: string | null;
  timeline: string | null;
  language: string | null;
}

export interface VivaLeadIntent {
  purchaseIntent: number;
  readyBuyer: boolean;
}

export interface VivaConversationContext {
  summary: string;
  lastMessage: string | null;
  channel: string;
  pageId: string | null;
  contactId: string;
}

export interface VivaSofiaEventPayload {
  event: VivaSofiaEventType;
  leadId: string;
  ghlContactId: string | null;
  customer: VivaCustomer;
  buyerDNA: VivaBuyerDNA;
  intent: VivaLeadIntent;
  conversation: VivaConversationContext;
}
