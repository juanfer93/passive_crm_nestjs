import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import {
  GhlPulledConversationMessage,
  GhlWhatsappWakeupPayload,
} from '@/features/meta-messaging-webhook/domain/entities/ghl-whatsapp-event.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { VivaSofiaEventType } from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';
import {
  CONVERSATION_STATE_REPOSITORY,
  ConversationStateRepository,
} from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import {
  LEAD_CUSTOM_FIELDS_EXTRACTOR,
  LeadCustomFieldsExtractorPort,
} from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import {
  MESSAGE_IDEMPOTENCY_STORE,
  MessageIdempotencyStore,
} from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import {
  VIVA_SOFIA_EVENT_PUBLISHER,
  VivaSofiaEventPublisherPort,
} from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';
import {
  buildVivaBuyerSnapshot,
  buildVivaConversationSummary,
  hasAppointmentJustCreated,
  hasBuyerDNAChanged,
  hasDocumentationJustReceived,
  lastInboundMessage,
} from '@/features/meta-messaging-webhook/domain/services/viva-sofia-event-factory.service';
import { GhlMessagingService } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-messaging.service';

interface NormalizedGhlWakeup {
  locationId: string;
  pageId: string;
  contactId: string;
  conversationId: string | null;
  messageId: string | null;
  phone: string | null;
  timestamp: Date | null;
  customerName: string | null;
  webhookReceivedAt: Date;
}

interface ProcessGhlWhatsappResult {
  received: true;
  processedMessages: number;
  recoveredMessages: number;
  events: VivaSofiaEventType[];
}

@Injectable()
export class ProcessGhlWhatsappWakeupUseCase {
  private readonly logger = new Logger(ProcessGhlWhatsappWakeupUseCase.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dealerProfiles: DealerProfileResolver,
    private readonly ghlMessaging: GhlMessagingService,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    @Inject(MESSAGE_IDEMPOTENCY_STORE)
    private readonly idempotencyStore: MessageIdempotencyStore,
    @Inject(LEAD_CUSTOM_FIELDS_EXTRACTOR)
    private readonly leadFieldsExtractor: LeadCustomFieldsExtractorPort,
    @Inject(VIVA_SOFIA_EVENT_PUBLISHER)
    private readonly vivaEvents: VivaSofiaEventPublisherPort,
  ) {}

  async execute(payload: GhlWhatsappWakeupPayload): Promise<ProcessGhlWhatsappResult> {
    const wakeup = this.normalizePayload(payload);
    const previousState = await this.conversationState.getState('whatsapp', wakeup.contactId, wakeup.pageId);
    const pulledMessages = await this.ghlMessaging.pullRecentMessages({
      locationId: wakeup.locationId,
      contactId: wakeup.contactId,
      conversationId: wakeup.conversationId,
      limit: 20,
    });
    const fallbackMessage = this.fallbackMessage(payload, wakeup);
    const inboundMessages = (pulledMessages.length > 0 ? pulledMessages : fallbackMessage ? [fallbackMessage] : [])
      .filter((message) => message.direction === 'inbound')
      .map((message) => this.toConversationMessage(message, wakeup));

    let processedMessages = 0;

    if (wakeup.customerName || wakeup.phone || payload.customer?.email) {
      await this.conversationState.updateCustomerProfile(
        'whatsapp',
        wakeup.contactId,
        this.customerProfile(payload, wakeup),
        wakeup.pageId,
      );
    }

    for (const message of inboundMessages) {
      const isNewMessage = await this.idempotencyStore.reserve(message.id);

      if (!isNewMessage) {
        continue;
      }

      await this.conversationState.appendMessage(message);
      processedMessages += 1;
    }

    if (processedMessages === 0) {
      const events: VivaSofiaEventType[] = ['whatsapp.message_received'];
      await this.publishVivaEvents(wakeup, previousState?.leadCustomFields ?? {}, previousState?.leadCustomFields ?? {}, events);
      return { received: true, processedMessages, recoveredMessages: pulledMessages.length, events };
    }

    const recentMessages = await this.conversationState.getRecentMessages(
      'whatsapp',
      wakeup.contactId,
      12,
      wakeup.pageId,
    );
    const dealerProfile = this.dealerProfiles.resolve({ pageId: wakeup.pageId });
    const extractedFields = await this.leadFieldsExtractor.extractLeadCustomFields({
      channel: 'whatsapp',
      contactId: wakeup.contactId,
      recentMessages,
      knownFields: previousState?.leadCustomFields ?? {},
      dealerProfile,
    });
    const enrichedFields: LeadCustomFields = {
      ...extractedFields,
      ...(wakeup.phone ? { phone: this.phoneDigits(wakeup.phone) } : {}),
      ...(payload.customer?.email ? { email: payload.customer.email } : {}),
    };
    const leadQualification = await this.conversationState.mergeLeadCustomFields(
      'whatsapp',
      wakeup.contactId,
      enrichedFields,
      wakeup.pageId,
    );
    const eventTypes = this.resolveEventTypes(
      previousState?.leadCustomFields ?? {},
      leadQualification.customFields,
      inboundMessages,
    );

    await this.publishVivaEvents(
      wakeup,
      previousState?.leadCustomFields ?? {},
      leadQualification.customFields,
      eventTypes,
    );

    return {
      received: true,
      processedMessages,
      recoveredMessages: Math.max(0, inboundMessages.length - (fallbackMessage ? 1 : 0)),
      events: eventTypes,
    };
  }

