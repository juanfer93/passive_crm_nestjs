import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappWebClientService } from './application/services/whatsapp-web-client.service';
import { WhatsappWebController } from './presentation/controllers/whatsapp-web.controller';
import { Conversation, ConversationSchema } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/conversation.schema';
import { MessageReceipt, MessageReceiptSchema } from '@/features/meta-messaging-webhook/infrastructure/mongo/schemas/message-receipt.schema';

@Module({
  imports: [
    HttpModule.register({ timeout: 8000, maxRedirects: 3 }),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: MessageReceipt.name, schema: MessageReceiptSchema },
    ]),
  ],
  controllers: [WhatsappWebController],
  providers: [WhatsappWebClientService],
  exports: [WhatsappWebClientService],
})
export class WhatsappWebModule {}
