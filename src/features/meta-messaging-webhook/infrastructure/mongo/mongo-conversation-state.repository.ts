import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { ConversationState } from '@/features/meta-messaging-webhook/domain/entities/conversation-state.entity';
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
    const conversationKey = this.toConversationKey(message.channel, message.contactId);

    await this.conversationModel
      .updateOne(
        { conversationKey },
        {
          $set: { updatedAt: now },
          $setOnInsert: {
            conversationKey,
            channel: message.channel,
            contactId: message.contactId,
            leadCustomFields: {},
            qualificationStatus: 'active',
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
  ): Promise<ConversationState | null> {
    const conversation = await this.conversationModel
      .findOne({ conversationKey: this.toConversationKey(channel, contactId) })
      .lean()
      .exec();

    if (!conversation) {
      return null;
    }

    return {
      channel: conversation.channel,
      contactId: conversation.contactId,
      messages: conversation.messages ?? [],
      leadCustomFields: conversation.leadCustomFields ?? {},
      qualificationStatus: conversation.qualificationStatus ?? 'active',
      qualificationCompletedAt: conversation.qualificationCompletedAt,
    };
  }

  async mergeLeadCustomFields(
    channel: MetaMessagingChannel,
    contactId: string,
    fields: LeadCustomFields,
  ): Promise<LeadQualificationState> {
    const now = new Date();
    const conversationKey = this.toConversationKey(channel, contactId);
    const current = await this.getState(channel, contactId);
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
            contactId,
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
  ): Promise<void> {
    await this.conversationModel
      .updateOne(
        { conversationKey: this.toConversationKey(channel, contactId) },
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
  ): Promise<ConversationMessage[]> {
    const conversation = await this.conversationModel
      .findOne(
        { conversationKey: this.toConversationKey(channel, contactId) },
        { messages: { $slice: -limit } },
      )
      .lean()
      .exec();

    return conversation?.messages ?? [];
  }

  private toConversationKey(channel: MetaMessagingChannel, contactId: string): string {
    return `${channel}:${contactId}`;
  }

  private withoutEmptyValues(fields: LeadCustomFields): LeadCustomFields {
    return Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== ''),
    ) as LeadCustomFields;
  }
}
