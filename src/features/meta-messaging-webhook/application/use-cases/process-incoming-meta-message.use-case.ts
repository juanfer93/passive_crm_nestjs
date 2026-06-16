import { Inject, Injectable } from '@nestjs/common';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';
import { EnsureMetaUserProfileUseCase } from '@/features/meta-messaging-webhook/application/use-cases/ensure-meta-user-profile.use-case';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import { IncomingMetaMessage } from '@/features/meta-messaging-webhook/domain/entities/incoming-meta-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { VivaSofiaEventType } from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';
import { buildCompletedLeadCourtesyReply } from '@/features/meta-messaging-webhook/domain/services/completed-lead-courtesy-reply.service';
import { shouldReactivateLeadQualification } from '@/features/meta-messaging-webhook/domain/services/lead-qualification-reactivation.service';
import {
  buildVivaBuyerSnapshot,
  buildVivaConversationSummary,
  hasAppointmentJustCreated,
  hasBuyerDNAChanged,
  hasDocumentationJustReceived,
  lastInboundMessage,
} from '@/features/meta-messaging-webhook/domain/services/viva-sofia-event-factory.service';
import {
  ASSISTANT_REPLY_GENERATOR,
  AssistantReplyGeneratorPort,
} from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import {
  BACKGROUND_TASK_RUNNER,
  BackgroundTaskRunnerPort,
} from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';
import {
  CONVERSATION_STATE_REPOSITORY,
  ConversationStateRepository,
} from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { CRM_SINK, CrmSinkPort } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';
import { MEDIA_ANALYZER, MediaAnalyzerPort } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import {
  MEDIA_CONTENT_READER,
  MediaContentReaderPort,
} from '@/features/meta-messaging-webhook/domain/ports/media-content-reader.port';
import {
  LEAD_CUSTOM_FIELDS_EXTRACTOR,
  LeadCustomFieldsExtractorPort,
} from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import {
  MESSAGE_IDEMPOTENCY_STORE,
  MessageIdempotencyStore,
} from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import {
  META_MESSENGER,
  MetaMessengerPort,
} from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';
import {
  VIVA_SOFIA_EVENT_PUBLISHER,
  VivaSofiaEventPublisherPort,
} from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';
import { MetaWebhookPayload } from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';

@Injectable()
export class ProcessIncomingMetaMessageUseCase {
  constructor(
    private readonly extractor: MetaWebhookMessageExtractor,
    private readonly dealerProfiles: DealerProfileResolver,
    @Inject(MESSAGE_IDEMPOTENCY_STORE)
    private readonly idempotencyStore: MessageIdempotencyStore,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    private readonly ensureMetaUserProfile: EnsureMetaUserProfileUseCase,
    @Inject(MEDIA_CONTENT_READER)
    private readonly mediaReader: MediaContentReaderPort,
    @Inject(MEDIA_ANALYZER)
    private readonly mediaAnalyzer: MediaAnalyzerPort,
    @Inject(ASSISTANT_REPLY_GENERATOR)
    private readonly assistant: AssistantReplyGeneratorPort,
    @Inject(LEAD_CUSTOM_FIELDS_EXTRACTOR)
    private readonly leadFieldsExtractor: LeadCustomFieldsExtractorPort,
    @Inject(META_MESSENGER)
    private readonly messenger: MetaMessengerPort,
    @Inject(CRM_SINK)
    private readonly crmSink: CrmSinkPort,
    @Inject(BACKGROUND_TASK_RUNNER)
    private readonly background: BackgroundTaskRunnerPort,
    @Inject(VIVA_SOFIA_EVENT_PUBLISHER)
    private readonly vivaEvents: VivaSofiaEventPublisherPort,
  ) {}

  async execute(payload: MetaWebhookPayload): Promise<void> {
    const messages = this.extractor.extract(payload);

    for (const message of messages) {
      await this.processOne(message);
    }
  }

