import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MessageReceiptDocument = HydratedDocument<MessageReceipt>;

@Schema({ collection: 'message_receipts', versionKey: false })
export class MessageReceipt {
  @Prop({ required: true, unique: true, index: true })
  messageId: string;

  @Prop({ required: true })
  reservedAt: Date;
}

export const MessageReceiptSchema = SchemaFactory.createForClass(MessageReceipt);
