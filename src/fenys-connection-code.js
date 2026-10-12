'use strict';
const {parseServerAddress}=require('./fenys-api');
const PREFIX='FENYS1.';
function encodeConnection(server,invite){
 const sv=parseServerAddress(server);
 if(sv.local||sv.port!==61000)throw Error('Selecione o endereço Tailscale do seu PC na porta 61000.');
 if(!/^[A-Z0-9-]{8,32}$/.test(invite))throw Error('Convite inválido.');
 return PREFIX+Buffer.from(JSON.stringify({v:1,server:sv.address,invite})).toString('base64url');
}
function decodeConnection(code){
 const raw=String(code||'').trim();
 if(raw.length>1024||!raw.startsWith(PREFIX)||! /^[A-Za-z0-9_-]+$/.test(raw.slice(PREFIX.length)))throw Error('Cole o código FENYS1 recebido do dono do servidor.');
 let data;try{data=JSON.parse(Buffer.from(raw.slice(PREFIX.length),'base64url').toString('utf8'));}catch{throw Error('Código de conexão inválido.');}
 const sv=parseServerAddress(data.server);
 if(data.v!==1||typeof data.server!=='string'||sv.local||sv.port!==61000||typeof data.invite!=='string'||! /^[A-Z0-9-]{8,32}$/.test(data.invite))throw Error('Código de conexão inválido.');
 return {server:sv.address,invite:data.invite};
}
module.exports={encodeConnection,decodeConnection};
