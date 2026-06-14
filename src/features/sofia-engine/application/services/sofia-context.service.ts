import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { LeadCustomFields } from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import {
  Conversation,
  ConversationDocument,
} from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';
import { SofiaContext } from '@/features/sofia-engine/domain/sofia.types';
import { SofiaActivityService } from '@/features/sofia-engine/application/services/sofia-activity.service';

const requiredQualificationFields = [
  'purchase_timeline',
  'lead_temperature',
  'vehicle_interest',
  'vehicle_type',
  'down_payment',
  'document_status',
  'language',
  'phone',
] as const;

@Injectable()
export class SofiaContextService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly dealerProfiles: DealerProfileResolver,
    private readonly activity: SofiaActivityService,
  ) {}

  async buildSofiaContext(leadId: string, expectedDealerId?: string): Promise<SofiaContext> {
    const conversation = await this.findConversation(leadId);
    const dealer = this.dealerProfiles.resolve({ pageId: conversation.pageId });

    if (expectedDealerId && expectedDealerId !== dealer.key) {
      throw new NotFoundException(`Lead ${leadId} was not found for dealer ${expectedDealerId}.`);
    }

    const canonicalLeadId = conversation.conversationKey;
    const messages = conversation.messages ?? [];
    const fields = conversation.leadCustomFields ?? {};
    const missingFields = requiredQualificationFields.filter((field) => !fields[field]);
    const inbound = [...messages].reverse().find((message) => message.direction === 'inbound');
    const inboundText = inbound?.text.toLowerCase() ?? '';
    const optedOut = /(^|\s)(stop|unsubscribe|cancelar|no me escriban)(\s|$)/i.test(inboundText);
    const wrongNumber = /wrong number|numero equivocado|n[uú]mero equivocado/i.test(inboundText);
    const activities = await this.activity.findByLead(canonicalLeadId, 20);
    const appointmentText = messages
      .map((message) => message.text)
      .find((text) => /appointment|cita|visita/i.test(text));
    const appointmentConfirmed = messages.some((message) =>
      /confirm(?:ed|o|ada)|cita confirmada/i.test(message.text),
    );

    return {
      lead: {
        id: canonicalLeadId,
        contactId: conversation.contactId,
        channel: conversation.channel,
        pageId: conversation.pageId,
        name: conversation.customerProfile?.fullName,
        phone: fields.phone,
        email: fields.email,
        status: conversation.qualificationStatus ?? 'active',
      },
      dealer: {
        id: dealer.key,
        name: dealer.displayName,
        city: dealer.locationCity,
        state: dealer.locationState,
      },
      buyerDNA: fields,
      qualification: {
        status: conversation.qualificationStatus ?? 'active',
        completedAt: conversation.qualificationCompletedAt,
        missingFields,
      },
      conversationSummary: this.summarize(messages.map((message) => message.text), fields),
      lastMessages: messages.slice(-12).map((message) => ({
        id: message.id,
        direction: message.direction,
        kind: message.kind,
        text: message.text,
        occurredAt: message.occurredAt,
      })),
      activities,
      appointment: {
        status: appointmentConfirmed ? 'confirmed' : appointmentText ? 'requested' : 'unknown',
        ...(appointmentText ? { details: appointmentText } : {}),
      },
      documents: {
        status: fields.document_status ?? 'unknown',
        complete: fields.document_status === 'confirmed',
      },
      lastContact: inbound?.occurredAt,
      rules: [
        'Do not promise approval or guarantee financing.',
        'Do not quote exact payments unless the dealer supplied them.',
        'Ask one question at a time.',
        'Focus on appointment, documents, or follow-up.',
      ],
      riskFactors: [
        ...(optedOut ? ['Lead opted out of messages.'] : []),
        ...(wrongNumber ? ['Lead reported a wrong number.'] : []),
        ...(fields.lead_temperature === 'cold' ? ['Lead intent is currently cold.'] : []),
        ...(missingFields.length >= 5 ? ['Lead qualification is incomplete.'] : []),
      ],
      opportunities: [
        ...(fields.lead_temperature === 'hot' ? ['High purchase intent.'] : []),
        ...(fields.vehicle_interest ? [`Vehicle interest: ${fields.vehicle_interest}.`] : []),
        ...(fields.phone ? ['Direct phone contact is available.'] : []),
        ...(fields.document_status === 'confirmed' ? ['Required documents are available.'] : []),
      ],
    };
  }

  private async findConversation(leadId: string): Promise<ConversationDocument> {
    const decodedLeadId = decodeURIComponent(leadId);
    const conversation = await this.conversationModel
      .findOne({ $or: [{ conversationKey: decodedLeadId }, { contactId: decodedLeadId }] })
      .sort({ updatedAt: -1 })
      .exec();

    if (!conversation) {
      throw new NotFoundException(`Lead ${decodedLeadId} was not found.`);
    }

    return conversation;
  }

  private summarize(messages: string[], fields: LeadCustomFields): string {
    const facts = [
      fields.vehicle_interest ? `Interested in ${fields.vehicle_interest}` : undefined,
      fields.purchase_timeline ? `timeline ${fields.purchase_timeline}` : undefined,
      fields.down_payment ? `down payment ${fields.down_payment}` : undefined,
      fields.document_status ? `documents ${fields.document_status}` : undefined,
    ].filter(Boolean);
    const latest = messages.at(-1)?.trim();

    return [facts.join(', '), latest ? `Latest message: ${latest}` : undefined]
      .filter(Boolean)
      .join('. ') || 'No conversation details are available yet.';
  }
}
