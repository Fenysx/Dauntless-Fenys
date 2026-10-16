'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

function findPrivatePaths(files) {
  return files.filter((file) => {
    const normalized = file.replace(/\\/g, '/');
    const name = path.posix.basename(normalized);
    const envFile = /^\.env(?:\..+)?$/i.test(name);
    const envExample = /^\.env(?:\..+)?\.example$/i.test(name);
    return normalized.split('/').some((part) => part.toLowerCase() === 'senha') ||
      /^client_secret[^/]*\.json$/i.test(name) ||
      /\.(?:key|pem|p12|pfx|db|sqlite|sqlite3)$/i.test(name) ||
      (envFile && !envExample);
  });
}

function main() {
  const root = path.resolve(__dirname, '..');
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  const files = output.split('\0').filter(Boolean);
  const unsafe = findPrivatePaths(files);
  if (unsafe.length) {
    console.error('ERRO: arquivos com nomes sensíveis estão rastreados pelo Git:');
    for (const file of unsafe) console.error(`- ${file}`);
    process.exitCode = 1;
    return;
  }
  console.log('OK: nenhum caminho de credencial, chave, banco ou senha está rastreado.');
}

if (require.main === module) main();

module.exports = { findPrivatePaths };