  private resolveEventTypes(
    previousFields: LeadCustomFields,
    currentFields: LeadCustomFields,
    messages: ConversationMessage[],
  ): VivaSofiaEventType[] {
    const events: VivaSofiaEventType[] = ['whatsapp.message_received'];

    if (hasBuyerDNAChanged(previousFields, currentFields)) {
      events.push('lead.updated', 'buyer_dna_updated');
    }

    if (hasAppointmentJustCreated(previousFields, currentFields)) {
      events.push('appointment.created');
    }

    if (
      messages.some((message) => message.kind === 'image' || message.kind === 'unknown') ||
      hasDocumentationJustReceived(previousFields, currentFields)
    ) {
      events.push('document.received');
    }

    return [...new Set(events)];
  }

  private async publishVivaEvents(
    wakeup: NormalizedGhlWakeup,
    previousFields: LeadCustomFields,
    currentFields: LeadCustomFields,
    events: VivaSofiaEventType[],
  ): Promise<void> {
    const processedAt = new Date();
    const state = await this.conversationState.getState('whatsapp', wakeup.contactId, wakeup.pageId);
    const fields = state?.leadCustomFields ?? currentFields;
    const messages = state?.messages ?? [];
    const lastInbound = lastInboundMessage(messages);
    const buyerSnapshot = buildVivaBuyerSnapshot(fields);
    const basePayload = {
      dealerId: this.vivaDealerId(),
      leadId: this.leadId(wakeup.locationId, wakeup.contactId),
      ghlContactId: wakeup.contactId,
      metaUserId: null,
      customerName: this.customerName(state?.customerProfile) ?? wakeup.customerName,
      phone: this.vivaPhone(fields.phone ?? wakeup.phone),
      vehicle_category: buyerSnapshot.vehicle_category,
      vehicle_interest: buyerSnapshot.vehicle_interest,
      down_payment: buyerSnapshot.down_payment,
      purchase_timeline: buyerSnapshot.purchase_timeline,
      document_status: buyerSnapshot.document_status,
      bank_account_status: buyerSnapshot.bank_account_status,
      preferred_language: buyerSnapshot.preferred_language,
      conversation_summary: buildVivaConversationSummary(fields, messages),
      appointment_date: buyerSnapshot.appointment_date,
      conversation: {
        lastMessage: lastInbound?.text ?? null,
        channel: 'whatsapp',
        pageId: wakeup.pageId,
        contactId: wakeup.contactId,
        conversationId: wakeup.conversationId,
      },
      ghl: {
        locationId: wakeup.locationId,
        contactId: wakeup.contactId,
        conversationId: wakeup.conversationId,
        messageId: wakeup.messageId,
      },
      metrics: {
        customer_message_timestamp: wakeup.timestamp?.toISOString() ?? lastInbound?.occurredAt.toISOString() ?? null,
        ghl_webhook_received_at: wakeup.webhookReceivedAt.toISOString(),
        nestjs_processed_at: processedAt.toISOString(),
        viva_event_sent_at: null,
      },
    };

    if (events.includes('lead.updated') && !hasBuyerDNAChanged(previousFields, fields)) {
      this.logger.debug({ event: 'ghl_whatsapp_lead_updated_without_snapshot_change', leadId: basePayload.leadId });
    }

    for (const event of events) {
      await this.vivaEvents.publish({
        ...basePayload,
        event,
        metrics: {
          ...basePayload.metrics,
          viva_event_sent_at: new Date().toISOString(),
        },
      });
    }
  }

