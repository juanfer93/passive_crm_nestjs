export interface MetaWebhookPayload {
  object: string;
  entry?: MetaWebhookEntry[];
}

export interface MetaWebhookEntry {
  id: string;
  time?: number;
  messaging?: MetaMessagingEvent[];
  changes?: MetaWebhookChange[];
}

export interface MetaMessagingEvent {
  sender?: {
    id?: string;
  };
  recipient?: {
    id?: string;
  };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    attachments?: MetaMessagingAttachment[];
  };
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
  };
}

export interface MetaMessagingAttachment {
  type?: string;
  payload?: {
    url?: string;
  };
}

export interface MetaWebhookChange {
  field: string;
  value?: {
    messages?: MetaWebhookMessage[];
    statuses?: unknown[];
  };
}

export interface MetaWebhookMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: {
    body?: string;
  };
  audio?: {
    id?: string;
    mime_type?: string;
  };
  image?: {
    id?: string;
    mime_type?: string;
    caption?: string;
  };
}
