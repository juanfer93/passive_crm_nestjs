import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MessageIdempotencyStore } from '@/features/meta-messaging-webhook/domain/ports/message-idempotency-store.port';
import {
  MessageReceipt,
  MessageReceiptDocument,
} from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/message-receipt.schema';

@Injectable()
export class MongoMessageIdempotencyStore implements MessageIdempotencyStore {
  constructor(
    @InjectModel(MessageReceipt.name)
    private readonly receiptModel: Model<MessageReceiptDocument>,
  ) {}

  async reserve(messageId: string): Promise<boolean> {
    try {
      const result = await this.receiptModel
        .updateOne(
          { messageId },
          { $setOnInsert: { messageId, reservedAt: new Date() } },
          { upsert: true },
        )
        .exec();

      return result.upsertedCount === 1;
    } catch (error: unknown) {
      if (this.isDuplicateKeyError(error)) {
        return false;
      }

      throw error;
    }
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}
