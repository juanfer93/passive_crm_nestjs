import { Injectable, Logger } from '@nestjs/common';
import { BackgroundTaskRunnerPort } from '@/features/meta-messaging-webhook/domain/ports/background-task-runner.port';

@Injectable()
export class NodeBackgroundTaskRunner implements BackgroundTaskRunnerPort {
  private readonly logger = new Logger(NodeBackgroundTaskRunner.name);

  run(taskName: string, task: () => Promise<void>): void {
    setImmediate(() => {
      task().catch((error: unknown) => {
        this.logger.error(`Background task failed: ${taskName}`, error);
      });
    });
  }
}
