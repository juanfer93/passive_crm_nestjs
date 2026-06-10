import { Logger } from '@nestjs/common';
import { EnsureMetaUserProfileUseCase } from '@/features/meta-messaging-webhook/application/use-cases/ensure-meta-user-profile.use-case';
import { ConversationStateRepository } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';

describe('EnsureMetaUserProfileUseCase', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and stores the real Meta profile when the conversation has no successful profile', async () => {
    const repository = repositoryMock();
    const profiles = {
      fetchProfile: jest.fn().mockResolvedValue({
        firstName: 'Carlos',
        lastName: 'Ramirez',
        fullName: 'Carlos Ramirez',
        fetchStatus: 'success',
      }),
    };
    const useCase = new EnsureMetaUserProfileUseCase(repository, profiles);

    await useCase.execute({
      state: null,
      channel: 'messenger',
      pageId: 'page-1',
      contactId: 'psid-1',
    });

    expect(profiles.fetchProfile).toHaveBeenCalledWith('page-1', 'psid-1');
    expect(repository.updateCustomerProfile).toHaveBeenCalledWith(
      'messenger',
      'psid-1',
      expect.objectContaining({
        firstName: 'Carlos',
        fullName: 'Carlos Ramirez',
      }),
      'page-1',
    );
  });

  it('does not fetch Meta profile on every message once the profile is successful', async () => {
    const repository = repositoryMock();
    const profiles = { fetchProfile: jest.fn() };
    const useCase = new EnsureMetaUserProfileUseCase(repository, profiles);

    await useCase.execute({
      state: {
        channel: 'messenger',
        pageId: 'page-1',
        contactId: 'psid-1',
        messages: [],
        leadCustomFields: {},
        qualificationStatus: 'active',
        customerProfile: { fetchStatus: 'success', fullName: 'Carlos Ramirez' },
      },
      channel: 'messenger',
      pageId: 'page-1',
      contactId: 'psid-1',
    });

    expect(profiles.fetchProfile).not.toHaveBeenCalled();
    expect(repository.updateCustomerProfile).not.toHaveBeenCalled();
  });

  it('stores a safe failed profile status when Meta profile lookup fails', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const repository = repositoryMock();
    const profiles = {
      fetchProfile: jest.fn().mockRejectedValue(new Error('Request failed with token secret')),
    };
    const useCase = new EnsureMetaUserProfileUseCase(repository, profiles);

    await useCase.execute({
      state: null,
      channel: 'messenger',
      pageId: 'page-1',
      contactId: 'psid-1',
    });

    expect(repository.updateCustomerProfile).toHaveBeenCalledWith(
      'messenger',
      'psid-1',
      expect.objectContaining({
        fetchStatus: 'failed',
        source: 'meta',
      }),
      'page-1',
    );
  });

  it('stores Meta Graph API error details without exposing tokens', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const repository = repositoryMock();
    const profiles = {
      fetchProfile: jest.fn().mockRejectedValue({
        response: {
          data: {
            error: {
              message: 'Unsupported get request. Object does not exist or cannot be loaded.',
              type: 'GraphMethodException',
              code: 100,
              error_subcode: 33,
            },
          },
        },
      }),
    };
    const useCase = new EnsureMetaUserProfileUseCase(repository, profiles);

    await useCase.execute({
      state: null,
      channel: 'messenger',
      pageId: 'page-1',
      contactId: 'psid-1',
    });

    expect(repository.updateCustomerProfile).toHaveBeenCalledWith(
      'messenger',
      'psid-1',
      expect.objectContaining({
        fetchStatus: 'failed',
        lastError:
          'Meta Graph API error: Unsupported get request. Object does not exist or cannot be loaded. (type=GraphMethodException, code=100, subcode=33)',
      }),
      'page-1',
    );
  });
});

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
