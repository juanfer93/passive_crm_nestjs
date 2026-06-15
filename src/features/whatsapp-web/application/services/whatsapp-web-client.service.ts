import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { ConversationMessage, ConversationMessageKind } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { CustomerProfile } from '@/features/meta-messaging-webhook/domain/entities/customer-profile.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';
import {
  VivaCustomer,
  VivaSofiaEventType,
} from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';
import { buildCompletedLeadCourtesyReply } from '@/features/meta-messaging-webhook/domain/services/completed-lead-courtesy-reply.service';
import { shouldReactivateLeadQualification } from '@/features/meta-messaging-webhook/domain/services/lead-qualification-reactivation.service';
import {
  buildVivaBuyerDNA,
  buildVivaConversationSummary,
  buildVivaIntent,
  hasBuyerDNAChanged,
  hasDocumentationJustReceived,
  hasPurchaseIntentJustDetected,
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
import {
  LEAD_CUSTOM_FIELDS_EXTRACTOR,
  LeadCustomFieldsExtractorPort,
} from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import { MEDIA_ANALYZER, MediaAnalyzerPort } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import {
  MESSAGE_IDEMPOTENCY_STORE,
  MessageIdempotencyStore,
} from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import {
  VIVA_SOFIA_EVENT_PUBLISHER,
  VivaSofiaEventPublisherPort,
} from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';

interface WhatsappContactLike {
  name?: string;
  pushname?: string;
  shortName?: string;
  number?: string;
}

@Injectable()
export class WhatsappWebClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWebClientService.name);
  private client?: Client;
  private isReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly dealerProfiles: DealerProfileResolver,
    @Inject(MESSAGE_IDEMPOTENCY_STORE)
    private readonly idempotencyStore: MessageIdempotencyStore,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    @Inject(MEDIA_ANALYZER)
    private readonly mediaAnalyzer: MediaAnalyzerPort,
    @Inject(ASSISTANT_REPLY_GENERATOR)
    private readonly assistant: AssistantReplyGeneratorPort,
    @Inject(LEAD_CUSTOM_FIELDS_EXTRACTOR)
    private readonly leadFieldsExtractor: LeadCustomFieldsExtractorPort,
    @Inject(CRM_SINK)
    private readonly crmSink: CrmSinkPort,
    @Inject(BACKGROUND_TASK_RUNNER)
    private readonly background: BackgroundTaskRunnerPort,
    @Inject(VIVA_SOFIA_EVENT_PUBLISHER)
    private readonly vivaEvents: VivaSofiaEventPublisherPort,
  ) {}

  async onModuleInit(): Promise<void> {
    const isEnabled = this.configService.get<string>('WHATSAPP_WEB_ENABLED') === 'true';
    if (!isEnabled) {
      this.logger.log('WhatsApp Web integration is disabled.');
      return;
    }

    const isHeadless = this.configService.get<string>('WHATSAPP_WEB_HEADLESS', 'true') === 'true';

    this.logger.log(`Initializing WhatsApp Web Client (ID: ${this.clientId})...`);

    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: this.clientId }),
      puppeteer: {
        headless: isHeadless,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.setupListeners();
    try {
      await this.client.initialize();
    } catch (error) {
      this.isReady = false;
      this.logger.error(
        `WhatsApp Web initialization failed; the rest of the application will continue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.logger.log('Destroying WhatsApp Web Client...');
      await this.client.destroy();
    }
  }

  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.isReady || !this.client) {
      this.logger.warn('Cannot send message: WhatsApp Web Client is not ready.');
      return;
    }

    try {
      await this.client.sendMessage(to, message);
      this.logger.log(`Message sent to ${this.mask(to)}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${this.mask(to)}`, error);
    }
  }

  getStatus(): { enabled: boolean; ready: boolean; clientId: string } {
    return {
      enabled: this.configService.get<string>('WHATSAPP_WEB_ENABLED') === 'true',
      ready: this.isReady,
      clientId: this.clientId,
    };
  }

  private setupListeners(): void {
    if (!this.client) return;

    this.client.on('qr', (qr: string) => {
      this.logger.log('Scan the QR code below to authenticate:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.log('WhatsApp Web Client is READY!');
    });

    this.client.on('authenticated', () => {
      this.logger.log('WhatsApp Web Client is authenticated.');
    });

    this.client.on('auth_failure', (msg: string) => {
      this.logger.error(`WhatsApp Web Client auth_failure: ${msg}`);
      this.isReady = false;
    });

    this.client.on('disconnected', (reason: string) => {
      this.logger.warn(`WhatsApp Web Client was disconnected: ${reason}`);
      this.isReady = false;
    });

    this.client.on('message', async (message: Message) => {
      try {
        await this.handleIncomingMessage(message);
      } catch (error) {
        this.logger.error('Error handling incoming WhatsApp message', error);
      }
    });
  }

  private async handleIncomingMessage(message: Message): Promise<void> {
    if (message.fromMe) {
      return;
    }

    const chat = await message.getChat();

    if (chat.isGroup) {
      this.logger.log(`Skipping WhatsApp group message from ${this.mask(message.from)}`);
      return;
    }

    const messageId = this.messageId(message);
    const isFirstDelivery = await this.idempotencyStore.reserve(messageId);

    if (!isFirstDelivery) {
      return;
    }

    const contact = await this.safeGetContact(message);
    const contactPhone = this.phoneFromMessage(message, contact);
    const kind = this.kindForMessage(message);
    const inboundText = await this.resolveMessageText(message, kind);
    const inboundMessage: ConversationMessage = {
      id: messageId,
      channel: 'whatsapp',
      pageId: this.whatsappPageId,
      contactId: message.from,
      direction: 'inbound',
      kind,
      text: inboundText,
      occurredAt: this.messageDate(message),
    };

    const dealerProfile = this.dealerProfiles.resolve({ pageId: this.whatsappPageId });
    const currentState = await this.conversationState.getState(
      'whatsapp',
      message.from,
      this.whatsappPageId,
    );
    const shouldReactivate = shouldReactivateLeadQualification(currentState, new Date());
    const hasPriorConversation = !shouldReactivate && Boolean(currentState?.messages.length);
    const previousLeadFields = shouldReactivate ? {} : currentState?.leadCustomFields ?? {};
    const previousFieldsWithPhone = {
      ...previousLeadFields,
      ...(previousLeadFields.phone || !contactPhone ? {} : { phone: contactPhone }),
    };
    const isNewLead = !currentState;

    if (shouldReactivate) {
      await this.conversationState.reactivateLeadQualification(
        'whatsapp',
        message.from,
        this.whatsappPageId,
      );
    }

    await this.conversationState.cancelFollowUp('whatsapp', message.from, this.whatsappPageId);
    await this.conversationState.appendMessage(inboundMessage);
    await this.conversationState.updateCustomerProfile(
      'whatsapp',
      message.from,
      this.customerProfileFromContact(contact, contactPhone),
      this.whatsappPageId,
    );

    if (currentState?.qualificationStatus === 'completed' && !shouldReactivate) {
      const reply = buildCompletedLeadCourtesyReply(inboundText);

      if (!reply) {
        return;
      }

      await this.sendMessage(message.from, reply);
      await this.appendWhatsappReply(message, reply);
      return;
    }

    const recentMessages = shouldReactivate
      ? [inboundMessage]
      : await this.conversationState.getRecentMessages(
          'whatsapp',
          message.from,
          12,
          this.whatsappPageId,
        );
    const extractedFields = await this.leadFieldsExtractor.extractLeadCustomFields({
      channel: 'whatsapp',
      contactId: message.from,
      recentMessages,
      knownFields: previousFieldsWithPhone,
      dealerProfile,
    });
    const leadFieldsToMerge = {
      ...extractedFields,
      ...(extractedFields.phone || !contactPhone ? {} : { phone: contactPhone }),
    };
    const leadQualification = await this.conversationState.mergeLeadCustomFields(
      'whatsapp',
      message.from,
      leadFieldsToMerge,
      this.whatsappPageId,
    );

    if (leadQualification.status === 'completed') {
      await this.conversationState.cancelFollowUp('whatsapp', message.from, this.whatsappPageId);
    }

    const reply =
      leadQualification.status === 'completed'
        ? 'Perfecto ✅ Ya tengo la información. Un especialista se comunicará pronto.'
        : await this.assistant.generateReply({
            channel: 'whatsapp',
            contactId: message.from,
            userMessage: inboundText,
            recentMessages,
            hasPriorConversation,
            leadCustomFields: leadQualification.customFields,
            dealerProfile,
          });

    await this.sendMessage(message.from, reply);
    const outboundMessage = await this.appendWhatsappReply(message, reply);

    this.syncToPassiveCrm(message.from, leadQualification.customFields, inboundMessage, outboundMessage);
    this.publishVivaSofiaEvents(
      message.from,
      previousLeadFields,
      leadQualification.customFields,
      [inboundMessage, outboundMessage],
      isNewLead,
    );
  }

  private async resolveMessageText(
    message: Message,
    kind: ConversationMessageKind,
  ): Promise<string> {
    const body = message.body?.trim() ?? '';

    if (!message.hasMedia) {
      return body;
    }

    const media = await message.downloadMedia();

    if (!media) {
      return body || this.unsupportedMediaMessage(message.type);
    }

    const mediaContent: MediaContent = {
      id: this.messageId(message),
      mimeType: media.mimetype,
      bytes: Buffer.from(media.data, 'base64'),
    };

    if (kind === 'audio' && this.isExpectedMediaContent('audio', mediaContent.mimeType)) {
      return this.mediaAnalyzer.transcribeAudio(mediaContent);
    }

    if (kind === 'image' && this.isExpectedMediaContent('image', mediaContent.mimeType)) {
      const imageDescription = await this.mediaAnalyzer.describeImage(mediaContent);
      return [body, imageDescription].filter(Boolean).join('\n');
    }

    return [body, this.unsupportedMediaMessage(message.type)].filter(Boolean).join('\n');
  }

  private kindForMessage(message: Message): ConversationMessageKind {
    const type = String(message.type ?? '').toLowerCase();

    if (type === 'audio' || type === 'ptt') return 'audio';
    if (type === 'image') return 'image';
    if (type === 'chat' || type === 'text') return 'text';

    return 'unknown';
  }

  private isExpectedMediaContent(kind: 'audio' | 'image', mimeType: string): boolean {
    const normalizedMimeType = mimeType.toLowerCase().split(';')[0].trim();

    if (kind === 'audio') {
      return normalizedMimeType.startsWith('audio/');
    }

    return normalizedMimeType.startsWith('image/');
  }

  private unsupportedMediaMessage(type?: string): string {
    const normalizedType = String(type ?? '').toLowerCase();

    if (normalizedType === 'video') {
      return 'El cliente envio un video sin texto util para la calificacion. Continua con la siguiente pregunta pendiente.';
    }

    return 'El cliente envio un archivo sin texto util para la calificacion. Continua con la siguiente pregunta pendiente.';
  }

  private async appendWhatsappReply(source: Message, reply: string): Promise<ConversationMessage> {
    const outboundMessage: ConversationMessage = {
      id: `${this.messageId(source)}:outbound`,
      channel: 'whatsapp',
      pageId: this.whatsappPageId,
      contactId: source.from,
      direction: 'outbound',
      kind: 'text',
      text: reply,
      occurredAt: new Date(),
    };

    await this.conversationState.appendMessage(outboundMessage);

    return outboundMessage;
  }

  private syncToPassiveCrm(
    contactId: string,
    leadFields: LeadCustomFields,
    ...messages: ConversationMessage[]
  ): void {
    this.background.run('sync-ghl-passive-crm', async () => {
      const contactPhone = leadFields.phone ?? this.phoneFromJid(contactId);

      if (!contactPhone) {
        return;
      }

      const state = await this.conversationState.getState('whatsapp', contactId, this.whatsappPageId);

      await this.crmSink.updateCustomFields(contactPhone, leadFields, {
        channel: 'whatsapp',
        pageId: this.whatsappPageId,
        contactId,
        conversationKey: this.leadId(contactId),
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
    contactId: string,
    previousLeadFields: LeadCustomFields,
    currentLeadFields: LeadCustomFields,
    messages: ConversationMessage[],
    isNewLead: boolean,
  ): void {
    const eventTypes = this.resolveVivaEventTypes(previousLeadFields, currentLeadFields, isNewLead);

    if (eventTypes.length === 0) {
      return;
    }

    this.background.run('viva-sofia-event-publisher', async () => {
      const state = await this.conversationState.getState('whatsapp', contactId, this.whatsappPageId);
      const leadFields = state?.leadCustomFields ?? currentLeadFields;
      const conversationMessages = state?.messages?.length ? state.messages : messages;
      const lastInbound = lastInboundMessage(conversationMessages);
      const basePayload = {
        leadId: this.leadId(contactId),
        ghlContactId: null,
        customer: this.buildVivaCustomer(state?.customerProfile),
        buyerDNA: buildVivaBuyerDNA(leadFields),
        intent: buildVivaIntent(leadFields),
        conversation: {
          summary: buildVivaConversationSummary(leadFields, conversationMessages),
          lastMessage: lastInbound?.text ?? null,
          channel: 'whatsapp',
          pageId: this.whatsappPageId,
          contactId,
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
  ): VivaSofiaEventType[] {
    const eventTypes: VivaSofiaEventType[] = [];

    if (isNewLead) {
      eventTypes.push('new_lead');
    }

    if (!isNewLead && hasBuyerDNAChanged(previousLeadFields, currentLeadFields)) {
      eventTypes.push('buyer_dna_updated');
    }

    if (hasPurchaseIntentJustDetected(previousLeadFields, currentLeadFields)) {
      eventTypes.push('purchase_intent_detected');
    }

    if (hasDocumentationJustReceived(previousLeadFields, currentLeadFields)) {
      eventTypes.push('documentation_received');
    }

    return [...new Set(eventTypes)];
  }

  private customerProfileFromContact(
    contact: WhatsappContactLike | null,
    phone: string | null,
  ): CustomerProfile {
    const fullName = this.cleanText(contact?.pushname ?? contact?.name ?? contact?.shortName);
    const [firstName, ...lastNameParts] = fullName?.split(/\s+/).filter(Boolean) ?? [];

    return {
      firstName: firstName ?? null,
      lastName: lastNameParts.join(' ') || null,
      fullName,
      phone,
      source: 'whatsapp',
      fetchStatus: 'success',
      fetchedAt: new Date(),
      lastError: null,
    };
  }

  private buildVivaCustomer(profile?: CustomerProfile): VivaCustomer {
    const firstName = profile?.firstName ?? null;
    const lastName = profile?.lastName ?? null;
    const fullName = (profile?.fullName ?? [firstName, lastName].filter(Boolean).join(' ').trim()) || null;

    return {
      firstName,
      lastName,
      fullName,
    };
  }

  private async safeGetContact(message: Message): Promise<WhatsappContactLike | null> {
    try {
      return (await message.getContact()) as WhatsappContactLike;
    } catch {
      return null;
    }
  }

  private phoneFromMessage(message: Message, contact: WhatsappContactLike | null): string | null {
    return this.normalizePhone(contact?.number) ?? this.phoneFromJid(message.from);
  }

  private phoneFromJid(jid: string): string | null {
    return this.normalizePhone(jid.split('@')[0]);
  }

  private normalizePhone(value?: string | null): string | null {
    const digits = value?.replace(/\D/g, '') ?? '';

    if (!digits) {
      return null;
    }

    return digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
  }

  private messageId(message: Message): string {
    const id = message.id as { _serialized?: string; id?: string } | undefined;
    return id?._serialized ?? id?.id ?? `whatsapp:${message.from}:${message.timestamp}`;
  }

  private messageDate(message: Message): Date {
    return new Date(message.timestamp * 1000);
  }

  private cleanText(value?: string | null): string | null {
    const trimmed = value?.trim();
    return trimmed || null;
  }

  private mask(value: string): string {
    return value.length <= 4 ? '****' : `${value.slice(0, 2)}***${value.slice(-4)}`;
  }

  private leadId(contactId: string): string {
    return `whatsapp:${this.whatsappPageId}:${contactId}`;
  }

  private get clientId(): string {
    return this.configService.get<string>('WHATSAPP_WEB_CLIENT_ID') || 'default-client';
  }

  private get whatsappPageId(): string {
    return `whatsapp:${this.clientId}`;
  }
}
