import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaPromptService } from '@/features/sofia-engine/application/services/sofia-prompt.service';
import {
  SofiaRecommendation,
  SofiaRecommendedAction,
} from '@/features/sofia-engine/domain/sofia.types';
import {
  SofiaRecommendationDocument,
  SofiaRecommendationRecord,
} from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-recommendation.schema';

@Injectable()
export class SofiaDecisionService {
  constructor(
    private readonly contexts: SofiaContextService,
    private readonly prompts: SofiaPromptService,
    private readonly activity: SofiaActivityService,
    @InjectModel(SofiaRecommendationRecord.name)
    private readonly recommendationModel: Model<SofiaRecommendationDocument>,
  ) {}

  async generateRecommendation(
    leadId: string,
    expectedDealerId?: string,
  ): Promise<SofiaRecommendation> {
    const context = await this.contexts.buildSofiaContext(leadId, expectedDealerId);
    const recommendation = this.decide(context);
    const prompt = this.prompts.buildPrompt({
      actionType: recommendation.recommendedAction,
      leadId: context.lead.id,
      context,
    });
    const result = { ...recommendation, prompt };
    const now = new Date();

    await this.recommendationModel.create({
      id: randomUUID(),
      leadId: context.lead.id,
      dealerId: context.dealer.id,
      recommendedAction: result.recommendedAction,
      priority: result.priority,
      reasoningJson: {
        reason: result.reason,
        riskLevel: result.riskLevel,
        suggestedChannel: result.suggestedChannel,
      },
      confidence: result.confidence,
      potentialRevenue: result.potentialRevenue ?? undefined,
      nextBestActionsJson: result.nextBestActions,
      status: 'active',
      createdAt: now,
    });
    await this.activity.record({
      leadId: context.lead.id,
      dealerId: context.dealer.id,
      type: 'sofia_recommended_action',
      source: 'sofia_assisted',
      status: 'completed',
      summary: `Sofia recommended ${result.recommendedAction}.`,
      reason: result.reason,
      confidence: result.confidence,
      channel: result.suggestedChannel,
    });

    return result;
  }

  private decide(context: Awaited<ReturnType<SofiaContextService['buildSofiaContext']>>): Omit<SofiaRecommendation, 'prompt'> {
    const hasRisk = context.riskFactors.some((risk) =>
      /opted out|wrong number/i.test(risk),
    );

    if (hasRisk) {
      return this.result(
        'notify_manager',
        'urgent',
        context.riskFactors.join(' '),
        0.98,
        ['create_bdc_task'],
        'high',
        'internal',
      );
    }

    if (context.appointment.status === 'requested') {
      return this.result(
        'confirm_appointment',
        'high',
        'The lead discussed an appointment that is not confirmed yet.',
        0.9,
        ['send_whatsapp', 'create_bdc_task'],
        'medium',
        this.messageChannel(context),
      );
    }

    if (!context.documents.complete && context.qualification.missingFields.includes('document_status')) {
      return this.result(
        'request_documents',
        context.buyerDNA.lead_temperature === 'hot' ? 'high' : 'medium',
        'Document readiness is still unknown or incomplete.',
        0.86,
        ['send_whatsapp', 'create_bdc_task'],
        'medium',
        this.messageChannel(context),
      );
    }

    if (context.buyerDNA.lead_temperature === 'hot' && context.lead.phone) {
      return this.result(
        'sofia_call',
        'high',
        'The lead has high purchase intent and a callable phone number.',
        0.88,
        ['send_sms', 'confirm_appointment'],
        'low',
        'phone',
      );
    }

    const stale = context.lastContact
      ? Date.now() - new Date(context.lastContact).getTime() > 24 * 60 * 60 * 1000
      : false;

    if (stale || context.buyerDNA.lead_temperature === 'cold') {
      return this.result(
        'reengage_lead',
        'medium',
        stale ? 'The lead has not contacted the dealer in over 24 hours.' : 'The lead intent is cold.',
        0.8,
        ['send_whatsapp', 'create_bdc_task'],
        'medium',
        this.messageChannel(context),
      );
    }

    return this.result(
      'send_whatsapp',
      'medium',
      'Continue qualification with the next missing field, one question at a time.',
      0.78,
      ['create_bdc_task', 'request_documents'],
      'low',
      this.messageChannel(context),
    );
  }

  private result(
    recommendedAction: SofiaRecommendedAction,
    priority: SofiaRecommendation['priority'],
    reason: string,
    confidence: number,
    nextBestActions: SofiaRecommendedAction[],
    riskLevel: SofiaRecommendation['riskLevel'],
    suggestedChannel: SofiaRecommendation['suggestedChannel'],
  ): Omit<SofiaRecommendation, 'prompt'> {
    return {
      recommendedAction,
      priority,
      reason,
      confidence,
      potentialRevenue: null,
      nextBestActions,
      riskLevel,
      suggestedChannel,
    };
  }

  private messageChannel(
    context: Awaited<ReturnType<SofiaContextService['buildSofiaContext']>>,
  ): SofiaRecommendation['suggestedChannel'] {
    return context.lead.channel === 'instagram' ? 'instagram' : 'messenger';
  }
}
