'use strict';
const path = require('node:path');
const {parseEnv, inspectInstallation, renderReport} = require('../src/fenys-host-doctor');
function cli(argv = process.argv.slice(2)) {
  let serverDir, asJson = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--server' && argv[i+1]) serverDir = path.resolve(argv[++i]);
    else if (argv[i] === '--json') asJson = true;
    else if (argv[i] === '--help') {
      process.stdout.write('Uso: npm run doctor -- [--server PASTA_RUNTIME_SERVER] [--json]\n'); return 0;
    } else { process.stderr.write('Argumento inválido. Use --help para instruções.\n'); return 2; }
  }
  const report = inspectInstallation(serverDir ? {serverDir} : {});
  process.stdout.write((asJson ? JSON.stringify(report, null, 2) : renderReport(report)) + '\n');
  return report.errors > 0 ? 1 : 0;
}
if (require.main === module) process.exitCode = cli();
module.exports = {parseEnv, inspectInstallation, renderReport, cli};
