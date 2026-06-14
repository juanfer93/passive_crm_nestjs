import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client, LocalAuth, Message } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';

@Injectable()
export class WhatsappWebClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsappWebClientService.name);
  private client: Client;
  private isReady = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const isEnabled = this.configService.get<string>('WHATSAPP_WEB_ENABLED') === 'true';
    if (!isEnabled) {
      this.logger.log('WhatsApp Web integration is disabled.');
      return;
    }

    const clientId = this.configService.get<string>('WHATSAPP_WEB_CLIENT_ID') || 'default-client';
    const isHeadless = this.configService.get<string>('WHATSAPP_WEB_HEADLESS', 'true') === 'true';

    this.logger.log(`Initializing WhatsApp Web Client (ID: ${clientId})...`);

    this.client = new Client({
      authStrategy: new LocalAuth({ clientId }),
      puppeteer: {
        headless: isHeadless,
        // En algunos entornos sin UI puede ser necesario descomentar los siguientes argumentos
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.setupListeners();
    try {
      await this.client.initialize();
    } catch (error) {
      this.isReady = false;
      this.logger.error(
        `WhatsApp Web initialization failed; the rest of the application will continue: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      this.logger.log('Destroying WhatsApp Web Client...');
      await this.client.destroy();
    }
  }

  private setupListeners() {
    this.client.on('qr', (qr: string) => {
      this.logger.log('Scan the QR code below to authenticate:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      this.isReady = true;
      this.logger.log('WhatsApp Web Client is READY!');
    });

    this.client.on('authenticated', () => {
      this.logger.log('WhatsApp Web Client is authenticated.');
    });

    this.client.on('auth_failure', (msg: string) => {
      this.logger.error(`WhatsApp Web Client auth_failure: ${msg}`);
      this.isReady = false;
    });

    this.client.on('disconnected', (reason: string) => {
      this.logger.warn(`WhatsApp Web Client was disconnected: ${reason}`);
      this.isReady = false;
    });

    this.client.on('message', async (message: Message) => {
      try {
        const chat = await message.getChat();
        this.logger.log(`New Message Received:
          - Sender: ${message.from}
          - Body: ${message.body}
          - Timestamp: ${new Date(message.timestamp * 1000).toISOString()}
          - Type: ${chat.isGroup ? 'Group' : 'Individual'}
        `);
      } catch (error) {
        this.logger.error('Error handling incoming message', error);
      }
    });
  }

  /**
   * Envía un mensaje a un destinatario.
   * Por ahora este método no se usará, pero queda preparado.
   * @param to Número de teléfono en formato normalizado (e.g. '17036349302@c.us')
   * @param message Cuerpo del mensaje
   */
  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.isReady) {
      this.logger.warn('Cannot send message: WhatsApp Web Client is not ready.');
      return;
    }

    try {
      await this.client.sendMessage(to, message);
      this.logger.log(`Message sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send message to ${to}`, error);
    }
  }

  public getStatus() {
    return {
      enabled: this.configService.get<string>('WHATSAPP_WEB_ENABLED') === 'true',
      ready: this.isReady,
      clientId: this.configService.get<string>('WHATSAPP_WEB_CLIENT_ID') || 'default-client',
    };
  }
}
