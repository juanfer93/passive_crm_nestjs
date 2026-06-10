import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AcceptMetaWebhookUseCase } from '@/features/meta-messaging-webhook/application/use-cases/accept-meta-webhook.use-case';
import { ProcessIncomingMetaMessageUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-incoming-meta-message.use-case';
import { ProcessDueFollowUpsUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-due-follow-ups.use-case';
import { SimulateTerminalConversationUseCase } from '@/features/meta-messaging-webhook/application/use-cases/simulate-terminal-conversation.use-case';
import { VerifyMetaWebhookUseCase } from '@/features/meta-messaging-webhook/application/use-cases/verify-meta-webhook.use-case';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaWebhookMessageExtractor } from '@/features/meta-messaging-webhook/application/services/meta-webhook-message-extractor.service';
import { ASSISTANT_REPLY_GENERATOR } from '@/features/meta-messaging-webhook/domain/ports/assistant-reply-generator.port';
import { BACKGROUND_TASK_RUNNER } from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';
import { CONVERSATION_STATE_REPOSITORY } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { CRM_SINK } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';
import { MEDIA_ANALYZER } from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';
import { MEDIA_CONTENT_READER } from '@/features/meta-messaging-webhook/domain/ports/media-content-reader.port';
import { MESSAGE_IDEMPOTENCY_STORE } from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import { LEAD_CUSTOM_FIELDS_EXTRACTOR } from '@/features/meta-messaging-webhook/domain/ports/lead-custom-fields-extractor.port';
import { META_MESSENGER } from '@/features/meta-messaging-webhook/domain/ports/meta-messenger.port';
import { NodeBackgroundTaskRunner } from '@/features/meta-messaging-webhook/infrastructure/background/node-background-task-runner';
import { NodeFollowUpWorker } from '@/features/meta-messaging-webhook/infrastructure/background/node-follow-up-worker';
import { GhlPassiveCrmAdapter } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-passive-crm.adapter';
import { MetaMessagingAdapter } from '@/features/meta-messaging-webhook/infrastructure/meta/meta-messaging.adapter';
import { MongoConversationStateRepository } from '@/features/meta-messaging-webhook/infrastructure/mongo/mongo-conversation-state.repository';
import { MongoMessageIdempotencyStore } from '@/features/meta-messaging-webhook/infrastructure/mongo/mongo-message-idempotency.store';
import { Conversation, ConversationSchema } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';
import {
  MessageReceipt,
  MessageReceiptSchema,
} from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/message-receipt.schema';
import { OpenAiAssistantAdapter } from '@/features/meta-messaging-webhook/infrastructure/openai/openai-assistant.adapter';
import { MetaMessagingWebhookController } from '@/features/meta-messaging-webhook/presentation/controllers/meta-messaging-webhook.controller';
import { MetaSignatureGuard } from '@/features/meta-messaging-webhook/presentation/guards/meta-signature.guard';
import { HlnCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/hln-crm-sink.adapter';
import { CompositeCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/composite-crm-sink.adapter';

@Module({
  imports: [
    HttpModule.register({
      timeout: 8000,
      maxRedirects: 3,
    }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: MessageReceipt.name, schema: MessageReceiptSchema },
    ]),
  ],
  controllers: [MetaMessagingWebhookController],
  providers: [
    AcceptMetaWebhookUseCase,
    ProcessDueFollowUpsUseCase,
    ProcessIncomingMetaMessageUseCase,
    SimulateTerminalConversationUseCase,
    VerifyMetaWebhookUseCase,
    DealerProfileResolver,
    MetaWebhookMessageExtractor,
    MetaSignatureGuard,
    MetaMessagingAdapter,
    OpenAiAssistantAdapter,
    GhlPassiveCrmAdapter,
    NodeBackgroundTaskRunner,
    NodeFollowUpWorker,
    HlnCrmSinkAdapter,
    CompositeCrmSinkAdapter,
    {
      provide: BACKGROUND_TASK_RUNNER,
      useExisting: NodeBackgroundTaskRunner,
    },
    {
      provide: MESSAGE_IDEMPOTENCY_STORE,
      useClass: MongoMessageIdempotencyStore,
    },
    {
      provide: CONVERSATION_STATE_REPOSITORY,
      useClass: MongoConversationStateRepository,
    },
    {
      provide: META_MESSENGER,
      useExisting: MetaMessagingAdapter,
    },
    {
      provide: MEDIA_CONTENT_READER,
      useExisting: MetaMessagingAdapter,
    },
    {
      provide: MEDIA_ANALYZER,
      useExisting: OpenAiAssistantAdapter,
    },
    {
      provide: ASSISTANT_REPLY_GENERATOR,
      useExisting: OpenAiAssistantAdapter,
    },
    {
      provide: LEAD_CUSTOM_FIELDS_EXTRACTOR,
      useExisting: OpenAiAssistantAdapter,
    },
    {
      provide: CRM_SINK,
      useExisting: CompositeCrmSinkAdapter ,
    },
  ],
})
export class MetaMessagingWebhookModule {}
