import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcessDueFollowUpsUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-due-follow-ups.use-case';

@Injectable()
export class NodeFollowUpWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeFollowUpWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly followUps: ProcessDueFollowUpsUseCase,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('FOLLOW_UP_WORKER_ENABLED', 'true') !== 'true') {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    try {
      await this.followUps.execute(new Date());
    } catch (error: unknown) {
      this.logger.error('Follow-up worker failed', error);
    } finally {
      this.running = false;
    }
  }

  private get intervalMs(): number {
    return this.config.get<number>('FOLLOW_UP_WORKER_INTERVAL_MS', 60_000);
  }
}
