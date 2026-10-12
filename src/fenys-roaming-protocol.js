'use strict';
const crypto=require('node:crypto');
const {parseServerAddress}=require('./fenys-api');
const VERSION=1, MAX_BYTES=32*1024*1024;
const UID=/^UID-[a-f0-9-]{36}$/i, UUID=/^[a-f0-9-]{36}$/i;
function hash(value){return crypto.createHash('sha256').update(value).digest('hex');}
function identity(){
 const pair=crypto.generateKeyPairSync('ed25519');
 return {publicKey:pair.publicKey.export({type:'spki',format:'der'}).toString('base64'),
  privateKey:pair.privateKey.export({type:'pkcs8',format:'der'}).toString('base64')};
}
function sign(identity,payload){
 const message=JSON.stringify(payload);
 if(Buffer.byteLength(message)>MAX_BYTES)throw Error('O progresso excede o limite de transferência.');
 return {message,publicKey:identity.publicKey,signature:crypto.sign(null,Buffer.from(message),
  crypto.createPrivateKey({key:Buffer.from(identity.privateKey,'base64'),type:'pkcs8',format:'der'})).toString('base64')};
}
function verify(envelope,operation){
 if(!envelope||typeof envelope.message!=='string'||Buffer.byteLength(envelope.message)>MAX_BYTES||
  typeof envelope.publicKey!=='string'||envelope.publicKey.length!==60||typeof envelope.signature!=='string'||envelope.signature.length!==88)
  throw Error('Assinatura de identidade inválida.');
 const key=crypto.createPublicKey({key:Buffer.from(envelope.publicKey,'base64'),type:'spki',format:'der'});
 if(key.asymmetricKeyType!=='ed25519'||!crypto.verify(null,Buffer.from(envelope.message),key,Buffer.from(envelope.signature,'base64')))
  throw Error('Assinatura de identidade inválida.');
 const p=JSON.parse(envelope.message);
 if(p.version!==VERSION||p.operation!==operation||!UUID.test(p.requestId)||!UID.test(p.userId))throw Error('Operação de transferência inválida.');
 return {...p,publicKey:envelope.publicKey};
}
function encodeCode(address,secret,expiresAt){
 const server=parseServerAddress(address);
 if(server.local)throw Error('Selecione o endereço Tailscale deste computador para compartilhar o código.');
 return 'FENYS1.'+Buffer.from(JSON.stringify({address:server.address,secret,expiresAt})).toString('base64url');
}
function decodeCode(code,now=Date.now()){
 if(typeof code!=='string'||code.length>1024||!/^FENYS1\.[A-Za-z0-9_-]+$/.test(code.trim()))throw Error('Código de conexão inválido.');
 const data=JSON.parse(Buffer.from(code.trim().slice(7),'base64url').toString());
 const server=parseServerAddress(data.address);
 if(server.local||typeof data.secret!=='string'||! /^[a-f0-9]{40}$/.test(data.secret)||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=now)
  throw Error('Código inválido ou expirado. Peça um novo ao hospedeiro.');
 return {...data,address:server.address};
}
module.exports={VERSION,MAX_BYTES,UID,UUID,hash,identity,sign,verify,encodeCode,decodeCode};
