'use strict';
const crypto=require('node:crypto');
const {URL,KEY}=require('./fenys-google-auth');
const {sign,identity}=require('./fenys-cloud-protocol');
const {parseEndpoint:parseServerAddress,origin}=require('./fenys-network');
const ENDPOINT=URL+'/functions/v1/fenys-global/players';
async function cloud(operation,fields={},token,fetchImpl=fetch){const r=await fetchImpl(ENDPOINT,{method:'POST',headers:{apikey:KEY,'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify({operation,...fields}),redirect:'error',signal:AbortSignal.timeout(90000)});const raw=await r.text();if(raw.length>24*1024*1024)throw Error('Progresso excedeu o limite da nuvem.');let result;try{result=JSON.parse(raw);}catch{throw Error('A nuvem não confirmou o progresso.');}if(!r.ok)throw Error(result.error||'A nuvem não confirmou o acesso.');return result;}
function signed(pair,operation,fields){return sign(pair,{operation,requestId:crypto.randomUUID(),time:Date.now(),...fields});}
function encodeInvite(address,secret,expiresAt,hostKey){return 'DLU3.'+Buffer.from(JSON.stringify({address:parseServerAddress(address).address,secret,expiresAt,hostKey})).toString('base64url');}
function decodeInvite(code){if(typeof code!=='string'||code.length>2048||!/^DLU3\.[\w-]+$/.test(code.trim()))throw Error('Use um código do servidor integrado com Google.');const p=JSON.parse(Buffer.from(code.trim().slice(5),'base64url'));p.address=parseServerAddress(p.address).address;if(p.address.startsWith('127.')||! /^[a-f0-9]{48}$/.test(p.secret)||!Number.isSafeInteger(p.expiresAt)||p.expiresAt<Date.now()||typeof p.hostKey!=='string'||p.hostKey.length!==60)throw Error('Código inválido ou expirado.');return p;}
async function hostCall(address,operation,body,token,nativeKey){const r=await fetch(origin(address)+'/launcher/google/'+operation,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),...(nativeKey?{'x-undaunted-user-api-key':nativeKey}:{})},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(180000)});const raw=await r.text();if(raw.length>24*1024*1024)throw Error('Resposta inválida do servidor.');const b=JSON.parse(raw||'{}');if(!r.ok)throw Error(b.error||'O servidor não confirmou a operação.');return b;}
async function availability(){const r=await fetch(ENDPOINT,{redirect:'error',signal:AbortSignal.timeout(20000)});const p=await r.json();if(!r.ok||p.service!=='launcher-players'||p.version!==3)throw Error('A API de personagens Google ainda precisa ser publicada no Supabase. Seus dados atuais foram preservados.');return true;}
module.exports={availability,cloud,signed,identity,encodeInvite,decodeInvite,hostCall,ENDPOINT};

