import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';
import { SofiaContextService } from '@/features/sofia-engine/application/services/sofia-context.service';
import { SofiaDecisionService } from '@/features/sofia-engine/application/services/sofia-decision.service';
import { SofiaPromptService } from '@/features/sofia-engine/application/services/sofia-prompt.service';
import { SofiaContext } from '@/features/sofia-engine/domain/sofia.types';
import { SofiaRecommendationDocument } from '@/features/sofia-engine/infrastructure/mongo/schemas/sofia-recommendation.schema';
import { Model } from 'mongoose';

describe('SofiaDecisionService', () => {
  it('recommends requesting documents from real incomplete qualification data', async () => {
    const contexts = {
      buildSofiaContext: jest.fn().mockResolvedValue(context),
    } as unknown as SofiaContextService;
    const activity = { record: jest.fn() } as unknown as SofiaActivityService;
    const model = { create: jest.fn() } as unknown as Model<SofiaRecommendationDocument>;
    const service = new SofiaDecisionService(
      contexts,
      new SofiaPromptService(),
      activity,
      model,
    );

    const recommendation = await service.generateRecommendation(
      context.lead.id,
      context.dealer.id,
    );

    expect(recommendation.recommendedAction).toBe('request_documents');
    expect(recommendation.priority).toBe('high');
    expect(recommendation.prompt).toContain('Action goal: request_documents');
    expect(model.create).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: context.lead.id,
        dealerId: context.dealer.id,
        recommendedAction: 'request_documents',
      }),
    );
    expect(activity.record).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sofia_recommended_action' }),
    );
  });
});

const context: SofiaContext = {
  lead: {
    id: 'messenger:page-1:lead-1',
    contactId: 'lead-1',
    channel: 'messenger',
    pageId: 'page-1',
    phone: '3055555555',
    status: 'active',
  },
  dealer: {
    id: 'offlease-fredericksburg',
    name: 'Off Lease Fredericksburg',
    city: 'Fredericksburg',
    state: 'Virginia',
  },
  buyerDNA: {
    vehicle_interest: 'Toyota Tacoma',
    purchase_timeline: 'esta semana',
    lead_temperature: 'hot',
    document_status: undefined,
  },
  qualification: { status: 'active', missingFields: ['document_status'] },
  conversationSummary: 'Lead wants a Toyota Tacoma this week.',
  lastMessages: [],
  activities: [],
  appointment: { status: 'unknown' },
  documents: { status: 'unknown', complete: false },
  lastContact: new Date(),
  rules: ['Ask one question at a time.'],
  riskFactors: [],
  opportunities: ['High purchase intent.'],
};
