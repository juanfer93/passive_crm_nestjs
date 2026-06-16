import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessGhlWhatsappWakeupUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-ghl-whatsapp-wakeup.use-case';
import { GhlMessagingService } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-messaging.service';

@Injectable()
export class GhlWhatsappReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GhlWhatsappReconciliationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly config: ConfigService,
    private readonly ghlMessaging: GhlMessagingService,
    private readonly processor: ProcessGhlWhatsappWakeupUseCase,
  ) {}

  onModuleInit(): void {
    if (!this.enabled) {
      return;
    }

    this.timer = setInterval(() => {
      void this.runOnce();
    }, this.intervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runOnce(): Promise<void> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const locationId = this.config.get<string>('GHL_LOCATION_ID');

    if (!locationId) {
      this.logger.warn({ event: 'ghl_reconciliation_skipped', reason: 'GHL_LOCATION_ID missing' });
      return;
    }

    const conversations = await this.ghlMessaging.searchActiveConversationsSince({
      locationId,
      since,
      limit: this.config.get<number>('GHL_RECONCILIATION_LIMIT', 100),
    });

    for (const conversation of conversations) {
      await this.processor.execute({
        source: 'ghl',
        event: 'conversation.reconciliation',
        channel: 'whatsapp',
        locationId: conversation.locationId,
        contactId: conversation.contactId,
        conversationId: conversation.conversationId ?? undefined,
        phone: conversation.phone ?? undefined,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private get enabled(): boolean {
    return this.config.get<string>('GHL_RECONCILIATION_ENABLED', 'false').toLowerCase() === 'true';
  }

  private get intervalMs(): number {
    return this.config.get<number>('GHL_RECONCILIATION_INTERVAL_MS', 180_000);
  }
}
