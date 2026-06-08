import { NestFactory } from '@nestjs/core';
import { createInterface } from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { AppModule } from '@/app.module';
import { SimulateTerminalConversationUseCase } from '@/features/meta-messaging-webhook/application/use-cases/simulate-terminal-conversation.use-case';
import { DealerProfileResolver } from '@/features/meta-messaging-webhook/application/services/dealer-profile-resolver.service';
import { MetaMessagingChannel } from '@/features/meta-messaging-webhook/domain/entities/conversation-message.entity';

interface CliArgs {
  channel: MetaMessagingChannel;
  contactId: string;
  profileKey: string;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const simulator = app.get(SimulateTerminalConversationUseCase);
  const dealerProfiles = app.get(DealerProfileResolver);
  const args = parseArgs(process.argv.slice(2));
  const profile = dealerProfiles.resolve({ profileKey: args.profileKey });
  const rl = createInterface({ input, output });

  output.write(`\nSimulador Meta Messaging\n`);
  output.write(`Dealer: ${profile.displayName}\n`);
  output.write(`Contacto: ${args.contactId}\n`);
  output.write(`Canal: ${args.channel}\n`);
  output.write(`Comandos: /exit para salir\n\n`);

  try {
    while (true) {
      const text = (await rl.question('Cliente> ')).trim();

      if (!text || text === '/exit') {
        break;
      }

      const result = await simulator.execute({
        channel: args.channel,
        contactId: args.contactId,
        profileKey: args.profileKey,
        text,
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

      output.write('\n');
    }
  } finally {
    rl.close();
    await app.close();
  }
}

function parseArgs(argv: string[]): CliArgs {
  return {
    channel: parseChannel(readArg(argv, 'channel') ?? process.env.SIMULATE_CHAT_CHANNEL ?? 'messenger'),
    contactId: readArg(argv, 'contact') ?? process.env.SIMULATE_CHAT_CONTACT ?? 'terminal-test',
    profileKey:
      readArg(argv, 'profile') ??
      process.env.SIMULATE_CHAT_PROFILE ??
      'offlease-fredericksburg',
  };
}

function parseChannel(value: string): MetaMessagingChannel {
  return value === 'instagram' ? 'instagram' : 'messenger';
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

bootstrap().catch((error: unknown) => {
  output.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
