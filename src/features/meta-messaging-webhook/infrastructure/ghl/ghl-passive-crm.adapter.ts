import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import {
  CrmLeadSyncContext,
  CrmSinkPort,
} from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';

@Injectable()
export class GhlPassiveCrmAdapter implements CrmSinkPort {
  private readonly logger = new Logger(GhlPassiveCrmAdapter.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  async recordConversationMessage(message: ConversationMessage, contactPhone: string): Promise<void> {
    await this.safeJsonWrite('record conversation message', async () => {
      const contactId = await this.resolveContactId(contactPhone);

      await this.http.axiosRef.post(
        `${this.baseUrl}/conversations/messages`,
        {
          locationId: this.locationId,
          contactId,
          type: this.conversationType(message.channel),
          direction: message.direction,
          message: message.text,
          occurredAt: message.occurredAt.toISOString(),
          metadata: {
            source: 'nestjs-passive-crm',
            messageId: message.id,
            channel: message.channel,
            pageId: message.pageId,
            contactId: message.contactId,
            kind: message.kind,
          },
        },
        { headers: this.headers },
      );
    });
  }

  async updateCustomFields(
    contactPhone: string,
    fields: LeadCustomFields,
    context?: CrmLeadSyncContext,
  ): Promise<void> {
    void context;
    await this.safeJsonWrite('update custom fields', async () => {
      const contactId = await this.resolveContactId(contactPhone);
      const customFields = Object.entries(fields)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => ({ key, value }));

      if (!customFields.length) {
        return;
      }

      await this.http.axiosRef.put(
        `${this.baseUrl}/contacts/${contactId}`,
        {
          customFields,
        },
        { headers: this.headers },
      );
    });
  }

  async replaceStatusTags(contactPhone: string, tags: string[]): Promise<void> {
    await this.safeJsonWrite('replace status tags', async () => {
      const contactId = await this.resolveContactId(contactPhone);

      await this.http.axiosRef.put(
        `${this.baseUrl}/contacts/${contactId}/tags`,
        { tags },
        { headers: this.headers },
      );
    });
  }

  private async resolveContactId(contactPhone: string): Promise<string> {
    const response = await this.http.axiosRef.get<{ contacts?: { id: string }[] }>(
      `${this.baseUrl}/contacts/`,
      {
        headers: this.headers,
        params: {
          locationId: this.locationId,
          query: contactPhone,
        },
      },
    );

    const contactId = response.data.contacts?.[0]?.id;

    if (!contactId) {
      throw new Error(`GHL destination contact not found for phone ${contactPhone}`);
    }

    return contactId;
  }

  private async safeJsonWrite(operation: string, write: () => Promise<void>): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    try {
      await write();
    } catch (error: unknown) {
      this.logger.error(`GHL destination JSON write failed: ${operation}`, error);
    }
  }

  private conversationType(channel: MetaMessagingChannel): string {
    if (channel === 'instagram') return 'Instagram';
    if (channel === 'whatsapp') return 'WhatsApp';
    return 'Messenger';
  }

  private get isEnabled(): boolean {
    return this.config.get<string>('GHL_SYNC_ENABLED') === 'true';
  }

  private get baseUrl(): string {
    return this.config.get<string>('GHL_API_BASE_URL', 'https://services.leadconnectorhq.com');
  }

  private get locationId(): string {
    return this.config.getOrThrow<string>('GHL_LOCATION_ID');
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('GHL_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
      Version: this.config.get<string>('GHL_API_VERSION', '2021-07-28'),
    };
  }
}
