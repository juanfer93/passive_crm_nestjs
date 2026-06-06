export const BACKGROUND_TASK_RUNNER = Symbol('BACKGROUND_TASK_RUNNER');

export interface BackgroundTaskRunnerPort {
  run(taskName: string, task: () => Promise<void>): void;
}
