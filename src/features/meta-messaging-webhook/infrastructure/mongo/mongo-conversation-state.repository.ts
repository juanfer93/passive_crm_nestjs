import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { ConversationState } from '@/features/meta-messaging-webhook/domain/entities/conversation-state.entity';
import { FollowUpState } from '@/features/meta-messaging-webhook/domain/entities/follow-up-state.entity';
import {
  hasCompletedLeadCustomFields,
  LeadCustomFields,
  LeadQualificationState,
} from '@/features/meta-messaging-webhook/domain/entities/lead-custom-fields.entity';
import { ConversationStateRepository } from '@/features/meta-messaging-webhook/domain/ports/conversation-state.repository';
import { Conversation, ConversationDocument } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';

@Injectable()
export class MongoConversationStateRepository implements ConversationStateRepository {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
  ) {}

  async appendMessage(message: ConversationMessage): Promise<void> {
    const now = new Date();
    const conversationKey = this.toConversationKey(
      message.channel,
      message.contactId,
      message.pageId,
    );

    await this.conversationModel
      .updateOne(
        { conversationKey },
        {
          $set: { updatedAt: now },
          $setOnInsert: {
            conversationKey,
            channel: message.channel,
            ...(message.pageId ? { pageId: message.pageId } : {}),
            contactId: message.contactId,
            leadCustomFields: {},
            qualificationStatus: 'active',
            followUp: this.inactiveFollowUp(),
            createdAt: now,
          },
          $push: { messages: message },
        },
        { upsert: true },
      )
      .exec();
  }

  async getState(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): Promise<ConversationState | null> {
    const conversation = await this.conversationModel
      .findOne({ conversationKey: this.toConversationKey(channel, contactId, pageId) })
      .lean()
      .exec();

    if (!conversation) {
      return null;
    }

    return {
      channel: conversation.channel,
      pageId: conversation.pageId,
      contactId: conversation.contactId,
      messages: conversation.messages ?? [],
      leadCustomFields: conversation.leadCustomFields ?? {},
      qualificationStatus: conversation.qualificationStatus ?? 'active',
      qualificationCompletedAt: conversation.qualificationCompletedAt,
      followUp: conversation.followUp ?? this.inactiveFollowUp(),
    };
  }

  async mergeLeadCustomFields(
    channel: MetaMessagingChannel,
    contactId: string,
    fields: LeadCustomFields,
    pageId?: string,
  ): Promise<LeadQualificationState> {
    const now = new Date();
    const conversationKey = this.toConversationKey(channel, contactId, pageId);
    const current = await this.getState(channel, contactId, pageId);
    const customFields = {
      ...(current?.leadCustomFields ?? {}),
      ...this.withoutEmptyValues(fields),
    };
    const isComplete = hasCompletedLeadCustomFields(customFields);
    const completedAt =
      current?.qualificationCompletedAt ?? (isComplete ? now : undefined);

    await this.conversationModel
      .updateOne(
        { conversationKey },
        {
          $set: {
            updatedAt: now,
            leadCustomFields: customFields,
            qualificationStatus: isComplete ? 'completed' : 'active',
            ...(completedAt ? { qualificationCompletedAt: completedAt } : {}),
          },
          $setOnInsert: {
            conversationKey,
            channel,
            ...(pageId ? { pageId } : {}),
            contactId,
            followUp: this.inactiveFollowUp(),
            createdAt: now,
          },
        },
        { upsert: true },
      )
      .exec();

    return {
      customFields,
      status: isComplete ? 'completed' : 'active',
      completedAt,
    };
  }

  async reactivateLeadQualification(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): Promise<void> {
    await this.conversationModel
      .updateOne(
        { conversationKey: this.toConversationKey(channel, contactId, pageId) },
        {
          $set: {
            updatedAt: new Date(),
            leadCustomFields: {},
            qualificationStatus: 'active',
          },
          $unset: {
            qualificationCompletedAt: '',
          },
        },
      )
      .exec();
  }

  async getRecentMessages(
    channel: MetaMessagingChannel,
    contactId: string,
    limit: number,
    pageId?: string,
  ): Promise<ConversationMessage[]> {
    const conversation = await this.conversationModel
      .findOne(
        { conversationKey: this.toConversationKey(channel, contactId, pageId) },
        { messages: { $slice: -limit } },
      )
      .lean()
      .exec();

    return conversation?.messages ?? [];
  }

  async scheduleFollowUp(
    channel: MetaMessagingChannel,
    contactId: string,
    followUp: FollowUpState,
    pageId?: string,
  ): Promise<void> {
    await this.conversationModel
      .updateOne(
        { conversationKey: this.toConversationKey(channel, contactId, pageId) },
        {
          $set: {
            updatedAt: new Date(),
            followUp,
          },
        },
      )
      .exec();
  }

  async cancelFollowUp(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): Promise<void> {
    await this.scheduleFollowUp(channel, contactId, this.inactiveFollowUp(), pageId);
  }

  async findDueFollowUps(now: Date, limit: number): Promise<ConversationState[]> {
    const conversations = await this.conversationModel
      .find({
        qualificationStatus: { $ne: 'completed' },
        'followUp.status': 'active',
        'followUp.attempts': { $lt: 3 },
        'followUp.nextFollowUpAt': { $lte: now },
      })
      .sort({ 'followUp.nextFollowUpAt': 1 })
      .limit(limit)
      .lean()
      .exec();

    return conversations.map((conversation) => ({
      channel: conversation.channel,
      pageId: conversation.pageId,
      contactId: conversation.contactId,
      messages: conversation.messages ?? [],
      leadCustomFields: conversation.leadCustomFields ?? {},
      qualificationStatus: conversation.qualificationStatus ?? 'active',
      qualificationCompletedAt: conversation.qualificationCompletedAt,
      followUp: conversation.followUp ?? this.inactiveFollowUp(),
    }));
  }

  async recordFollowUpAttempt(
    channel: MetaMessagingChannel,
    contactId: string,
    followUp: FollowUpState,
    pageId?: string,
  ): Promise<void> {
    await this.scheduleFollowUp(channel, contactId, followUp, pageId);
  }

  private toConversationKey(
    channel: MetaMessagingChannel,
    contactId: string,
    pageId?: string,
  ): string {
    return `${channel}:${pageId ?? 'local'}:${contactId}`;
  }

  private withoutEmptyValues(fields: LeadCustomFields): LeadCustomFields {
    return Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as LeadCustomFields;
  }

  private inactiveFollowUp(): FollowUpState {
    return { status: 'inactive', attempts: 0 };
  }
}
