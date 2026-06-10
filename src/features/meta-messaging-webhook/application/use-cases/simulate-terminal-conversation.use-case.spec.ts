import {
  DealerProfileResolver,
  getDealerProfile,
} from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { SimulateTerminalConversationUseCase } from '@/features/meta-messaging-webhook/application/use-cases/simulate-terminal-conversation.use-case';
import { ConversationStateRepository } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { AssistantReplyGeneratorPort } from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import { LeadCustomFieldsExtractorPort } from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';

describe('SimulateTerminalConversationUseCase', () => {
  const dealerProfile = getDealerProfile('offlease-fredericksburg');
  const dealerProfiles = {
    resolve: jest.fn(() => dealerProfile),
  };
  const repository = {
    appendMessage: jest.fn(),
    getState: jest.fn(),
    getRecentMessages: jest.fn(),
    mergeLeadCustomFields: jest.fn(),
    reactivateLeadQualification: jest.fn(),
    scheduleFollowUp: jest.fn(),
    cancelFollowUp: jest.fn(),
    findDueFollowUps: jest.fn(),
    recordFollowUpAttempt: jest.fn(),
    updateCustomerProfile: jest.fn(),
  } satisfies jest.Mocked<ConversationStateRepository>;
  const assistant = {
    generateReply: jest.fn(),
  } satisfies jest.Mocked<AssistantReplyGeneratorPort>;
  const extractor = {
    extractLeadCustomFields: jest.fn(),
  } satisfies jest.Mocked<LeadCustomFieldsExtractorPort>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the farewell and stores it when the lead fields become complete', async () => {
    repository.appendMessage.mockResolvedValue(undefined);
    repository.getState.mockResolvedValue({
      channel: 'messenger',
      contactId: 'contact-1',
      messages: [],
      leadCustomFields: {
        purchase_timeline: 'esta semana',
        vehicle_type: 'SUV',
      },
      qualificationStatus: 'active',
    });
    repository.getRecentMessages.mockResolvedValue([]);
    extractor.extractLeadCustomFields.mockResolvedValue({
      down_payment: '$2500',
      document_status: 'confirmed',
      phone: '3055555555',
    });
    repository.mergeLeadCustomFields.mockResolvedValue({
      customFields: {
        purchase_timeline: 'esta semana',
        vehicle_type: 'SUV',
        down_payment: '$2500',
        document_status: 'confirmed',
        phone: '3055555555',
      },
      status: 'completed',
      completedAt: new Date('2026-06-08T12:00:00.000Z'),
    });

    const result = await new SimulateTerminalConversationUseCase(
      dealerProfiles as unknown as DealerProfileResolver,
      repository,
      assistant,
      extractor,
    ).execute({
      channel: 'messenger',
      contactId: 'contact-1',
      profileKey: 'offlease-fredericksburg',
      text: 'Mi telefono es 3055555555',
    });

    expect(result.completed).toBe(true);
    expect(result.reply).toBe(
      'Perfecto ✅ Ya tengo la información. Un especialista se comunicará pronto.',
    );
    expect(assistant.generateReply).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledTimes(2);
  });

  it('stores new inbound text but does not reply after the lead is completed', async () => {
    repository.appendMessage.mockResolvedValue(undefined);
    repository.getState.mockResolvedValue({
      channel: 'messenger',
      contactId: 'contact-1',
      messages: [],
      leadCustomFields: {
        purchase_timeline: 'esta semana',
        vehicle_type: 'SUV',
        down_payment: '$2500',
        document_status: 'confirmed',
        phone: '3055555555',
      },
      qualificationStatus: 'completed',
      qualificationCompletedAt: new Date(),
    });

    const result = await new SimulateTerminalConversationUseCase(
      dealerProfiles as unknown as DealerProfileResolver,
      repository,
      assistant,
      extractor,
    ).execute({
      channel: 'messenger',
      contactId: 'contact-1',
      profileKey: 'offlease-fredericksburg',
      text: 'Sigues ahi?',
    });

    expect(result.stopped).toBe(true);
    expect(result.reply).toBeUndefined();
    expect(extractor.extractLeadCustomFields).not.toHaveBeenCalled();
    expect(assistant.generateReply).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledTimes(1);
    expect(repository.reactivateLeadQualification).not.toHaveBeenCalled();
  });

  it('replies with a short courtesy after completion when the lead says thanks', async () => {
    repository.appendMessage.mockResolvedValue(undefined);
    repository.getState.mockResolvedValue({
      channel: 'messenger',
      contactId: 'contact-1',
      messages: [],
      leadCustomFields: {
        purchase_timeline: 'esta semana',
        vehicle_type: 'SUV',
        down_payment: '$2500',
        document_status: 'confirmed',
        phone: '3055555555',
      },
      qualificationStatus: 'completed',
      qualificationCompletedAt: new Date(),
    });

    const result = await new SimulateTerminalConversationUseCase(
      dealerProfiles as unknown as DealerProfileResolver,
      repository,
      assistant,
      extractor,
    ).execute({
      channel: 'messenger',
      contactId: 'contact-1',
      profileKey: 'offlease-fredericksburg',
      text: 'Muchas gracias',
    });

    expect(result.stopped).toBe(false);
    expect(result.reply).toBe('Con gusto. Un especialista se comunicará contigo pronto.');
    expect(extractor.extractLeadCustomFields).not.toHaveBeenCalled();
    expect(assistant.generateReply).not.toHaveBeenCalled();
    expect(repository.appendMessage).toHaveBeenCalledTimes(2);
  });

  it('reactivates a completed lead after 24 hours', async () => {
    repository.appendMessage.mockResolvedValue(undefined);
    repository.reactivateLeadQualification.mockResolvedValue(undefined);
    repository.getState.mockResolvedValue({
      channel: 'messenger',
      contactId: 'contact-1',
      messages: [],
      leadCustomFields: {
        purchase_timeline: 'esta semana',
        vehicle_type: 'SUV',
        down_payment: '$2500',
        document_status: 'confirmed',
        phone: '3055555555',
      },
      qualificationStatus: 'completed',
      qualificationCompletedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    extractor.extractLeadCustomFields.mockResolvedValue({});
    repository.mergeLeadCustomFields.mockResolvedValue({
      customFields: {},
      status: 'active',
    });
    assistant.generateReply.mockResolvedValue(
      'Hola, ¿para cuándo te gustaría tener tu vehículo?',
    );

    const result = await new SimulateTerminalConversationUseCase(
      dealerProfiles as unknown as DealerProfileResolver,
      repository,
      assistant,
      extractor,
    ).execute({
      channel: 'messenger',
      contactId: 'contact-1',
      profileKey: 'offlease-fredericksburg',
      text: 'Hola de nuevo',
    });

    expect(result.stopped).toBe(false);
    expect(repository.reactivateLeadQualification).toHaveBeenCalledWith(
      'messenger',
      'contact-1',
      undefined,
    );
    expect(extractor.extractLeadCustomFields).toHaveBeenCalledWith(
      expect.objectContaining({
        knownFields: {},
        recentMessages: [
          expect.objectContaining({
            text: 'Hola de nuevo',
          }),
        ],
      }),
    );
    expect(assistant.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPriorConversation: false,
      }),
    );
  });

  it('marks the first assistant reply as a conversation without prior history', async () => {
    repository.appendMessage.mockResolvedValue(undefined);
    repository.getState.mockResolvedValue(null);
    repository.getRecentMessages.mockResolvedValue([]);
    extractor.extractLeadCustomFields.mockResolvedValue({});
    repository.mergeLeadCustomFields.mockResolvedValue({
      customFields: {},
      status: 'active',
    });
    assistant.generateReply.mockResolvedValue(
      'Hola, ¿para cuándo te gustaría tener tu vehículo?',
    );

    await new SimulateTerminalConversationUseCase(
      dealerProfiles as unknown as DealerProfileResolver,
      repository,
      assistant,
      extractor,
    ).execute({
      channel: 'messenger',
      contactId: 'new-contact',
      profileKey: 'offlease-fredericksburg',
      text: 'Hola',
    });

    expect(assistant.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        hasPriorConversation: false,
      }),
    );
  });
});
