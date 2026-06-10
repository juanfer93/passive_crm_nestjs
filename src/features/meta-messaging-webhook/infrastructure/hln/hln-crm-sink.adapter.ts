import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import {
  hasCompletedLeadCustomFields,
  LeadCustomFields,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { CrmSinkPort } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';

@Injectable()
export class HlnCrmSinkAdapter implements CrmSinkPort {
  private readonly logger = new Logger(HlnCrmSinkAdapter.name);
  constructor(private readonly config: ConfigService) {}

  async updateCustomFields(contactPhone: string, fields: LeadCustomFields): Promise<void> {
    if (!this.isEnabled) return;
    if (!hasCompletedLeadCustomFields(fields)) return; 
    const webhookUrl = this.config.getOrThrow<string>('HLN_WEBHOOK_URL');
    const dealerId   = this.config.getOrThrow<string>('HLN_DEALER_ID');
    const payload = {
      source:   'nestjs_ai_agent',
      dealerId: Number(dealerId),
      customer: {
        phone:    fields.phone,
        email:    fields.email    ?? undefined,
        language: fields.language ?? undefined,
      },
      qualification: {
        vehicle_interest:  fields.vehicle_interest  ?? undefined,
        vehicle_type:      fields.vehicle_type      ?? undefined,
        down_payment:      fields.down_payment      ?? undefined,
        document_status:   fields.document_status   ?? undefined,
        purchase_timeline: fields.purchase_timeline ?? undefined,
        credit_profile:    fields.credit_profile    ?? undefined,
        lead_temperature:  fields.lead_temperature  ?? undefined,
      },
      timestamps: {
        qualified_at:    new Date().toISOString(),
        last_message_at: new Date().toISOString(),
      },
    };
    try {
      const res = await fetch(webhookUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
        signal:  AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        this.logger.warn(`HLN webhook respondió ${res.status} para ${contactPhone}`);
      } else {
        this.logger.log(`HLN webhook enviado — ${contactPhone}, dealer ${dealerId}`);
      }
    } catch (err: unknown) {
      this.logger.error(`HLN webhook falló para ${contactPhone}`, err);
    }
  }

  async recordConversationMessage(_msg: ConversationMessage, _phone: string): Promise<void> {}
  async replaceStatusTags(_phone: string, _tags: string[]): Promise<void> {}

  private get isEnabled(): boolean {
    return this.config.get<string>('HLN_SYNC_ENABLED') === 'true';
  }
}