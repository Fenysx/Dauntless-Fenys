'use strict';
const crypto=require('node:crypto');
const {parseServerAddress}=require('./fenys-api');
const {identity}=require('./fenys-roaming-protocol');
const LIMIT=50*1024*1024, VERSION=2;
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
function sign(pair,payload){const message=JSON.stringify({...payload,version:VERSION});if(Buffer.byteLength(message)>LIMIT)throw Error('Requisição excedeu o limite.');return {message,publicKey:pair.publicKey,signature:crypto.sign(null,Buffer.from(message),crypto.createPrivateKey({key:Buffer.from(pair.privateKey,'base64'),type:'pkcs8',format:'der'})).toString('base64')};}
function verify(envelope,operation,now=Date.now()){
 if(!envelope||typeof envelope.message!=='string'||Buffer.byteLength(envelope.message)>LIMIT||typeof envelope.publicKey!=='string'||envelope.publicKey.length!==60||typeof envelope.signature!=='string'||envelope.signature.length!==88)throw Error('Identidade do host inválida.');
 const key=crypto.createPublicKey({key:Buffer.from(envelope.publicKey,'base64'),format:'der',type:'spki'});
 if(key.asymmetricKeyType!=='ed25519'||!crypto.verify(null,Buffer.from(envelope.message),key,Buffer.from(envelope.signature,'base64')))throw Error('Assinatura do host inválida.');
 const p=JSON.parse(envelope.message);
 if(p.version!==VERSION||p.operation!==operation||typeof p.requestId!=='string'||! /^[a-f0-9-]{36}$/i.test(p.requestId)||!Number.isSafeInteger(p.time)||Math.abs(now-p.time)>300000)throw Error('Requisição expirada ou inválida. Confira o relógio dos hosts.');
 return {...p,publicKey:envelope.publicKey};
}
function encodeCode({authority,address,realm,hostId,secret,expiresAt,kind='player'}){
 return 'FENYSC2.'+Buffer.from(JSON.stringify({authority:parseServerAddress(authority).address,address:parseServerAddress(address).address,realm,hostId,secret,expiresAt,kind})).toString('base64url');
}
function decodeCode(code,now=Date.now()){
 if(typeof code!=='string'||code.length>2048||!/^FENYSC2\.[A-Za-z0-9_-]+$/.test(code.trim()))throw Error('Código global inválido.');
 const p=JSON.parse(Buffer.from(code.trim().slice(8),'base64url').toString());
 p.authority=parseServerAddress(p.authority).address;p.address=parseServerAddress(p.address).address;
 if(!['host','player'].includes(p.kind)||typeof p.realm!=='string'||typeof p.hostId!=='string'||typeof p.secret!=='string'||! /^[a-f0-9]{48}$/.test(p.secret)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<=now)throw Error('Código expirado ou inválido.');
 return p;
}
async function call(address,route,body,key,timeout=25000){
 const server=parseServerAddress(address).address;
 if(!/^[a-z-]+$/.test(route))throw Error('Rota global inválida.');
 const headers={accept:'application/json'};if(body!==undefined)headers['content-type']='application/json';if(key)headers['x-undaunted-user-api-key']=key;
 let response;
 try{response=await fetch('http://'+server+'/fenys/cloud/v2/'+route,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(timeout),redirect:'error'});}catch{throw Error('Autoridade central indisponível. Confira o PC central e o Tailscale; o jogo não usará uma cópia antiga dos dados.');}
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>LIMIT){await reader.cancel();throw Error('Resposta global excedeu o limite.');}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
 let result;try{result=JSON.parse(Buffer.concat(parts).toString());}catch{throw Error('A autoridade central não retornou uma resposta válida.');}
 if(!response.ok)throw Error(result.error||'Não foi possível acessar os dados globais.');return result;
}
function privateRequest(req){const ip=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');const parts=ip.split('.').map(Number);return !['forwarded','x-forwarded-for','x-forwarded-host','x-dauntless-gateway','via'].some(k=>req.headers[k]!==undefined)&&(ip==='::1'||ip.startsWith('127.')||(parts.length===4&&parts[0]===100&&parts[1]>=64&&parts[1]<=127));}
function localRequest(req){const ip=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');return privateRequest(req)&&(ip==='::1'||ip.startsWith('127.'));}
module.exports={identity,hash,sign,verify,encodeCode,decodeCode,call,privateRequest,localRequest,VERSION,LIMIT};
