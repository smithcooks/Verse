const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
for (const directory of ['src', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(directory)) {
    if (/\.(cjs|mjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', path.join(directory, file)], { stdio: 'inherit' });
  }
}
console.log('JavaScript syntax checks passed.');
