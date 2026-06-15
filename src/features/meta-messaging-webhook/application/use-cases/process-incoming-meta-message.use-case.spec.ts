import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';
import { EnsureMetaUserProfileUseCase } from '@/features/meta-messaging-webhook/application/use-cases/ensure-meta-user-profile.use-case';
import { ProcessIncomingMetaMessageUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-incoming-meta-message.use-case';
import { DealerProfile } from '@/features/meta-messaging-webhook/domain/entities/dealer-profile.entity';
import { IncomingMetaMessage } from '@/features/meta-messaging-webhook/domain/entities/incoming-meta-message.entity';
import { AssistantReplyGeneratorPort } from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import { BackgroundTaskRunnerPort } from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';
import { ConversationStateRepository } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { CrmSinkPort } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';
import { LeadCustomFieldsExtractorPort } from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import { MediaAnalyzerPort } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import { MediaContentReaderPort } from '@/features/meta-messaging-webhook/domain/ports/media-content-reader.port';
import { MessageIdempotencyStore } from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import { MetaMessengerPort } from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';
import { VivaSofiaEventPublisherPort } from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';
import { MetaWebhookPayload } from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';

describe('ProcessIncomingMetaMessageUseCase media security', () => {
  it('does not send non-audio media content to OpenAI transcription', async () => {
    const message: IncomingMetaMessage = {
      messageId: 'message-1',
      channel: 'messenger',
      contactId: 'contact-1',
      pageId: 'page-1',
      kind: 'audio',
      mediaReference: 'media-1',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const extractor = { extract: jest.fn(() => [message]) };
    const mediaAnalyzer = {
      transcribeAudio: jest.fn(),
      describeImage: jest.fn(),
    };
    const mediaReader = {
      getMediaContent: jest.fn().mockResolvedValue({
        id: 'media-1',
        mimeType: 'application/json',
        bytes: Buffer.from('{"private":true}'),
      }),
    };
    const assistant = { generateReply: jest.fn().mockResolvedValue('Reply') };
    const messenger = { sendTextMessage: jest.fn() };
    const conversationState = conversationStateRepository();
    const background = { run: jest.fn() };
    const vivaEvents = { publish: jest.fn() };
    const useCase = new ProcessIncomingMetaMessageUseCase(
      extractor as unknown as MetaWebhookMessageExtractor,
      { resolve: jest.fn(() => dealerProfile) } as unknown as DealerProfileResolver,
      { reserve: jest.fn().mockResolvedValue(true) } as unknown as MessageIdempotencyStore,
      conversationState,
      { execute: jest.fn() } as unknown as EnsureMetaUserProfileUseCase,
      mediaReader as unknown as MediaContentReaderPort,
      mediaAnalyzer as unknown as MediaAnalyzerPort,
      assistant as unknown as AssistantReplyGeneratorPort,
      { extractLeadCustomFields: jest.fn().mockResolvedValue({}) } as unknown as LeadCustomFieldsExtractorPort,
      messenger as unknown as MetaMessengerPort,
      {
        updateCustomFields: jest.fn(),
        recordConversationMessage: jest.fn(),
      } as unknown as CrmSinkPort,
      background as unknown as BackgroundTaskRunnerPort,
      vivaEvents as unknown as VivaSofiaEventPublisherPort,
    );

    await useCase.execute({} as MetaWebhookPayload);

    expect(mediaReader.getMediaContent).toHaveBeenCalledWith('media-1', 'page-1');
    expect(mediaAnalyzer.transcribeAudio).not.toHaveBeenCalled();
    expect(assistant.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        userMessage:
          'El cliente envio un archivo sin texto util para la calificacion. Continua con la siguiente pregunta pendiente.',
      }),
    );
    expect(messenger.sendTextMessage).toHaveBeenCalledWith(
      'messenger',
      'contact-1',
      'Reply',
      'page-1',
    );
    expect(conversationState.cancelFollowUp).toHaveBeenCalledWith(
      'messenger',
      'contact-1',
      'page-1',
    );
    expect(conversationState.scheduleFollowUp).not.toHaveBeenCalled();
    expect(background.run).toHaveBeenCalledWith('sync-ghl-passive-crm', expect.any(Function));
    expect(background.run).toHaveBeenCalledWith('viva-sofia-event-publisher', expect.any(Function));
  });

  it('does not schedule a follow-up when custom fields complete the lead', async () => {
    const message: IncomingMetaMessage = {
      messageId: 'message-2',
      channel: 'messenger',
      contactId: 'contact-2',
      pageId: 'page-1',
      kind: 'text',
      text: 'Mi numero es 3055555555',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const conversationState = conversationStateRepository();
    conversationState.mergeLeadCustomFields.mockResolvedValue({
      status: 'completed',
      customFields: {
        purchase_timeline: 'esta semana',
        lead_temperature: 'hot',
        vehicle_type: 'Sedan',
        down_payment: '2000',
        document_status: 'confirmed',
        phone: '3055555555',
      },
      completedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const messenger = { sendTextMessage: jest.fn() };
    const background = { run: jest.fn() };
    const vivaEvents = { publish: jest.fn() };
    const useCase = new ProcessIncomingMetaMessageUseCase(
      { extract: jest.fn(() => [message]) } as unknown as MetaWebhookMessageExtractor,
      { resolve: jest.fn(() => dealerProfile) } as unknown as DealerProfileResolver,
      { reserve: jest.fn().mockResolvedValue(true) } as unknown as MessageIdempotencyStore,
      conversationState,
      { execute: jest.fn() } as unknown as EnsureMetaUserProfileUseCase,
      { getMediaContent: jest.fn() } as unknown as MediaContentReaderPort,
      { transcribeAudio: jest.fn(), describeImage: jest.fn() } as unknown as MediaAnalyzerPort,
      { generateReply: jest.fn() } as unknown as AssistantReplyGeneratorPort,
      { extractLeadCustomFields: jest.fn().mockResolvedValue({ phone: '3055555555' }) } as unknown as LeadCustomFieldsExtractorPort,
      messenger as unknown as MetaMessengerPort,
      {
        updateCustomFields: jest.fn(),
        recordConversationMessage: jest.fn(),
      } as unknown as CrmSinkPort,
      background as unknown as BackgroundTaskRunnerPort,
      vivaEvents as unknown as VivaSofiaEventPublisherPort,
    );

    await useCase.execute({} as MetaWebhookPayload);

    expect(messenger.sendTextMessage).toHaveBeenCalledWith(
      'messenger',
      'contact-2',
      'Perfecto ✅ Ya tengo la información. Un especialista se comunicará pronto.',
      'page-1',
    );
    expect(conversationState.cancelFollowUp).toHaveBeenCalledWith(
      'messenger',
      'contact-2',
      'page-1',
    );
    expect(conversationState.scheduleFollowUp).not.toHaveBeenCalled();
    expect(background.run).toHaveBeenCalledWith('sync-ghl-passive-crm', expect.any(Function));
    expect(background.run).toHaveBeenCalledWith('viva-sofia-event-publisher', expect.any(Function));
  });
});

const dealerProfile: DealerProfile = {
  key: 'offlease-fredericksburg',
  displayName: 'Off Lease Fredericksburg',
  locationCity: 'Fredericksburg',
  locationState: 'VA',
  assistantPrompt: 'Dealer qualification prompt.',
};

function conversationStateRepository(): jest.Mocked<ConversationStateRepository> {
  return {
    getState: jest.fn().mockResolvedValue(undefined),
    appendMessage: jest.fn(),
    getRecentMessages: jest.fn().mockResolvedValue([]),
    mergeLeadCustomFields: jest.fn().mockResolvedValue({ status: 'active', customFields: {} }),
    reactivateLeadQualification: jest.fn(),
    scheduleFollowUp: jest.fn(),
    cancelFollowUp: jest.fn(),
    findDueFollowUps: jest.fn(),
    recordFollowUpAttempt: jest.fn(),
    updateCustomerProfile: jest.fn(),
  };
}
