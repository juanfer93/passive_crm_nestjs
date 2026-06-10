import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import {
  hasCompletedLeadCustomFields,
  LeadCustomFields,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import {
  CrmLeadSyncContext,
  CrmSinkPort,
} from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';

@Injectable()
export class HlnCrmSinkAdapter implements CrmSinkPort {
  private readonly logger = new Logger(HlnCrmSinkAdapter.name);

  constructor(private readonly config: ConfigService) {}

  async updateCustomFields(
    contactPhone: string,
    fields: LeadCustomFields,
    context?: CrmLeadSyncContext,
  ): Promise<void> {
    if (!this.isEnabled) {
      return;
    }

    if (!hasCompletedLeadCustomFields(fields)) {
      return;
    }

    const webhookUrl = this.config.getOrThrow<string>('HLN_WEBHOOK_URL');
    const dealerId = this.config.getOrThrow<string>('HLN_DEALER_ID');
    const customerProfile = context?.customerProfile;
    const lastInbound = context?.messages
      .slice()
      .reverse()
      .find((message) => message.direction === 'inbound');

    const payload = {
      source: 'nestjs_ai_agent',
      dealerId: Number(dealerId),
      ghlContactId: null,
      metaUserId: context?.contactId ?? null,
      conversationId: context?.conversationKey ?? null,
      customer: {
        firstName: customerProfile?.firstName ?? null,
        lastName: customerProfile?.lastName ?? null,
        fullName: customerProfile?.fullName ?? null,
        phone: fields.phone ?? contactPhone,
        email: fields.email ?? null,
        language: fields.language ?? null,
      },
      qualification: {
        vehicle_interest: fields.vehicle_interest ?? null,
        vehicle_type: fields.vehicle_type ?? null,
        down_payment: fields.down_payment ?? null,
        document_status: fields.document_status ?? null,
        purchase_timeline: fields.purchase_timeline ?? null,
        credit_profile: fields.credit_profile ?? null,
        contact_preference: context?.channel ?? 'messenger',
        lead_temperature: fields.lead_temperature ?? null,
      },
      conversation: {
        summary: this.summary(fields),
        last_message: lastInbound?.text ?? null,
        intent: 'purchase',
        buying_intent_score: this.buyingIntentScore(fields),
      },
      timestamps: {
        qualified_at: context?.qualificationCompletedAt?.toISOString() ?? new Date().toISOString(),
        last_message_at: lastInbound?.occurredAt.toISOString() ?? new Date().toISOString(),
      },
    };

    try {
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        this.logger.warn(`HLN webhook responded ${res.status} for ${this.mask(contactPhone)}`);
      } else {
        this.logger.log(`HLN webhook sent for ${this.mask(contactPhone)}, dealer ${dealerId}`);
      }
    } catch (err: unknown) {
      this.logger.error(`HLN webhook failed for ${this.mask(contactPhone)}`, err);
    }
  }

  async recordConversationMessage(message: ConversationMessage, phone: string): Promise<void> {
    void message;
    void phone;
  }

  async replaceStatusTags(phone: string, tags: string[]): Promise<void> {
    void phone;
    void tags;
  }

  private get isEnabled(): boolean {
    return this.config.get<string>('HLN_SYNC_ENABLED') === 'true';
  }

  private summary(fields: LeadCustomFields): string {
    return [
      `Cliente busca ${fields.vehicle_interest ?? fields.vehicle_type ?? 'un vehiculo'}`,
      fields.purchase_timeline ? `quiere comprar ${fields.purchase_timeline}` : undefined,
      fields.down_payment ? `tiene ${fields.down_payment} de enganche` : undefined,
      fields.document_status ? `documentos: ${fields.document_status}` : undefined,
    ]
      .filter(Boolean)
      .join(', ');
  }

  private buyingIntentScore(fields: LeadCustomFields): number {
    let score = 0;

    if (fields.lead_temperature === 'hot') score += 30;
    if (fields.vehicle_interest) score += 20;
    if (fields.down_payment) score += 20;
    if (fields.document_status) score += 15;
    if (fields.phone) score += 15;

    return Math.min(score, 100);
  }

  private mask(value: string): string {
    return value.length <= 4 ? '****' : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }
}
