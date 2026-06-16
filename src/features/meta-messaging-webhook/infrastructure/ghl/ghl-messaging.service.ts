import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import {
  GhlConversationPointer,
  GhlPulledConversationMessage,
  GhlWhatsAppSendInput,
  GhlWhatsAppSendResult,
} from '@/features/meta-messaging-webhook/domain/entities/ghl-whatsapp-event.entity';
import { ConversationMessageKind } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

type UnknownRecord = Record<string, unknown>;

@Injectable()
export class GhlMessagingService {
  private readonly logger = new Logger(GhlMessagingService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async sendWhatsAppMessage(input: GhlWhatsAppSendInput): Promise<GhlWhatsAppSendResult> {
    const locationId = this.resolveLocationId(input.locationId);

    if (!this.hasAuth) {
      throw new BadRequestException('GHL messaging is not configured.');
    }

    const body: Record<string, unknown> = {
      locationId,
      contactId: input.contactId,
      type: 'WhatsApp',
      message: input.message,
      metadata: {
        source: 'viva-sofia',
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        ...(input.metadata ?? {}),
      },
    };

    if (input.mediaUrl && this.sendMediaAttachments) {
      body.attachments = [{ type: 'image', url: input.mediaUrl }];
    }

    const response = await this.http.axiosRef.post<unknown>(
      `${this.baseUrl}/conversations/messages`,
      body,
      { headers: this.headers },
    );
    const responseBody = this.asRecord(response.data);
    const providerMessageId =
      this.stringValue(responseBody?.id) ??
      this.stringValue(responseBody?.messageId) ??
      this.stringValue(this.asRecord(responseBody?.message)?.id) ??
      `ghl:${randomUUID()}`;

    return { provider: 'ghl', providerMessageId };
  }

  async sendBonusCoupon(
    input: GhlWhatsAppSendInput & { couponImageUrl?: string | null },
  ): Promise<GhlWhatsAppSendResult> {
    const couponUrl = input.couponImageUrl ?? input.mediaUrl;
    const message = [input.message, couponUrl ? `Bono: ${couponUrl}` : undefined]
      .filter((value): value is string => Boolean(value))
      .join('\n');

    return this.sendWhatsAppMessage({
      ...input,
      message,
      mediaUrl: couponUrl,
      metadata: { ...(input.metadata ?? {}), kind: 'bonus_coupon' },
    });
  }

  async sendInventoryLink(input: GhlWhatsAppSendInput & { inventoryUrl: string }): Promise<GhlWhatsAppSendResult> {
    return this.sendWhatsAppMessage({
      ...input,
      message: `${input.message}\n${input.inventoryUrl}`,
      metadata: { ...(input.metadata ?? {}), kind: 'inventory_link' },
    });
  }

  async sendAppointmentConfirmation(input: GhlWhatsAppSendInput): Promise<GhlWhatsAppSendResult> {
    return this.sendWhatsAppMessage({
      ...input,
      metadata: { ...(input.metadata ?? {}), kind: 'appointment_confirmation' },
    });
  }

  async sendAppointmentReminder(input: GhlWhatsAppSendInput): Promise<GhlWhatsAppSendResult> {
    return this.sendWhatsAppMessage({
      ...input,
      metadata: { ...(input.metadata ?? {}), kind: 'appointment_reminder' },
    });
  }

  async pullRecentMessages(input: {
    locationId?: string | null;
    contactId?: string | null;
    conversationId?: string | null;
    limit?: number;
  }): Promise<GhlPulledConversationMessage[]> {
    if (!this.hasAuth || !input.conversationId) {
      return [];
    }

    try {
      const response = await this.http.axiosRef.get<unknown>(
        `${this.baseUrl}/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          headers: this.headers,
          params: {
            locationId: this.resolveLocationId(input.locationId),
            limit: input.limit ?? 20,
          },
        },
      );

      return this.messageRecords(response.data)
        .map((message) => this.normalizePulledMessage(message, input))
        .filter((message): message is GhlPulledConversationMessage => Boolean(message));
    } catch (error: unknown) {
      this.logger.warn({ event: 'ghl_pull_recent_messages_failed', conversationId: input.conversationId, error });
      return [];
    }
  }

  async searchActiveConversationsSince(input: {
    locationId?: string | null;
    since: Date;
    limit?: number;
  }): Promise<GhlConversationPointer[]> {
    if (!this.hasAuth) {
      return [];
    }

    try {
      const response = await this.http.axiosRef.get<unknown>(`${this.baseUrl}/conversations/search`, {
        headers: this.headers,
        params: {
          locationId: this.resolveLocationId(input.locationId),
          limit: input.limit ?? 100,
          lastMessageAfter: input.since.toISOString(),
        },
      });

      return this.conversationRecords(response.data)
        .map((conversation) => this.normalizeConversation(conversation, input.locationId))
        .filter((conversation): conversation is GhlConversationPointer => Boolean(conversation));
    } catch (error: unknown) {
      this.logger.warn({ event: 'ghl_active_conversation_search_failed', error });
      return [];
    }
  }

  private normalizePulledMessage(
    raw: UnknownRecord,
    input: { conversationId?: string | null; contactId?: string | null },
  ): GhlPulledConversationMessage | null {
    const messageId =
      this.stringValue(raw.id) ??
      this.stringValue(raw.messageId) ??
      this.stringValue(raw._id) ??
      this.syntheticMessageId(raw, input.conversationId, input.contactId);
    const direction = this.normalizeDirection(raw.direction ?? raw.messageDirection ?? raw.source);
    const text = this.stringValue(raw.message) ?? this.stringValue(raw.body) ?? this.stringValue(raw.text) ?? '';
    const type = this.stringValue(raw.type) ?? this.stringValue(raw.messageType) ?? this.stringValue(raw.contentType);
    const occurredAt = this.dateValue(raw.dateAdded ?? raw.createdAt ?? raw.timestamp ?? raw.time) ?? new Date();

    return {
      messageId,
      direction,
      kind: this.kindFromType(type, text, raw.attachments),
      text,
      occurredAt,
    };
  }

  private normalizeConversation(raw: UnknownRecord, fallbackLocationId?: string | null): GhlConversationPointer | null {
    const contactId = this.stringValue(raw.contactId) ?? this.stringValue(this.asRecord(raw.contact)?.id);
    const locationId =
      this.stringValue(raw.locationId) ?? fallbackLocationId ?? this.config.get<string>('GHL_LOCATION_ID');

    if (!contactId || !locationId) {
      return null;
    }

    return {
      contactId,
      locationId,
      conversationId: this.stringValue(raw.id) ?? this.stringValue(raw.conversationId),
      phone:
        this.stringValue(raw.phone) ??
        this.stringValue(this.asRecord(raw.contact)?.phone) ??
        this.stringValue(this.asRecord(raw.customer)?.phone),
    };
  }

  private normalizeDirection(value: unknown): 'inbound' | 'outbound' {
    const normalized = this.stringValue(value)?.toLowerCase() ?? '';

    if (normalized.includes('out')) return 'outbound';
    if (normalized.includes('sent')) return 'outbound';

    return 'inbound';
  }

  private kindFromType(type: string | undefined, text: string, attachments: unknown): ConversationMessageKind {
    const normalized = type?.toLowerCase() ?? '';

    if (normalized.includes('audio')) return 'audio';
    if (normalized.includes('image')) return 'image';
    if (Array.isArray(attachments) && attachments.length > 0) return 'unknown';
    if (text.trim()) return 'text';

    return 'unknown';
  }

  private syntheticMessageId(raw: UnknownRecord, conversationId?: string | null, contactId?: string | null): string {
    const time = this.stringValue(raw.dateAdded ?? raw.createdAt ?? raw.timestamp ?? raw.time) ?? 'unknown-time';
    const text = this.stringValue(raw.message ?? raw.body ?? raw.text) ?? 'empty';
    return `ghl:${conversationId ?? contactId ?? 'unknown'}:${time}:${text.slice(0, 32)}`;
  }

  private messageRecords(payload: unknown): UnknownRecord[] {
    const record = this.asRecord(payload);
    const data = this.asRecord(record?.data);
    const candidates = [record?.messages, record?.conversationMessages, data?.messages, data?.conversationMessages];

    return candidates.find((candidate): candidate is UnknownRecord[] => this.isRecordArray(candidate)) ?? [];
  }

  private conversationRecords(payload: unknown): UnknownRecord[] {
    const record = this.asRecord(payload);
    const data = this.asRecord(record?.data);
    const candidates = [record?.conversations, data?.conversations, record?.items, data?.items];

    return candidates.find((candidate): candidate is UnknownRecord[] => this.isRecordArray(candidate)) ?? [];
  }

  private isRecordArray(value: unknown): value is UnknownRecord[] {
    return Array.isArray(value) && value.every((item) => this.asRecord(item));
  }

  private dateValue(value: unknown): Date | null {
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value > 1_000_000_000_000 ? value : value * 1000);
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private asRecord(value: unknown): UnknownRecord | null {
    return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
  }

  private resolveLocationId(value?: string | null): string {
    const raw = value?.replace(/^ghl:/, '') || this.config.get<string>('GHL_LOCATION_ID');

    if (!raw) {
      throw new BadRequestException('GHL locationId is required.');
    }

    return raw;
  }

  private get hasAuth(): boolean {
    return Boolean(this.config.get<string>('GHL_ACCESS_TOKEN'));
  }

  private get baseUrl(): string {
    return this.config.get<string>('GHL_API_BASE_URL', 'https://services.leadconnectorhq.com');
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('GHL_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
      Version: this.config.get<string>('GHL_API_VERSION', '2021-07-28'),
    };
  }

  private get sendMediaAttachments(): boolean {
    return this.config.get<string>('GHL_SEND_MEDIA_ATTACHMENTS', 'false').toLowerCase() === 'true';
  }
}
