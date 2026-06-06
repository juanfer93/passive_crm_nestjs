import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AcceptMetaWebhookUseCase } from '@/features/meta-messaging-webhook/application/use-cases/accept-meta-webhook.use-case';
import {
  MetaWebhookVerificationQuery,
  VerifyMetaWebhookUseCase,
} from '@/features/meta-messaging-webhook/application/use-cases/verify-meta-webhook.use-case';
import { MetaWebhookPayload } from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';
import { MetaSignatureGuard } from '@/features/meta-messaging-webhook/presentation/guards/meta-signature.guard';

@Controller('webhooks/meta/messaging')
export class MetaMessagingWebhookController {
  constructor(
    private readonly acceptWebhook: AcceptMetaWebhookUseCase,
    private readonly verifyWebhook: VerifyMetaWebhookUseCase,
  ) {}

  @Get()
  verify(@Query() query: MetaWebhookVerificationQuery): string {
    const challenge = this.verifyWebhook.execute(query);

    if (!challenge) {
      throw new ForbiddenException('Invalid Meta webhook verification request.');
    }

    return challenge;
  }

  @Post()
  @UseGuards(MetaSignatureGuard)
  @HttpCode(200)
  receive(@Body() payload: MetaWebhookPayload): { received: true } {
    this.acceptWebhook.execute(payload);

    return { received: true };
  }
}
