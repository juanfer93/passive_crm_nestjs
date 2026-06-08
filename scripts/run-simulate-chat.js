const { spawnSync } = require('child_process');
const path = require('path');

const args = parseArgs(process.argv.slice(2));
const nestCli = path.join(__dirname, '..', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

const result = spawnSync(
  process.execPath,
  [nestCli, 'start', '--entryFile', 'simulate-chat'],
  {
    cwd: path.join(__dirname, '..'),
    env: withOptionalEnv(process.env, {
      SIMULATE_CHAT_CHANNEL: args.channel,
      SIMULATE_CHAT_CONTACT: args.contact,
      SIMULATE_CHAT_PROFILE: args.profile,
    }),
    stdio: 'inherit',
  },
);

process.exit(result.status ?? 1);

function parseArgs(argv) {
  return {
    channel: readArg(argv, 'channel'),
    contact: readArg(argv, 'contact'),
    profile: readArg(argv, 'profile'),
  };
}

function readArg(argv, name) {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));

  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : undefined;
}

function withOptionalEnv(baseEnv, values) {
  return Object.entries(values).reduce(
    (env, [key, value]) => {
      if (value) {
        env[key] = value;
      }

      return env;
    },
    { ...baseEnv },
  );
}
