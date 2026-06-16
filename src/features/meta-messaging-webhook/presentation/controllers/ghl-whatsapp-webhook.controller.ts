import { Body, Controller, ForbiddenException, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessGhlWhatsappWakeupUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-ghl-whatsapp-wakeup.use-case';
import { GhlWhatsappWakeupPayload } from '@/features/meta-messaging-webhook/domain/entities/ghl-whatsapp-event.entity';

@Controller('webhooks/ghl/whatsapp')
export class GhlWhatsappWebhookController {
  constructor(
    private readonly config: ConfigService,
    private readonly processor: ProcessGhlWhatsappWakeupUseCase,
  ) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() payload: GhlWhatsappWakeupPayload,
    @Headers('x-ghl-webhook-secret') secret?: string,
  ): Promise<{ received: true; processedMessages: number; recoveredMessages: number; events: string[] }> {
    this.assertSecret(secret);
    const result = await this.processor.execute(payload);

    return result;
  }

  private assertSecret(secret?: string): void {
    const expected = this.config.get<string>('GHL_WEBHOOK_SECRET');

    if (expected && secret !== expected) {
      throw new ForbiddenException('Invalid GHL webhook secret.');
    }
  }
}
