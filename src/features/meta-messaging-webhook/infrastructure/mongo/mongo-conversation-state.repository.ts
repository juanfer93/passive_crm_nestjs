import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
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
            createdAt: now,
          },
          $push: { messages: message },
        },
        { upsert: true },
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
}
