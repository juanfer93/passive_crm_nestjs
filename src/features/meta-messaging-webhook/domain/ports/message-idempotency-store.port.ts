export const MESSAGE_IDEMPOTENCY_STORE = Symbol('MESSAGE_IDEMPOTENCY_STORE');

export interface MessageIdempotencyStore {
  reserve(messageId: string): Promise<boolean>;
}
