import { NestFactory } from '@nestjs/core';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { basename, extname, resolve } from 'path';
import { stdout as output } from 'process';
import { AppModule } from '@/app.module';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { SimulateTerminalConversationUseCase } from '@/features/meta-messaging-webhook/application/use-cases/simulate-terminal-conversation.use-case';
import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';
import { MediaContent } from '@/features/meta-messaging-webhook/domain/entities/media-content.entity';
import {
  MEDIA_ANALYZER,
  MediaAnalyzerPort,
} from '@/features/meta-messaging-webhook/domain/ports/media-analyzer.port';

type SimulatedMediaType = 'audio' | 'image' | 'unknown';

interface CliArgs {
  channel: MetaMessagingChannel;
  contactId: string;
  filePath: string;
  profileKey: string;
  transcribeOnly: boolean;
  type?: SimulatedMediaType;
}

async function bootstrap(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const absolutePath = resolve(args.filePath);

  if (!existsSync(absolutePath)) {
    throw new Error(`Media file not found: ${absolutePath}`);
  }

  const type = args.type ?? inferMediaType(absolutePath);

  if (args.transcribeOnly && type !== 'audio') {
    throw new Error('--transcribe-only can only be used with audio files.');
  }

  const mimeType = inferMimeType(absolutePath, type);
  const bytes = await readFile(absolutePath);
  const media: MediaContent = {
    id: basename(absolutePath),
    mimeType,
    bytes,
  };
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const analyzer = app.get<MediaAnalyzerPort>(MEDIA_ANALYZER);
  const simulator = app.get(SimulateTerminalConversationUseCase);
  const dealerProfiles = app.get(DealerProfileResolver);
  const profile = dealerProfiles.resolve({ profileKey: args.profileKey });

  try {
    const mediaText =
      type === 'audio'
        ? await analyzer.transcribeAudio(media)
        : type === 'image'
          ? await analyzer.describeImage(media)
          : unsupportedMediaMessage();

    output.write(`\nSimulador Meta Messaging Media\n`);
    output.write(`Dealer: ${profile.displayName}\n`);
    output.write(`Contacto: ${args.contactId}\n`);
    output.write(`Canal: ${args.channel}\n`);
    output.write(`Archivo: ${absolutePath}\n`);
    output.write(`Tipo: ${type}\n\n`);
    output.write(`${mediaLogLabel(type)}> ${mediaText}\n\n`);

    if (args.transcribeOnly) {
      return;
    }

    const result = await simulator.execute({
      channel: args.channel,
      contactId: args.contactId,
      profileKey: args.profileKey,
      text: mediaText,
    });

    if (result.stopped) {
      output.write('Bot> [sin respuesta: lead ya completado]\n');
    } else {
      output.write(`Bot> ${result.reply}\n`);
    }

    output.write(`Custom fields> ${JSON.stringify(result.leadCustomFields)}\n`);

    if (result.completed) {
      output.write('Estado> completed\n');
    }
  } finally {
    await app.close();
  }
}

function parseArgs(argv: string[]): CliArgs {
  const filePath = readArg(argv, 'file') ?? process.env.SIMULATE_MEDIA_FILE;

  if (!filePath) {
    throw new Error('Missing --file. Example: --file C:\\dev\\imagen_de_prueba.jpg');
  }

  return {
    channel: parseChannel(readArg(argv, 'channel') ?? process.env.SIMULATE_MEDIA_CHANNEL ?? 'messenger'),
    contactId: readArg(argv, 'contact') ?? process.env.SIMULATE_MEDIA_CONTACT ?? 'terminal-media-test',
    filePath,
    profileKey:
      readArg(argv, 'profile') ??
      process.env.SIMULATE_MEDIA_PROFILE ??
      'offlease-fredericksburg',
    transcribeOnly: hasFlag(argv, 'transcribe-only') || process.env.SIMULATE_MEDIA_TRANSCRIBE_ONLY === 'true',
    type: parseMediaType(readArg(argv, 'type') ?? process.env.SIMULATE_MEDIA_TYPE),
  };
}

function parseChannel(value: string): MetaMessagingChannel {
  return value === 'instagram' ? 'instagram' : 'messenger';
}

function parseMediaType(value?: string): SimulatedMediaType | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'audio' || value === 'image' || value === 'unknown') {
    return value;
  }

  if (value === 'file' || value === 'document' || value === 'video') {
    return 'unknown';
  }

  throw new Error(`Unsupported media type: ${value}`);
}

function inferMediaType(filePath: string): SimulatedMediaType {
  const extension = extname(filePath).toLowerCase();

  if (['.ogg', '.mp3', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'].includes(extension)) {
    return 'audio';
  }

  if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
    return 'image';
  }

  return 'unknown';
}

function inferMimeType(filePath: string, type: SimulatedMediaType): string {
  const extension = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.mpeg': 'audio/mpeg',
    '.mpga': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.webp': 'image/webp',
  };

  return mimeTypes[extension] ?? (type === 'audio' ? 'audio/mpeg' : 'application/octet-stream');
}

function unsupportedMediaMessage(): string {
  return 'El cliente envio un archivo sin texto util para la calificacion. Continua con la siguiente pregunta pendiente.';
}

function mediaLogLabel(type: SimulatedMediaType): string {
  if (type === 'audio') {
    return 'OpenAI audio transcription';
  }

  if (type === 'image') {
    return 'Image analysis';
  }

  return 'Media notice';
}

function readArg(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(`--${name}`);
}

bootstrap().catch((error: unknown) => {
  output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
