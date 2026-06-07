import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { AppModule } from '@/app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);
  const mongoConnection = app.get<Connection>(getConnectionToken());

  app.enableShutdownHooks();

  logger.log(
    `MongoDB connection initialized: database=${mongoConnection.name}, host=${mongoConnection.host}, readyState=${mongoConnection.readyState}`,
  );

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  logger.log(`HTTP server listening on port ${port}`);
}

void bootstrap();
