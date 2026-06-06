import { Inject, Injectable } from '@nestjs/common';
import {
  BACKGROUND_TASK_RUNNER,
  BackgroundTaskRunnerPort,
} from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';
import { MetaWebhookPayload } from '@/features/meta-messaging-webhook/domain/types/meta-webhook-payload.type';
import { ProcessIncomingMetaMessageUseCase } from '@/features/meta-messaging-webhook/application/use-cases/process-incoming-meta-message.use-case';

@Injectable()
export class AcceptMetaWebhookUseCase {
  constructor(
    @Inject(BACKGROUND_TASK_RUNNER)
    private readonly background: BackgroundTaskRunnerPort,
    private readonly processor: ProcessIncomingMetaMessageUseCase,
  ) {}

  execute(payload: MetaWebhookPayload): void {
    this.background.run('process-meta-messaging-webhook', () => this.processor.execute(payload));
  }
}