  private fallbackMessage(
    payload: GhlWhatsappWakeupPayload,
    wakeup: NormalizedGhlWakeup,
  ): GhlPulledConversationMessage | null {
    const text = payload.message?.text?.trim();

    if (!text) {
      return null;
    }

    return {
      messageId: payload.message?.id ?? wakeup.messageId ?? `ghl:${wakeup.conversationId ?? wakeup.contactId}:${text.slice(0, 32)}`,
      direction: 'inbound',
      kind: this.kindFromPayload(payload),
      text,
      occurredAt: wakeup.timestamp ?? new Date(),
    };
  }

  private toConversationMessage(
    message: GhlPulledConversationMessage,
    wakeup: NormalizedGhlWakeup,
  ): ConversationMessage {
    return {
      id: message.messageId.startsWith('ghl:') ? message.messageId : `ghl:${wakeup.locationId}:${message.messageId}`,
      channel: 'whatsapp',
      pageId: wakeup.pageId,
      contactId: wakeup.contactId,
      direction: 'inbound',
      kind: message.kind,
      text: message.text,
      occurredAt: message.occurredAt,
    };
  }

  private normalizePayload(payload: GhlWhatsappWakeupPayload): NormalizedGhlWakeup {
    const locationId = payload.locationId ?? this.config.get<string>('GHL_LOCATION_ID');
    const contactId = payload.contactId ?? this.phoneDigits(payload.phone ?? payload.customer?.phone);

    if (!locationId) {
      throw new BadRequestException('GHL locationId is required.');
    }

    if (!contactId) {
      throw new BadRequestException('GHL contactId or phone is required.');
    }

    return {
      locationId,
      pageId: `ghl:${locationId}`,
      contactId,
      conversationId: payload.conversationId ?? null,
      messageId: payload.messageId ?? payload.message?.id ?? null,
      phone: this.vivaPhone(payload.phone ?? payload.customer?.phone),
      timestamp: this.dateValue(payload.message?.timestamp ?? payload.timestamp),
      customerName: (payload.customer?.fullName ?? [payload.customer?.firstName, payload.customer?.lastName].filter(Boolean).join(' ')) || null,
      webhookReceivedAt: new Date(),
    };
  }

  private customerProfile(payload: GhlWhatsappWakeupPayload, wakeup: NormalizedGhlWakeup): CustomerProfile {
    return {
      firstName: payload.customer?.firstName ?? null,
      lastName: payload.customer?.lastName ?? null,
      fullName: wakeup.customerName,
      phone: wakeup.phone,
      email: payload.customer?.email ?? null,
      source: 'whatsapp',
      fetchStatus: 'success',
      fetchedAt: new Date(),
      lastError: null,
    };
  }

  private kindFromPayload(payload: GhlWhatsappWakeupPayload): ConversationMessage['kind'] {
    const type = payload.message?.type?.toLowerCase() ?? '';

    if (type.includes('audio')) return 'audio';
    if (type.includes('image')) return 'image';
    if (payload.attachments?.length) return 'unknown';

    return 'text';
  }

  private customerName(profile?: CustomerProfile): string | null {
    return (profile?.fullName ?? [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()) || null;
  }

  private dateValue(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private vivaPhone(value?: string | null): string | null {
    const digits = this.phoneDigits(value);

    if (!digits) return null;
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;

    return `+${digits}`;
  }

  private phoneDigits(value?: string | null): string | undefined {
    const digits = value?.replace(/\D/g, '') ?? '';
    return digits || undefined;
  }

  private vivaDealerId(): number {
    return this.config.get<number>('VIVA_DEFAULT_DEALER_ID', 13);
  }

  private leadId(locationId: string, contactId: string): string {
    return `ghl:${locationId}:${contactId}`;
  }
}
