const fs = require('node:fs');
const path = require('node:path');

const distRoot = path.join(process.cwd(), 'dist');

function walk(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function toImportPath(fromFile, aliasPath) {
  const target = path.join(distRoot, aliasPath.slice(2));
  const relative = path.relative(path.dirname(fromFile), target).replace(/\\/g, '/');

  if (relative.startsWith('.')) {
    return relative;
  }

  return `./${relative}`;
}

for (const file of walk(distRoot).filter((name) => /\.(js|d\.ts)$/.test(name))) {
  const original = fs.readFileSync(file, 'utf8');
  const updated = original.replace(/(["'])@\/([^"']+)\1/g, (match, quote, aliasPath) => {
    return `${quote}${toImportPath(file, `@/${aliasPath}`)}${quote}`;
  });

  if (updated !== original) {
    fs.writeFileSync(file, updated);
  }
}
