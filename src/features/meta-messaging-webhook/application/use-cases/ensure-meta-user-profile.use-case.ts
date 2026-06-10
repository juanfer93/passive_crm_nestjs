import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConversationState } from '@/features/meta-messaging-webhook/domain/entities/conversation-state.entity';
import {
  CONVERSATION_STATE_REPOSITORY,
  ConversationStateRepository,
} from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import {
  META_USER_PROFILE,
  MetaUserProfilePort,
} from '@/features/meta-messaging-webhook/domain/ports/meta-user-profile.port';

interface EnsureMetaUserProfileInput {
  state: ConversationState | null;
  channel: 'messenger' | 'instagram';
  pageId?: string;
  contactId: string;
}

@Injectable()
export class EnsureMetaUserProfileUseCase {
  private readonly logger = new Logger(EnsureMetaUserProfileUseCase.name);

  constructor(
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    @Inject(META_USER_PROFILE)
    private readonly metaProfiles: MetaUserProfilePort,
  ) {}

  async execute(input: EnsureMetaUserProfileInput): Promise<void> {
    if (input.state?.customerProfile?.fetchStatus === 'success') {
      return;
    }

    try {
      const profile = await this.metaProfiles.fetchProfile(input.pageId, input.contactId);
      await this.conversationState.updateCustomerProfile(
        input.channel,
        input.contactId,
        profile,
        input.pageId,
      );
    } catch (error: unknown) {
      const lastError = this.safeError(error);
      await this.conversationState.updateCustomerProfile(
        input.channel,
        input.contactId,
        {
          source: 'meta',
          fetchStatus: 'failed',
          fetchedAt: new Date(),
          lastError,
        },
        input.pageId,
      );
      this.logger.warn({
        pageId: input.pageId ?? 'local',
        contactId: this.mask(input.contactId),
        status: 'failed',
        error: lastError,
      });
    }
  }

  private safeError(error: unknown): string {
    if (error instanceof Error) {
      return error.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300);
    }

    return 'unknown meta profile error';
  }

  private mask(value: string): string {
    return value.length <= 4 ? '****' : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}
