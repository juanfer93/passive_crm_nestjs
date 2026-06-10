import { ConfigService } from '@nestjs/config';
import { ProcessDueFollowUpsUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-due-follow-ups.use-case';
import { ConversationStateRepository } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { MetaMessengerPort } from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';

describe('ProcessDueFollowUpsUseCase', () => {
  it('sends up to three follow-ups every two hours and then exhausts the sequence', async () => {
    const now = new Date('2026-06-10T12:00:00.000Z');
    const repository = repositoryMock();
    const messenger = { sendTextMessage: jest.fn() } satisfies jest.Mocked<MetaMessengerPort>;
    const useCase = new ProcessDueFollowUpsUseCase(
      repository,
      messenger,
      configService({ FOLLOW_UP_DELAY_HOURS: 2 }),
    );

    repository.findDueFollowUps
      .mockResolvedValueOnce([conversationWithAttempt(0, now)])
      .mockResolvedValueOnce([conversationWithAttempt(1, new Date('2026-06-10T14:00:00.000Z'))])
      .mockResolvedValueOnce([conversationWithAttempt(2, new Date('2026-06-10T16:00:00.000Z'))]);

    await useCase.execute(now);
    await useCase.execute(new Date('2026-06-10T14:00:00.000Z'));
    await useCase.execute(new Date('2026-06-10T16:00:00.000Z'));

    expect(messenger.sendTextMessage).toHaveBeenCalledTimes(3);
    expect(messenger.sendTextMessage).toHaveBeenNthCalledWith(
      1,
      'messenger',
      'contact-1',
      'Hola, solo paso a confirmar: buscas un sedan, un SUV o una troca?',
      'page-1',
    );
    expect(messenger.sendTextMessage).toHaveBeenNthCalledWith(
      2,
      'messenger',
      'contact-1',
      'Cuando tengas un momento, buscas un sedan, un SUV o una troca?',
      'page-1',
    );
    expect(messenger.sendTextMessage).toHaveBeenNthCalledWith(
      3,
      'messenger',
      'contact-1',
      'Cuando quieras continuar, puedes responder por aqui y con gusto retomamos: buscas un sedan, un SUV o una troca?',
      'page-1',
    );
    expect(repository.recordFollowUpAttempt).toHaveBeenNthCalledWith(
      1,
      'messenger',
      'contact-1',
      expect.objectContaining({
        status: 'active',
        attempts: 1,
        nextFollowUpAt: new Date('2026-06-10T14:00:00.000Z'),
      }),
      'page-1',
    );
    expect(repository.recordFollowUpAttempt).toHaveBeenNthCalledWith(
      3,
      'messenger',
      'contact-1',
      expect.objectContaining({
        status: 'exhausted',
        attempts: 3,
        lastSentAt: new Date('2026-06-10T16:00:00.000Z'),
      }),
      'page-1',
    );
    expect(repository.recordFollowUpAttempt.mock.calls[2][2].nextFollowUpAt).toBeUndefined();
  });

  it('does not send follow-ups for completed leads', async () => {
    const repository = repositoryMock();
    const messenger = { sendTextMessage: jest.fn() } satisfies jest.Mocked<MetaMessengerPort>;
    const useCase = new ProcessDueFollowUpsUseCase(repository, messenger, configService());

    repository.findDueFollowUps.mockResolvedValue([
      {
        channel: 'messenger',
        pageId: 'page-1',
        contactId: 'contact-1',
        messages: [],
        leadCustomFields: {
          purchase_timeline: 'esta semana',
          lead_temperature: 'hot',
          vehicle_type: 'Sedan',
          down_payment: '2000',
          document_status: 'confirmed',
          phone: '3055555555',
        },
        qualificationStatus: 'completed',
        followUp: {
          status: 'active',
          attempts: 1,
          nextFollowUpAt: new Date('2026-06-10T12:00:00.000Z'),
        },
      },
    ]);

    await useCase.execute(new Date('2026-06-10T12:00:00.000Z'));

    expect(messenger.sendTextMessage).not.toHaveBeenCalled();
    expect(repository.cancelFollowUp).toHaveBeenCalledWith('messenger', 'contact-1', 'page-1');
  });
});

function conversationWithAttempt(attempts: number, nextFollowUpAt: Date) {
  return {
    channel: 'messenger' as const,
    pageId: 'page-1',
    contactId: 'contact-1',
    messages: [],
    leadCustomFields: {
      purchase_timeline: 'esta semana',
      lead_temperature: 'hot',
    },
    qualificationStatus: 'active' as const,
    followUp: {
      status: 'active' as const,
      attempts,
      nextFollowUpAt,
    },
  };
}

function repositoryMock(): jest.Mocked<ConversationStateRepository> {
  return {
    appendMessage: jest.fn(),
    getState: jest.fn(),
    mergeLeadCustomFields: jest.fn(),
    reactivateLeadQualification: jest.fn(),
    getRecentMessages: jest.fn(),
    scheduleFollowUp: jest.fn(),
    cancelFollowUp: jest.fn(),
    findDueFollowUps: jest.fn(),
    recordFollowUpAttempt: jest.fn(),
    updateCustomerProfile: jest.fn(),
  };
}

function configService(values: Record<string, number> = {}): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T) => (values[key] ?? defaultValue) as T,
  } as unknown as ConfigService;
}