  private async processOne(message: IncomingMetaMessage): Promise<void> {
    const isFirstDelivery = await this.idempotencyStore.reserve(message.messageId);

    if (!isFirstDelivery) {
      return;
    }

    const inboundText = await this.resolveMessageText(message);
    const inboundMessage: ConversationMessage = {
      id: message.messageId,
      channel: message.channel,
      pageId: message.pageId,
      contactId: message.contactId,
      direction: 'inbound',
      kind: message.kind,
      text: inboundText,
      occurredAt: message.occurredAt,
    };

    const dealerProfile = this.dealerProfiles.resolve({ pageId: message.pageId });
    const currentState = await this.conversationState.getState(
      message.channel,
      message.contactId,
      message.pageId,
    );
    const shouldReactivate = shouldReactivateLeadQualification(currentState, new Date());
    const hasPriorConversation = !shouldReactivate && Boolean(currentState?.messages.length);
    const previousLeadFields = shouldReactivate ? {} : currentState?.leadCustomFields ?? {};
    const isNewLead = !currentState;

    if (shouldReactivate) {
      await this.conversationState.reactivateLeadQualification(
        message.channel,
        message.contactId,
        message.pageId,
      );
    }

    await this.conversationState.cancelFollowUp(message.channel, message.contactId, message.pageId);
    await this.conversationState.appendMessage(inboundMessage);
    await this.ensureMetaUserProfile.execute({
      state: currentState,
      channel: message.channel,
      pageId: message.pageId,
      contactId: message.contactId,
    });

    if (currentState?.qualificationStatus === 'completed' && !shouldReactivate) {
      const reply = buildCompletedLeadCourtesyReply(inboundText);

      if (!reply) {
        return;
      }

      await this.messenger.sendTextMessage(
        message.channel,
        message.contactId,
        reply,
        message.pageId,
      );
      await this.conversationState.appendMessage({
        id: `${message.messageId}:outbound`,
        channel: message.channel,
        pageId: message.pageId,
        contactId: message.contactId,
        direction: 'outbound',
        kind: 'text',
        text: reply,
        occurredAt: new Date(),
      });

      return;
    }

    const recentMessages = shouldReactivate
      ? [inboundMessage]
      : await this.conversationState.getRecentMessages(
          message.channel,
          message.contactId,
          12,
          message.pageId,
        );
    const extractedFields = await this.leadFieldsExtractor.extractLeadCustomFields({
      channel: message.channel,
      contactId: message.contactId,
      recentMessages,
      knownFields: previousLeadFields,
      dealerProfile,
    });
    const leadQualification = await this.conversationState.mergeLeadCustomFields(
      message.channel,
      message.contactId,
      extractedFields,
      message.pageId,
    );

    if (leadQualification.status === 'completed') {
      await this.conversationState.cancelFollowUp(message.channel, message.contactId, message.pageId);
    }

    const reply =
      leadQualification.status === 'completed'
        ? 'Perfecto ✅ Ya tengo la información. Un especialista se comunicará pronto.'
        : await this.assistant.generateReply({
            channel: message.channel,
            contactId: message.contactId,
            userMessage: inboundText,
            recentMessages,
            hasPriorConversation,
            leadCustomFields: leadQualification.customFields,
            dealerProfile,
          });

    await this.messenger.sendTextMessage(message.channel, message.contactId, reply, message.pageId);

    const outboundMessage: ConversationMessage = {
      id: `${message.messageId}:outbound`,
      channel: message.channel,
      pageId: message.pageId,
      contactId: message.contactId,
      direction: 'outbound',
      kind: 'text',
      text: reply,
      occurredAt: new Date(),
    };

    await this.conversationState.appendMessage(outboundMessage);

    this.syncToPassiveCrm(message, leadQualification.customFields, inboundMessage, outboundMessage);
    this.publishVivaSofiaEvents(
      message,
      previousLeadFields,
      leadQualification.customFields,
      [inboundMessage, outboundMessage],
      isNewLead,
      this.receivedDocumentFile(message),
    );
  }

  private async resolveMessageText(message: IncomingMetaMessage): Promise<string> {
    if (message.kind === 'text') {
      return message.text ?? '';
    }

    if (message.kind === 'unknown') {
      return this.unsupportedMediaMessage();
    }

    if (!message.mediaReference) {
      return message.text ?? this.unsupportedMediaMessage();
    }

    const media = await this.mediaReader.getMediaContent(message.mediaReference, message.pageId);

    if (!this.isExpectedMediaContent(message.kind, media.mimeType)) {
      return this.unsupportedMediaMessage();
    }

    if (message.kind === 'audio') {
      return this.mediaAnalyzer.transcribeAudio(media);
    }

    if (message.kind === 'image') {
      const imageDescription = await this.mediaAnalyzer.describeImage(media);
      return [message.text, imageDescription].filter(Boolean).join('\n');
    }

    return message.text ?? this.unsupportedMediaMessage();
  }

  private isExpectedMediaContent(kind: IncomingMetaMessage['kind'], mimeType: string): boolean {
    const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();

    if (kind === 'audio') {
      return normalizedMimeType.startsWith('audio/');
    }

    if (kind === 'image') {
      return normalizedMimeType.startsWith('image/');
    }

    return false;
  }

  private unsupportedMediaMessage(): string {
    return 'El cliente envio un archivo sin texto util para la calificacion. Continua con la siguiente pregunta pendiente.';
  }

