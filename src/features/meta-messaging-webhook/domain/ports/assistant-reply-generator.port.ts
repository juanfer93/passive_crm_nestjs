import { AssistantContext } from '@/features/meta-messaging-webhook/domain/entities/assistant-context.entity';

export const ASSISTANT_REPLY_GENERATOR = Symbol('ASSISTANT_REPLY_GENERATOR');

export interface AssistantReplyGeneratorPort {
  generateReply(context: AssistantContext): Promise<string>;
}
