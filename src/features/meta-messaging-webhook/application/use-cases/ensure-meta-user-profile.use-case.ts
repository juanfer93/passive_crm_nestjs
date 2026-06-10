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

interface HttpErrorResponse {
  response?: {
    data?: unknown;
  };
}

interface MetaGraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
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
    const graphError = this.metaGraphError(error);

    if (graphError) {
      return graphError;
    }

    if (error instanceof Error) {
      return error.message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 300);
    }

    return 'unknown meta profile error';
  }

  private metaGraphError(error: unknown): string | null {
    if (!this.isHttpErrorResponse(error)) {
      return null;
    }

    const data = error.response?.data;

    if (!this.isMetaGraphErrorPayload(data)) {
      return null;
    }

    const metaError = data.error;

    if (!metaError) {
      return null;
    }

    const details = [
      metaError.type ? `type=${metaError.type}` : null,
      typeof metaError.code === 'number' ? `code=${metaError.code}` : null,
      typeof metaError.error_subcode === 'number' ? `subcode=${metaError.error_subcode}` : null,
    ].filter(Boolean);

    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';

    return `Meta Graph API error: ${metaError.message ?? 'unknown error'}${suffix}`
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .slice(0, 300);
  }

  private isHttpErrorResponse(error: unknown): error is HttpErrorResponse {
    return typeof error === 'object' && error !== null && 'response' in error;
  }

  private isMetaGraphErrorPayload(data: unknown): data is MetaGraphErrorPayload {
    if (typeof data !== 'object' || data === null || !('error' in data)) {
      return false;
    }

    const payload = data as MetaGraphErrorPayload;
    return typeof payload.error === 'object' && payload.error !== null;
  }

  private mask(value: string): string {
    return value.length <= 4 ? '****' : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}
