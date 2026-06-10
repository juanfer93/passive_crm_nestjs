import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { buildLeadFollowUpMessage } from '@/features/meta-messaging-webhook/domain/services/lead-follow-up-message.service';
import {
  CONVERSATION_STATE_REPOSITORY,
  ConversationStateRepository,
} from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import {
  META_MESSENGER,
  MetaMessengerPort,
} from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';

@Injectable()
export class ProcessDueFollowUpsUseCase {
  constructor(
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    @Inject(META_MESSENGER)
    private readonly messenger: MetaMessengerPort,
    private readonly config: ConfigService,
  ) {}

  async execute(now = new Date()): Promise<void> {
    const conversations = await this.conversationState.findDueFollowUps(
      now,
      this.config.get<number>('FOLLOW_UP_BATCH_SIZE', 25),
    );

    for (const conversation of conversations) {
      if (conversation.qualificationStatus === 'completed') {
        await this.conversationState.cancelFollowUp(
          conversation.channel,
          conversation.contactId,
          conversation.pageId,
        );
        continue;
      }

      const nextAttempt = (conversation.followUp?.attempts ?? 0) + 1;
      const text = buildLeadFollowUpMessage(conversation.leadCustomFields, nextAttempt);

      await this.messenger.sendTextMessage(
        conversation.channel,
        conversation.contactId,
        text,
        conversation.pageId,
      );

      const outboundMessage: ConversationMessage = {
        id: `follow-up:${conversation.channel}:${conversation.pageId ?? 'local'}:${conversation.contactId}:${now.getTime()}:${nextAttempt}`,
        channel: conversation.channel,
        pageId: conversation.pageId,
        contactId: conversation.contactId,
        direction: 'outbound',
        kind: 'text',
        text,
        occurredAt: now,
      };

      await this.conversationState.appendMessage(outboundMessage);
      await this.conversationState.recordFollowUpAttempt(
        conversation.channel,
        conversation.contactId,
        {
          status: nextAttempt >= 3 ? 'exhausted' : 'active',
          attempts: nextAttempt,
          lastSentAt: now,
          ...(nextAttempt >= 3 ? {} : { nextFollowUpAt: this.nextFollowUpAt(now) }),
        },
        conversation.pageId,
      );
    }
  }

  private nextFollowUpAt(from: Date): Date {
    return new Date(from.getTime() + this.followUpDelayMs);
  }

  private get followUpDelayMs(): number {
    const configuredHours = this.config.get<number>('FOLLOW_UP_DELAY_HOURS', 2);
    return configuredHours * 60 * 60 * 1000;
  }
}
