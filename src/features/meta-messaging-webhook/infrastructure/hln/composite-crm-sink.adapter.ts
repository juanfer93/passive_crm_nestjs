import { Injectable, Logger } from '@nestjs/common';
import { ConversationMessage } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { CrmSinkPort } from '@/features/meta-messaging-webhook/domain/ports/crm-sink.port';
import { GhlPassiveCrmAdapter } from '@/features/meta-messaging-webhook/infrastructure/ghl/ghl-passive-crm.adapter';
import { HlnCrmSinkAdapter } from '@/features/meta-messaging-webhook/infrastructure/hln/hln-crm-sink.adapter';

@Injectable()
export class CompositeCrmSinkAdapter implements CrmSinkPort {
  private readonly logger = new Logger(CompositeCrmSinkAdapter.name);
  constructor(
    private readonly ghl: GhlPassiveCrmAdapter,
    private readonly hln: HlnCrmSinkAdapter,
  ) { }
  async updateCustomFields(contactPhone: string, fields: LeadCustomFields): Promise<void> {
    const [ghlResult, hlnResult] = await Promise.allSettled([
      this.ghl.updateCustomFields(contactPhone, fields),
      this.hln.updateCustomFields(contactPhone, fields),
    ]);
    if (ghlResult.status === 'rejected') this.logger.error('GHL updateCustomFields failed', ghlResult.reason);
    if (hlnResult.status === 'rejected') this.logger.error('HLN updateCustomFields failed', hlnResult.reason);
  }
  async recordConversationMessage(message: ConversationMessage, contactPhone: string): Promise<void> {
    const [ghlResult] = await Promise.allSettled([
      this.ghl.recordConversationMessage(message, contactPhone),
      this.hln.recordConversationMessage(message, contactPhone),
    ]);
    if (ghlResult.status === 'rejected') this.logger.error('GHL recordConversationMessage failed', ghlResult.reason);
  }
  async replaceStatusTags(contactPhone: string, tags: string[]): Promise<void> {
    const [ghlResult] = await Promise.allSettled([
      this.ghl.replaceStatusTags(contactPhone, tags),
      this.hln.replaceStatusTags(contactPhone, tags),
    ]);
    if (ghlResult.status === 'rejected') this.logger.error('GHL replaceStatusTags failed', ghlResult.reason);
  }
}