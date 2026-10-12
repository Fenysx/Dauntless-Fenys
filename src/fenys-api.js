'use strict';
// Fenys private-server API. The upstream private mode uses HTTP; never send credentials to the public internet.
const net = require('node:net');

function parseServerAddress(value) {
  const input = String(value == null ? '' : value).trim() || '127.0.0.1:61000';
  if (!/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(input)) {
    throw new Error('Use um endereço privado como 127.0.0.1:61000 ou 100.x.y.z:61000.');
  }
  const [rawHost, rawPort] = input.split(':');
  const host = rawHost.toLowerCase();
  const port = rawPort == null ? 61000 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Porta inválida.');
  const segments = host.split('.').map(Number);
  const ip = net.isIP(host) === 4;
  const tailnetIp = ip && segments[0] === 100 && segments[1] >= 64 && segments[1] <= 127;
  const tailscaleDns = /^(?:[a-z0-9-]+\.)+[a-z0-9-]+\.ts\.net$/.test(host);
  const local = host === 'localhost' || host === '127.0.0.1';
  if (!local && !tailnetIp && !tailscaleDns) {
    throw new Error('Por segurança, use localhost ou um endereço do Tailscale (100.64.0.0/10 ou *.ts.net).');
  }
  return { host, port, local, address: `${host}:${port}` };
}

async function requestApi(address, route, options = {}) {
  const server = parseServerAddress(address);
  if (!/^\/undaunted\/api\/[A-Za-z]+(?:\?offset=(?:0|[1-9][0-9]{0,7}))?$/.test(route)) throw new Error('Rota da API inválida.');
  const headers = { accept: 'application/json' };
  if (options.key) headers['x-undaunted-user-api-key'] = options.key;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  let response;
  try {
    response = await fetch(`http://${server.address}${route}`, {
      method: options.method || 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      redirect: 'error',
      signal: AbortSignal.timeout(10000)
    });
  } catch {
    throw new Error('Servidor inacessível. Confira se o Tailscale está conectado e se o Metagame responde na porta 61000.');
  }
  const text = await response.text();
  if (text.length > 65536) throw new Error('Resposta da API maior que o esperado.');
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { throw new Error('Resposta inválida do servidor.'); }
  if (!response.ok) {
    const errors = {
      400: 'Dados inválidos ou cadastro fechado.',
      401: 'Convite inválido ou chave de conta rejeitada.',
      403: 'Permissão negada. Essa conta não é administradora ou o acesso passou por um proxy.',
      404: 'Recurso não encontrado. Verifique a versão do servidor.',
      409: 'Nome de jogador já utilizado.',
      429: 'Limite de tentativas atingido. Aguarde antes de tentar novamente.'
    };
    throw new Error(errors[response.status] || `Servidor respondeu HTTP ${response.status}.`);
  }
  return body;
}

async function createInvite(address, adminKey, name) {
  const profile = await requestApi(address, '/undaunted/api/GetUserInfo', { key: adminKey });
  if (profile.IsAdmin !== true) throw new Error('A conta selecionada não é administradora no Metagame.');
  const state = await requestApi(address, '/undaunted/api/RegistrationStatus');
  if (state.RegistrationMode !== 'INVITECODE') {
    throw new Error('Configure REGISTRATION_MODE=INVITECODE no .env do Metagame e reinicie o serviço.');
  }
  const note = String(name || '').trim();
  if (note.length > 64) throw new Error('A observação pode ter até 64 caracteres.');
  const result = await requestApi(address, '/undaunted/api/CreateInvite', {
    method: 'POST', key: adminKey, body: { uses: 1, name: note }
  });
  if (typeof result.code !== 'string' || !/^[A-Z0-9-]{8,32}$/.test(result.code)) {
    throw new Error('O Metagame não retornou um código de convite válido.');
  }
  return result.code;
}

async function registerPlayer(address, username, inviteCode) {
  const name = String(username || '').trim();
  const invite = String(inviteCode || '').trim().toUpperCase();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
    throw new Error('Nome: use de 3 a 16 letras, números ou _.');
  }
  if (!/^[A-Z0-9-]{8,64}$/.test(invite)) throw new Error('Informe um código de convite válido.');
  const response = await requestApi(address, '/undaunted/api/Register', {
    method: 'POST', body: { Username: name, InviteCode: invite }
  });
  if (typeof response.UUK !== 'string' || !/^UUK_[a-f0-9]{48}$/i.test(response.UUK)) {
    throw new Error('O servidor não retornou uma chave de conta válida.');
  }
  return response.UUK;
}

async function getAdminAccounts(address,adminKey,offset=0){
 if(!Number.isSafeInteger(offset)||offset<0||offset>10000000)throw new Error('Página inválida.');
 const profile=await requestApi(address,'/undaunted/api/GetUserInfo',{key:adminKey});
 if(profile.IsAdmin!==true)throw new Error('Sua conta não tem permissão de administrador no Metagame.');
 const response=await requestApi(address,'/undaunted/api/DashboardAccounts?offset='+offset,{key:adminKey});
 if(!response||!Array.isArray(response.accounts))throw new Error('O servidor não retornou as contas.');
 return {accounts:response.accounts.slice(0,100).filter(x=>
  x&&typeof x.id==='string'&&/^UID-[a-f0-9-]{16,80}$/i.test(x.id)&&typeof x.name==='string')
  .map(x=>({id:x.id,name:x.name.slice(0,32),admin:x.admin===true||x.admin===1,
    active:typeof x.keyFingerprint==='string'&&x.keyFingerprint.length>0})),
  nextOffset:Number.isSafeInteger(response.nextOffset)?response.nextOffset:null};
}
module.exports = {parseServerAddress,requestApi,createInvite,registerPlayer,getAdminAccounts};
