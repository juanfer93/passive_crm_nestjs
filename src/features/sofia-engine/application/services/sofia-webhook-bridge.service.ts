import { Injectable } from '@nestjs/common';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaDecisionService } from '@/features/sofia-engine/application/services/sofia-decision.service';

@Injectable()
export class SofiaWebhookBridgeService {
  constructor(
    private readonly contexts: SofiaContextService,
    private readonly decisions: SofiaDecisionService,
    private readonly activity: SofiaActivityService,
  ) {}

  async handleIncomingLead(leadId: string): Promise<void> {
    const context = await this.contexts.buildSofiaContext(leadId);
    await this.activity.record({
      leadId: context.lead.id,
      dealerId: context.dealer.id,
      type: 'sofia_received_webhook_update',
      source: 'sofia_assisted',
      status: 'completed',
      summary: 'Sofia refreshed lead context after a Meta webhook message.',
      channel: context.lead.channel,
      provider: 'meta',
    });
    await this.decisions.generateRecommendation(context.lead.id, context.dealer.id);
  }
}
