import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { ASSISTANT_REPLY_GENERATOR } from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import { BACKGROUND_TASK_RUNNER } from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';
import { CONVERSATION_STATE_REPOSITORY } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { CRM_SINK } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';
import { LEAD_CUSTOM_FIELDS_EXTRACTOR } from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import { MEDIA_ANALYZER } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import { MESSAGE_IDEMPOTENCY_STORE } from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import { VIVA_SOFIA_EVENT_PUBLISHER } from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';
import { NodeBackgroundTaskRunner } from '@/features/meta-messaging-webhook/infrastructure/background/node-background-task-runner';
import { GhlPassiveCrmAdapter } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-passive-crm.adapter';
import { CompositeCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/composite-crm-sink.adapter';
import { HlnCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/hln-crm-sink.adapter';
import { MongoConversationStateRepository } from '@/features/meta-messaging-webhook/infrastructure/mongo/mongo-conversation-state.repository';
import { MongoMessageIdempotencyStore } from '@/features/meta-messaging-webhook/infrastructure/mongo/mongo-message-idempotency.store';
import { Conversation, ConversationSchema } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';
import { MessageReceipt, MessageReceiptSchema } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/message-receipt.schema';
import { OpenAiAssistantAdapter } from '@/features/meta-messaging-webhook/infrastructure/openai/openai-assistant.adapter';
import { VivaSofiaEventAdapter } from '@/features/meta-messaging-webhook/infrastructure/viva/viva-sofia-event.adapter';
import { WhatsappWebClientService } from './application/services/whatsapp-web-client.service';
import { WhatsappWebController } from './presentation/controllers/whatsapp-web.controller';

const sharedProviders = [
  DealerProfileResolver,
  OpenAiAssistantAdapter,
  GhlPassiveCrmAdapter,
  HlnCrmSinkAdapter,
  CompositeCrmSinkAdapter,
  MongoConversationStateRepository,
  MongoMessageIdempotencyStore,
  NodeBackgroundTaskRunner,
  VivaSofiaEventAdapter,
  { provide: BACKGROUND_TASK_RUNNER, useExisting: NodeBackgroundTaskRunner },
  { provide: MESSAGE_IDEMPOTENCY_STORE, useClass: MongoMessageIdempotencyStore },
  { provide: CONVERSATION_STATE_REPOSITORY, useClass: MongoConversationStateRepository },
  { provide: MEDIA_ANALYZER, useExisting: OpenAiAssistantAdapter },
  { provide: ASSISTANT_REPLY_GENERATOR, useExisting: OpenAiAssistantAdapter },
  { provide: LEAD_CUSTOM_FIELDS_EXTRACTOR, useExisting: OpenAiAssistantAdapter },
  { provide: CRM_SINK, useExisting: CompositeCrmSinkAdapter },
  { provide: VIVA_SOFIA_EVENT_PUBLISHER, useExisting: VivaSofiaEventAdapter },
];

@Module({
  imports: [
    HttpModule.register({ timeout: 8000, maxRedirects: 3 }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: MessageReceipt.name, schema: MessageReceiptSchema },
    ]),
  ],
  controllers: [WhatsappWebController],
  providers: [WhatsappWebClientService, ...sharedProviders],
  exports: [WhatsappWebClientService],
})
export class WhatsappWebModule {}
