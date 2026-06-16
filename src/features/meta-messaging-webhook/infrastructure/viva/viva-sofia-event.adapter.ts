import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VivaSofiaEventPayload } from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';
import { VivaSofiaEventPublisherPort } from '@/features/meta-messaging-webhook/domain/ports/viva-sofia-event-publisher.port';

@Injectable()
export class VivaSofiaEventAdapter implements VivaSofiaEventPublisherPort {
  private readonly logger = new Logger(VivaSofiaEventAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async publish(payload: VivaSofiaEventPayload): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn({
        event: 'viva_sofia_event_skipped',
        reason: 'VIVA_SYNC_ENABLED is false',
        type: payload.event,
        leadId: payload.leadId,
      });
      return;
    }

    const endpointUrl = this.endpointUrl;

    if (!endpointUrl) {
      this.logger.warn({
        event: 'viva_sofia_event_skipped',
        reason: 'VIVA_SOFIA_EVENT_URL or VIVA_API_BASE_URL is missing',
        type: payload.event,
        leadId: payload.leadId,
      });
      return;
    }

    try {
      const response = await fetch(endpointUrl, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger.warn({
          event: 'viva_sofia_event_rejected',
          status: response.status,
          type: payload.event,
          leadId: payload.leadId,
        });
        return;
      }

      this.logger.log({
        event: 'viva_sofia_event_sent',
        status: response.status,
        type: payload.event,
        leadId: payload.leadId,
      });
    } catch (error: unknown) {
      this.logger.error(
        {
          event: 'viva_sofia_event_failed',
          type: payload.event,
          leadId: payload.leadId,
        },
        error,
      );
    }
  }

  private get isEnabled(): boolean {
    return this.config.get<string>('VIVA_SYNC_ENABLED', 'true') !== 'false';
  }

  private get endpointUrl(): string | null {
    const explicitUrl = this.config.get<string>('VIVA_SOFIA_EVENT_URL');

    if (explicitUrl) {
      return explicitUrl;
    }

    const baseUrl = this.config.get<string>('VIVA_API_BASE_URL');

    if (!baseUrl) {
      return null;
    }

    return `${baseUrl.replace(/\/+$/, '')}/api/sofia/event`;
  }

  private get headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const internalApiKey =
      this.config.get<string>('VIVA_INTERNAL_API_KEY') ?? this.config.get<string>('VIVA_API_KEY');

    if (internalApiKey) {
      headers['x-internal-api-key'] = internalApiKey;
    }

    return headers;
  }

  private get timeoutMs(): number {
    return this.config.get<number>('VIVA_WEBHOOK_TIMEOUT_MS', 10_000);
  }
}