  private syncToPassiveCrm(
    source: IncomingMetaMessage,
    leadFields: LeadCustomFields,
    ...messages: ConversationMessage[]
  ): void {
    this.background.run('sync-ghl-passive-crm', async () => {
      const contactPhone = leadFields.phone;

      if (!contactPhone) {
        return;
      }

      const state = await this.conversationState.getState(
        source.channel,
        source.contactId,
        source.pageId,
      );

      await this.crmSink.updateCustomFields(contactPhone, leadFields, {
        channel: source.channel,
        pageId: source.pageId,
        contactId: source.contactId,
        conversationKey: this.leadId(source),
        customerProfile: state?.customerProfile,
        qualificationCompletedAt: state?.qualificationCompletedAt,
        messages: state?.messages ?? messages,
      });

      for (const message of messages) {
        await this.crmSink.recordConversationMessage(message, contactPhone);
      }
    });
  }

  private publishVivaSofiaEvents(
    source: IncomingMetaMessage,
    previousLeadFields: LeadCustomFields,
    currentLeadFields: LeadCustomFields,
    messages: ConversationMessage[],
    isNewLead: boolean,
    receivedDocumentFile: boolean,
  ): void {
    const eventTypes = this.resolveVivaEventTypes(
      previousLeadFields,
      currentLeadFields,
      isNewLead,
      receivedDocumentFile,
    );

    if (eventTypes.length === 0) {
      return;
    }

    this.background.run('viva-sofia-event-publisher', async () => {
      const state = await this.conversationState.getState(
        source.channel,
        source.contactId,
        source.pageId,
      );
      const leadFields = state?.leadCustomFields ?? currentLeadFields;
      const conversationMessages = state?.messages?.length ? state.messages : messages;
      const lastInbound = lastInboundMessage(conversationMessages);
      const buyerSnapshot = buildVivaBuyerSnapshot(leadFields);
      const basePayload = {
        dealerId: this.vivaDealerId(),
        leadId: this.leadId(source),
        ghlContactId: null,
        metaUserId: source.contactId,
        customerName: this.customerName(state?.customerProfile),
        phone: this.vivaPhone(leadFields.phone ?? state?.customerProfile?.phone ?? null),
        vehicle_category: buyerSnapshot.vehicle_category,
        vehicle_interest: buyerSnapshot.vehicle_interest,
        down_payment: buyerSnapshot.down_payment,
        purchase_timeline: buyerSnapshot.purchase_timeline,
        document_status: buyerSnapshot.document_status,
        bank_account_status: buyerSnapshot.bank_account_status,
        preferred_language: buyerSnapshot.preferred_language,
        conversation_summary: buildVivaConversationSummary(leadFields, conversationMessages),
        appointment_date: buyerSnapshot.appointment_date,
        conversation: {
          lastMessage: lastInbound?.text ?? null,
          channel: source.channel,
          pageId: source.pageId ?? null,
          contactId: source.contactId,
        },
      };

      for (const event of eventTypes) {
        await this.vivaEvents.publish({
          ...basePayload,
          event,
        });
      }
    });
  }

  private resolveVivaEventTypes(
    previousLeadFields: LeadCustomFields,
    currentLeadFields: LeadCustomFields,
    isNewLead: boolean,
    receivedDocumentFile: boolean,
  ): VivaSofiaEventType[] {
    const eventTypes: VivaSofiaEventType[] = [];

    if (isNewLead) {
      eventTypes.push('lead.created');
    }

    if (!isNewLead && hasBuyerDNAChanged(previousLeadFields, currentLeadFields)) {
      eventTypes.push('lead.updated', 'buyer_dna_updated');
    }

    if (hasAppointmentJustCreated(previousLeadFields, currentLeadFields)) {
      eventTypes.push('appointment.created');
    }

    if (receivedDocumentFile || hasDocumentationJustReceived(previousLeadFields, currentLeadFields)) {
      eventTypes.push('document.received');
    }

    return [...new Set(eventTypes)];
  }

  private receivedDocumentFile(message: IncomingMetaMessage): boolean {
    return message.kind === 'image' || message.kind === 'unknown';
  }

  private customerName(profile?: CustomerProfile): string | null {
    return (profile?.fullName ?? [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim()) || null;
  }

  private vivaPhone(value?: string | null): string | null {
    const digits = value?.replace(/\D/g, '') ?? '';

    if (!digits) {
      return null;
    }

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }

    return `+${digits}`;
  }

  private vivaDealerId(): number {
    return 13;
  }

  private leadId(source: IncomingMetaMessage): string {
    return `${source.channel}:${source.pageId ?? 'local'}:${source.contactId}`;
  }
}
