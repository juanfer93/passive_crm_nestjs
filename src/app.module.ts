import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MetaMessagingWebhookModule } from '@/features/meta-messaging-webhook/meta-messaging-webhook.module';
import { WhatsappWebModule } from '@/features/whatsapp-web/whatsapp-web.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    MetaMessagingWebhookModule,
    WhatsappWebModule,
  ],
})
export class AppModule {}
