import { Inject, Injectable } from '@nestjs/common';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { IncomingMetaMessage } from '@/features/meta-messaging-webhook/domain/entities/incoming-meta-message.entity';
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
import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';

@Injectable()
export class ProcessIncomingMetaMessageUseCase {
  constructor(
    private readonly extractor: MetaWebhookMessageExtractor,
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
      contactId: message.contactId,
      direction: 'inbound',
      kind: message.kind,
      text: inboundText,
      occurredAt: message.occurredAt,
    };

    await this.conversationState.appendMessage(inboundMessage);

    const recentMessages = await this.conversationState.getRecentMessages(
      message.channel,
      message.contactId,
      12,
    );
    const reply = await this.assistant.generateReply({
      channel: message.channel,
      contactId: message.contactId,
      userMessage: inboundText,
      recentMessages,
    });

    await this.messenger.sendTextMessage(message.channel, message.contactId, reply);

    const outboundMessage: ConversationMessage = {
      id: `${message.messageId}:outbound`,
      channel: message.channel,
      contactId: message.contactId,
      direction: 'outbound',
      kind: 'text',
      text: reply,
      occurredAt: new Date(),
    };

    await this.conversationState.appendMessage(outboundMessage);
    this.syncToPassiveCrm(message, inboundMessage, outboundMessage);
  }

  private async resolveMessageText(message: IncomingMetaMessage): Promise<string> {
    if (message.kind === 'text') {
      return message.text ?? '';
    }

    if (!message.mediaReference) {
      return message.text ?? 'Incoming Meta media message without media reference.';
    }

    const media = await this.mediaReader.getMediaContent(message.mediaReference);

    if (message.kind === 'audio') {
      return this.mediaAnalyzer.transcribeAudio(media);
    }

    if (message.kind === 'image') {
      const imageDescription = await this.mediaAnalyzer.describeImage(media);
      return [message.text, imageDescription].filter(Boolean).join('\n');
    }

    return message.text ?? 'Unsupported incoming Meta message.';
  }

  private syncToPassiveCrm(
    source: IncomingMetaMessage,
    ...messages: ConversationMessage[]
  ): void {
    this.background.run('sync-ghl-passive-crm', async () => {
      const recentMessages = await this.conversationState.getRecentMessages(
        source.channel,
        source.contactId,
        20,
      );
      const leadFields = await this.leadFieldsExtractor.extractLeadCustomFields({
        channel: source.channel,
        contactId: source.contactId,
        recentMessages,
      });
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
