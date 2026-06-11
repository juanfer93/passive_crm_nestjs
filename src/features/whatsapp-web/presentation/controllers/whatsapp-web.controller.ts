import { Controller, Get } from '@nestjs/common';
import { WhatsappWebClientService } from '../../application/services/whatsapp-web-client.service';

@Controller('whatsapp-web')
export class WhatsappWebController {
  constructor(private readonly whatsappWebClientService: WhatsappWebClientService) {}

  @Get('status')
  getStatus() {
    return this.whatsappWebClientService.getStatus();
  }
}
