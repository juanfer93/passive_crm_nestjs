const { spawnSync } = require('child_process');
const path = require('path');

const args = parseArgs(process.argv.slice(2));
const nestCli = path.join(__dirname, '..', 'node_modules', '@nestjs', 'cli', 'bin', 'nest.js');

const result = spawnSync(
  process.execPath,
  [nestCli, 'start', '--entryFile', 'simulate-media'],
  {
    cwd: path.join(__dirname, '..'),
    env: withOptionalEnv(process.env, {
      SIMULATE_MEDIA_CHANNEL: args.channel,
      SIMULATE_MEDIA_CONTACT: args.contact,
      SIMULATE_MEDIA_PROFILE: args.profile,
      SIMULATE_MEDIA_TYPE: args.type,
      SIMULATE_MEDIA_FILE: args.file,
      SIMULATE_MEDIA_TRANSCRIBE_ONLY: args.transcribeOnly ? 'true' : undefined,
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
    type: readArg(argv, 'type'),
    file: readArg(argv, 'file'),
    transcribeOnly: hasFlag(argv, 'transcribe-only'),
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

function hasFlag(argv, name) {
  return argv.includes(`--${name}`);
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
