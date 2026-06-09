import { Inject, Injectable } from '@nestjs/common';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { IncomingMetaMessage } from '@/features/meta-messaging-webhook/domain/entities/incoming-meta-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { buildCompletedLeadCourtesyReply } from '@/features/meta-messaging-webhook/domain/services/completed-lead-courtesy-reply.service';
import { shouldReactivateLeadQualification } from '@/features/meta-messaging-webhook/domain/services/lead-qualification-reactivation.service';
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

    if (shouldReactivate) {
      await this.conversationState.reactivateLeadQualification(
        message.channel,
        message.contactId,
        message.pageId,
      );
    }

    await this.conversationState.appendMessage(inboundMessage);

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
      knownFields: shouldReactivate ? {} : currentState?.leadCustomFields ?? {},
      dealerProfile,
    });
    const leadQualification = await this.conversationState.mergeLeadCustomFields(
      message.channel,
      message.contactId,
      extractedFields,
      message.pageId,
    );
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

      await this.crmSink.updateCustomFields(contactPhone, leadFields);

      for (const message of messages) {
        await this.crmSink.recordConversationMessage(message, contactPhone);
      }
    });
  }
}
