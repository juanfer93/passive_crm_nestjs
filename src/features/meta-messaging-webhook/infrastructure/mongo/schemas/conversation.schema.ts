import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import {
  ConversationMessage,
  MetaMessagingChannel,
} from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

export type ConversationDocument = HydratedDocument<Conversation>;

@Schema({ _id: false })
export class StoredConversationMessage implements ConversationMessage {
  @Prop({ required: true })
  id: string;

  @Prop({ required: true, enum: ['messenger', 'instagram'] })
  channel: MetaMessagingChannel;

  @Prop({ required: true })
  contactId: string;

  @Prop({ required: true, enum: ['inbound', 'outbound'] })
  direction: 'inbound' | 'outbound';

  @Prop({ required: true, enum: ['text', 'audio', 'image', 'unknown'] })
  kind: 'text' | 'audio' | 'image' | 'unknown';

  @Prop({ required: true })
  text: string;

  @Prop({ required: true })
  occurredAt: Date;
}

export const StoredConversationMessageSchema = SchemaFactory.createForClass(
  StoredConversationMessage,
);

@Schema({ collection: 'conversations', versionKey: false })
export class Conversation {
  @Prop({ required: true, unique: true, index: true })
  conversationKey: string;

  @Prop({ required: true, enum: ['messenger', 'instagram'] })
  channel: MetaMessagingChannel;

  @Prop({ required: true })
  contactId: string;

  @Prop({ type: [StoredConversationMessageSchema], default: [] })
  messages: StoredConversationMessage[];

  @Prop({ required: true })
  createdAt: Date;

  @Prop({ required: true })
  updatedAt: Date;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
