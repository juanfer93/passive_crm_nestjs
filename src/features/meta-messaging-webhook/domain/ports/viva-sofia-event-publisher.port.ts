import { VivaSofiaEventPayload } from '@/features/meta-messaging-webhook/domain/entities/viva-sofia-event.entity';

export const VIVA_SOFIA_EVENT_PUBLISHER = Symbol('VIVA_SOFIA_EVENT_PUBLISHER');

export interface VivaSofiaEventPublisherPort {
  publish(payload: VivaSofiaEventPayload): Promise<void>;
}
