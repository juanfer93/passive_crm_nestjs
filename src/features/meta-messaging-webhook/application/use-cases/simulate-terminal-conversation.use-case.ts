import { Inject, Injectable } from '@nestjs/common';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { DealerProfile } from '@/features/meta-messaging-webhook/domain/entities/dealer-profile.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { buildCompletedLeadCourtesyReply } from '@/features/meta-messaging-webhook/domain/services/completed-lead-courtesy-reply.service';
import { shouldReactivateLeadQualification } from '@/features/meta-messaging-webhook/domain/services/lead-qualification-reactivation.service';
import {
  ASSISTANT_REPLY_GENERATOR,
  AssistantReplyGeneratorPort,
} from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import {
  CONVERSATION_STATE_REPOSITORY,
  ConversationStateRepository,
} from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import {
  LEAD_CUSTOM_FIELDS_EXTRACTOR,
  LeadCustomFieldsExtractorPort,
} from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';

export interface SimulateTerminalConversationInput {
  channel: MetaMessagingChannel;
  contactId: string;
  profileKey: string;
  text: string;
}

export interface SimulateTerminalConversationResult {
  dealerProfile: DealerProfile;
  reply?: string;
  leadCustomFields: LeadCustomFields;
  completed: boolean;
  stopped: boolean;
}

@Injectable()
export class SimulateTerminalConversationUseCase {
  constructor(
    private readonly dealerProfiles: DealerProfileResolver,
    @Inject(CONVERSATION_STATE_REPOSITORY)
    private readonly conversationState: ConversationStateRepository,
    @Inject(ASSISTANT_REPLY_GENERATOR)
    private readonly assistant: AssistantReplyGeneratorPort,
    @Inject(LEAD_CUSTOM_FIELDS_EXTRACTOR)
    private readonly leadFieldsExtractor: LeadCustomFieldsExtractorPort,
  ) {}

  async execute(input: SimulateTerminalConversationInput): Promise<SimulateTerminalConversationResult> {
    const dealerProfile = this.dealerProfiles.resolve({ profileKey: input.profileKey });
    const inboundMessage: ConversationMessage = {
      id: `terminal:${Date.now()}`,
      channel: input.channel,
      contactId: input.contactId,
      direction: 'inbound',
      kind: 'text',
      text: input.text,
      occurredAt: new Date(),
    };

    const currentState = await this.conversationState.getState(input.channel, input.contactId);
    const shouldReactivate = shouldReactivateLeadQualification(currentState, new Date());
    const hasPriorConversation = !shouldReactivate && Boolean(currentState?.messages.length);

    if (shouldReactivate) {
      await this.conversationState.reactivateLeadQualification(input.channel, input.contactId);
    }

    await this.conversationState.appendMessage(inboundMessage);

    if (currentState?.qualificationStatus === 'completed' && !shouldReactivate) {
      const reply = buildCompletedLeadCourtesyReply(input.text);

      if (reply) {
        await this.conversationState.appendMessage({
          id: `${inboundMessage.id}:outbound`,
          channel: input.channel,
          contactId: input.contactId,
          direction: 'outbound',
          kind: 'text',
          text: reply,
          occurredAt: new Date(),
        });
      }

      return {
        dealerProfile,
        reply: reply ?? undefined,
        leadCustomFields: currentState.leadCustomFields,
        completed: true,
        stopped: !reply,
      };
    }

    const recentMessages = shouldReactivate
      ? [inboundMessage]
      : await this.conversationState.getRecentMessages(input.channel, input.contactId, 12);
    const extractedFields = await this.leadFieldsExtractor.extractLeadCustomFields({
      channel: input.channel,
      contactId: input.contactId,
      recentMessages,
      knownFields: shouldReactivate ? {} : currentState?.leadCustomFields ?? {},
      dealerProfile,
    });
    const leadQualification = await this.conversationState.mergeLeadCustomFields(
      input.channel,
      input.contactId,
      extractedFields,
    );
    const reply =
      leadQualification.status === 'completed'
        ? 'Perfecto ✅ Ya tengo la información. Un especialista se comunicará pronto.'
        : await this.assistant.generateReply({
            channel: input.channel,
            contactId: input.contactId,
            userMessage: input.text,
            recentMessages,
            hasPriorConversation,
            leadCustomFields: leadQualification.customFields,
            dealerProfile,
          });

    const outboundMessage: ConversationMessage = {
      id: `${inboundMessage.id}:outbound`,
      channel: input.channel,
      contactId: input.contactId,
      direction: 'outbound',
      kind: 'text',
      text: reply,
      occurredAt: new Date(),
    };

    await this.conversationState.appendMessage(outboundMessage);

    return {
      dealerProfile,
      reply,
      leadCustomFields: leadQualification.customFields,
      completed: leadQualification.status === 'completed',
      stopped: false,
    };
  }
}
