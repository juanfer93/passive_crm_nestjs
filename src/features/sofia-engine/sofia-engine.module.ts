import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaMessagingAdapter } from '@/features/meta-messaging-webhook/infrastructure/meta/meta-messaging.adapter';
import {
  Conversation,
  ConversationSchema,
} from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';
import { SofiaActionService } from '@/features/sofia-engine/application/services/sofia-action.service';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaDecisionService } from '@/features/sofia-engine/application/services/sofia-decision.service';
import { SofiaLearningService } from '@/features/sofia-engine/application/services/sofia-learning.service';
import { SofiaPromptService } from '@/features/sofia-engine/application/services/sofia-prompt.service';
import { SofiaWebhookBridgeService } from '@/features/sofia-engine/application/services/sofia-webhook-bridge.service';
import {
  SofiaAction,
  SofiaActionSchema,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-action.schema';
import {
  SofiaActivity,
  SofiaActivitySchema,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-activity.schema';
import {
  SofiaRecommendationRecord,
  SofiaRecommendationSchema,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-recommendation.schema';
import { SofiaEngineController } from '@/features/sofia-engine/presentation/controllers/sofia-engine.controller';
import { SofiaAccessGuard } from '@/features/sofia-engine/presentation/guards/sofia-access.guard';

@Module({
  imports: [
    HttpModule.register({ timeout: 8000, maxRedirects: 3 }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: SofiaAction.name, schema: SofiaActionSchema },
      { name: SofiaActivity.name, schema: SofiaActivitySchema },
      { name: SofiaRecommendationRecord.name, schema: SofiaRecommendationSchema },
    ]),
  ],
  controllers: [SofiaEngineController],
  providers: [
    DealerProfileResolver,
    MetaMessagingAdapter,
    SofiaAccessGuard,
    SofiaActionService,
    SofiaActivityService,
    SofiaContextService,
    SofiaDecisionService,
    SofiaLearningService,
    SofiaPromptService,
    SofiaWebhookBridgeService,
  ],
  exports: [SofiaWebhookBridgeService],
})
export class SofiaEngineModule {}
