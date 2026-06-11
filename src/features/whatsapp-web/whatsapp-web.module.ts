import { Module } from '@nestjs/common';
import { WhatsappWebClientService } from './application/services/whatsapp-web-client.service';
import { WhatsappWebController } from './presentation/controllers/whatsapp-web.controller';

@Module({
  controllers: [WhatsappWebController],
  providers: [WhatsappWebClientService],
  exports: [WhatsappWebClientService],
})
export class WhatsappWebModule {}
