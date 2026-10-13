'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Only inspect configuration and file existence: never start services, overwrite saves or print credentials.
function parseEnv(source) {
  const out = Object.create(null);
  for (const line of String(source).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}

function validSigningKey(value, kind) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(value)) return false;
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8');
    if (kind === 'private') { crypto.createPrivateKey(decoded); return true; }
    crypto.createPublicKey(decoded); return true;
  } catch { return false; }
}

function inspectInstallation({root = path.resolve(__dirname, '..'), serverDir = path.join(root, 'runtime', 'server'),
  checkSourceLayout = true,
  nodeVersion = process.versions.node, platform = process.platform, fileSystem = fs} = {}) {
  const findings = [];
  const record = (level, code, message) => findings.push({level, code, message});
  const exists = p => { try { return fileSystem.existsSync(p); } catch { return false; } };
  const read = p => { try { return fileSystem.readFileSync(p, 'utf8'); } catch { return null; } };
  const nodeMajor = Number(String(nodeVersion).split('.')[0]);
  if (!Number.isInteger(nodeMajor) || nodeMajor < 24)
    record('error', 'NODE_VERSION', 'Instale Node.js 24 ou superior para compilar e executar este projeto.');
  else record('ok', 'NODE_VERSION', 'Versão do Node.js compatível.');

  if (checkSourceLayout && (!exists(path.join(root, 'package.json')) || !exists(path.join(root, 'server', 'upstream.lock.json'))))
    record('warning', 'SOURCE_LAYOUT', 'Confira a pasta raiz do projeto e a cópia de código do servidor.');
  else if (checkSourceLayout) record('ok', 'SOURCE_LAYOUT', 'Repositório e trava de versão do servidor encontrados.');

  const configurations = [
    {name:'Metagame', dir:'UndauntedMetagame', code:'METAGAME'},
    {name:'DeployServer', dir:'UndauntedDeployServer', code:'DEPLOY'}
  ];
  for (const service of configurations) {
    const dir = path.join(serverDir, service.dir);
    if (!exists(path.join(dir, 'dist', 'server.js'))) {
      record('error', service.code + '_BUILD', service.name + ': dist/server.js ausente. Execute npm run server:prepare numa pasta nova ou recompile o serviço existente.');
    } else record('ok', service.code + '_BUILD', service.name + ': servidor compilado encontrado.');
    const envFile = path.join(dir, '.env');
    if (!exists(envFile)) {
      record('error', service.code + '_ENV', service.name + ': .env ausente. Configure a cópia de trabalho seguindo docs/INSTALACAO.md.');
      continue;
    }
    const contents = read(envFile);
    if (contents === null) {
      record('error', service.code + '_ENV', service.name + ': não foi possível ler .env. Confira permissões.');
      continue;
    }
    record('ok', service.code + '_ENV', service.name + ': configuração encontrada.');
    const env = parseEnv(contents);
    const expectedPort = service.code === 'METAGAME' ? '61000' : '61001';
    if (env.PORT !== expectedPort)
      record('error', service.code + '_PORT', service.name + ': configure PORT=' + expectedPort + '; o launcher usa esta porta fixa.');
    else record('ok', service.code + '_PORT', service.name + ': porta compatível com o launcher.');
    if (!['127.0.0.1', 'localhost'].includes(env.BIND_HOST))
      record('warning', service.code + '_BIND', service.name + ': prefira BIND_HOST=127.0.0.1; não exponha a API interna na internet.');
    if (service.code === 'METAGAME') {
      if (env.REGISTRATION_MODE === 'OPEN')
        record('warning', 'OPEN_REGISTRATION', 'Cadastro aberto: altere REGISTRATION_MODE=INVITECODE depois de cadastrar o administrador.');
      if (env.MATCHMAKING_MODE !== 'DEPLOYSERVER')
        record('warning', 'MATCHMAKING_MODE', 'Confira MATCHMAKING_MODE=DEPLOYSERVER para caçadas com DeployServer.');
      if (env.TARGET_CHANGELIST && env.TARGET_CHANGELIST !== '239827')
        record('warning', 'CHANGE_LIST', 'Cliente esperado: TARGET_CHANGELIST=239827 (Dauntless 1.4.4).');
      if (!validSigningKey(env.AUTH_SIGNING_PRIVKEY_B64, 'private') || !validSigningKey(env.AUTH_SIGNING_PUBKEY_B64, 'public'))
        record('error', 'SIGNING_KEYS', 'Gere as duas chaves de assinatura do Metagame conforme docs/INSTALACAO.md.');
      if (!env.DB_FILENAME)
        record('error', 'DATABASE_PATH', 'Configure DB_FILENAME para um banco persistente fora da pasta de código.');
    } else {
      if (!env.METAGAME_API_KEY || /^(?:COLOQUE|CHANGE|TODO|EXAMPLE|INSIRA|YOUR|REPLACE)/i.test(env.METAGAME_API_KEY))
        record('error', 'GAMESERVER_KEY', 'Configure METAGAME_API_KEY com a chave própria de game server, diferente da chave do administrador.');
      if (!env.GAMESERVER_BINARY_PATH)
        record('error', 'GAME_BINARY', 'Configure GAMESERVER_BINARY_PATH com o executável do jogo 1.4.4 no host.');
      else if (!exists(env.GAMESERVER_BINARY_PATH))
        record('warning', 'GAME_BINARY', 'Executável de partida não encontrado no caminho configurado; confira GAMESERVER_BINARY_PATH neste sistema.');
      if (env.DEPLOYSERVER_URL && service.code === 'DEPLOY')
        record('warning', 'DEPLOY_URL', 'DEPLOYSERVER_URL pertence à configuração do Metagame; confira se os arquivos .env não foram invertidos.');
    }
  }
  // The game itself currently runs on Windows; Linux + Wine remains an experimental client route.
  if (platform === 'linux') record('warning', 'LINUX_GAME', 'APIs e launcher funcionam no Linux; hospedar partidas nativas ainda não foi validado.');
  return {status: findings.some(f => f.level === 'error') ? 'needs_configuration' : 'ready_to_start',
    errors: findings.filter(f => f.level === 'error').length,
    warnings: findings.filter(f => f.level === 'warning').length,
    findings};
}

function renderReport(result) {
  const symbols = {ok:'OK', warning:'ATENÇÃO', error:'ERRO'};
  return ['Diagnóstico do Dauntless Launcher Ultimate (somente leitura)',
    ...result.findings.map(f => '[' + symbols[f.level] + '] ' + f.message),
    '', result.status === 'ready_to_start' ? 'Configuração sem bloqueios detectados; ainda é necessário testar o jogo em dois PCs.'
      : 'Corrija os itens ERRO antes de iniciar os serviços.',
    'Erros: ' + result.errors + ' | Avisos: ' + result.warnings].join('\n');
}
module.exports = {parseEnv, inspectInstallation, renderReport};
