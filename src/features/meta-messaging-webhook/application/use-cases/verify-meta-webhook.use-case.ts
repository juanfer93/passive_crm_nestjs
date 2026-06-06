import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface MetaWebhookVerificationQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

@Injectable()
export class VerifyMetaWebhookUseCase {
  constructor(private readonly config: ConfigService) {}

  execute(query: MetaWebhookVerificationQuery): string | null {
    const expectedToken = this.config.getOrThrow<string>('META_VERIFY_TOKEN');

    if (query['hub.mode'] !== 'subscribe') {
      return null;
    }

    if (query['hub.verify_token'] !== expectedToken) {
      return null;
    }

    return query['hub.challenge'] ?? null;
  }
}
