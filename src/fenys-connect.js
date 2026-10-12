'use strict';
// O codigo Fenys inclui o endereco privado do host e o convite upstream.
// O hash detecta erros de copia; NAO e uma assinatura de autenticidade.
// Um convite upstream cria uma conta no Metagame: nao transfere progresso.
const crypto=require('node:crypto');
const {parseServerAddress,requestApi}=require('./fenys-api');
const PREFIX='FENYS1.';
function makeConnectCode(serverAddress,inviteCode){
 const parsed=parseServerAddress(serverAddress);
 const invite=String(inviteCode||'').trim().toUpperCase();
 if(!/^[A-Z0-9-]{8,32}$/.test(invite))throw new Error('Convite de servidor inválido.');
 // O loopback nao funciona em outro computador.
 if(parsed.local)throw new Error('Use o endereço Tailscale deste computador (100.x.y.z:61000 ou nome *.ts.net), não localhost.');
 const data=Buffer.from(JSON.stringify({v:1,server:parsed.address,invite}),'utf8').toString('base64url');
 const check=crypto.createHash('sha256').update(data).digest('hex').slice(0,10).toUpperCase();
 return PREFIX+data+'.'+check;
}
function parseConnectCode(code){
 const input=String(code||'').trim();
 if(input.length>512)throw new Error('Código grande demais.');
 const match=/^FENYS1\.([A-Za-z0-9_-]{15,420})\.([0-9A-Fa-f]{10})$/.exec(input);
 if(!match)throw new Error('Código Fenys inválido. Peça um código completo ao anfitrião.');
 const check=crypto.createHash('sha256').update(match[1]).digest('hex').slice(0,10);
 if(check!==match[2].toLowerCase())throw new Error('Código incompleto ou alterado. Copie novamente.');
 let data;
 try{data=JSON.parse(Buffer.from(match[1],'base64url').toString('utf8'));}catch{throw new Error('Não foi possível ler o código Fenys.');}
 if(!data||data.v!==1||typeof data.server!=='string'||typeof data.invite!=='string')throw new Error('Formato de código Fenys não suportado.');
 const server=parseServerAddress(data.server);
 if(server.local)throw new Error('O código aponta para localhost, não para o computador do anfitrião.');
 if(!/^[A-Z0-9-]{8,32}$/.test(data.invite))throw new Error('Convite inválido no código.');
 return {server:server.address,invite:data.invite};
}
async function checkConnection(server,key){
 const status=await requestApi(server,'/undaunted/api/ServerStatus',{key});
 if(!status||status.online!==true)throw new Error('O servidor ainda não está pronto para receber jogadores.');
 return {name:typeof status.name==='string'?status.name.slice(0,80):'Servidor Dauntless',server,online:true};
}
async function checkExistingCharacter(server,key){
 const info=await requestApi(server,'/undaunted/api/GetUserInfo',{key});
 if(!info||typeof info.Username!=='string'||!info.UserId)throw new Error('A chave não está cadastrada neste servidor.');
 return {username:info.Username.slice(0,32),userId:info.UserId};
}
module.exports={makeConnectCode,parseConnectCode,checkConnection,checkExistingCharacter};
