'use strict';
// HTTP/1.1 over pinned TLS for the original public Revived v2 gateway.
// Nothing is written to a socket before the SHA-256 certificate check succeeds.
const http=require('node:http');
const tls=require('node:tls');
const net=require('node:net');
const crypto=require('node:crypto');
const {Readable}=require('node:stream');

function pinnedSocket(target,callback){
 let socket,settled=false,timer;
 function done(error,connected){
  if(settled)return;settled=true;clearTimeout(timer);
  if(error){socket?.destroy();callback(error);}else callback(null,connected);
 }
 socket=tls.connect({
  host:target.host,port:target.port,servername:net.isIP(target.host)===0?target.host:undefined,
  rejectUnauthorized:false,minVersion:'TLSv1.2',ALPNProtocols:['http/1.1']
 });
 timer=setTimeout(()=>done(Error('Tempo limite de conexão TLS.')),10000);
 socket.once('error',e=>done(e));
 socket.once('secureConnect',()=>{
  const raw=socket.getPeerX509Certificate?.()?.raw||socket.getPeerCertificate(false)?.raw;
  const actual=raw?crypto.createHash('sha256').update(raw).digest():null;
  const expected=Buffer.from(target.fingerprint,'hex');
  if(!actual||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))
   return done(Error('Certificado TLS diferente do fingerprint do convite. Nenhuma credencial foi enviada.'));
  done(null,socket);
 });
 return undefined;
}
function assertTarget(target){
 if(!target||target.mode!=='public'||!/^[a-f0-9]{64}$/.test(target.fingerprint||'')||
  !Number.isInteger(target.port)||target.port<1||target.port>65535||typeof target.host!=='string'||! /^[a-z0-9.-]{1,253}$/i.test(target.host))
  throw Error('Convite público v2 inválido.');
}
function requestStream(target,resource,{method='GET',headers={},body,signal}={}){
 assertTarget(target);
 if(!/^\/(?:content\/v1\/(?:manifest|files\/[A-Za-z0-9_./%() +-]+)|undaunted\/api\/(?:Register|GetUserInfo|ServerStatus))$/.test(resource)||
 resource.includes('..'))throw Error('Rota pública não permitida.');
 if(!['GET','POST','HEAD'].includes(method))throw Error('Método não permitido.');
 if(typeof body==='string'&&body.length>2048)throw Error('Dados de cadastro grandes demais.');
 const host=target.port===443?target.host:target.host+':'+target.port;
 return new Promise((resolve,reject)=>{
  let settled=false;
  const req=http.request({protocol:'http:',hostname:target.host,port:target.port,path:resource,method,agent:false,
   headers:{host,accept:'application/json',...headers,...(body!==undefined?{'content-type':'application/json','content-length':Buffer.byteLength(body)}:{})},
   createConnection:(_options,cb)=>pinnedSocket(target,cb)
  });
  const finish=(fn)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);fn();};
  const onAbort=()=>{req.destroy(Error('Requisição cancelada.'));};
  const timer=setTimeout(()=>req.destroy(Error('Servidor não respondeu dentro do prazo.')),30000);
  if(signal){signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();}
  req.once('error',e=>finish(()=>reject(e)));
  req.once('response',res=>finish(()=>resolve(res)));
  if(body!==undefined)req.write(body);
  req.end();
 });
}
async function requestJson(target,resource,opts={}){
 const res=await requestStream(target,resource,opts);
 const chunks=[];let size=0;
 for await(const part of res){
  size+=part.length;
  if(size>65536){res.destroy();throw Error('Resposta de API grande demais.');}
  chunks.push(part);
 }
 let result;try{result=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('Resposta JSON inválida do servidor.');}
 return {status:res.statusCode,data:result};
}
async function register(target,username){
 if(!/^[A-Za-z0-9_]{3,16}$/.test(username))throw Error('Use de 3 a 16 letras, números ou _.');
 if(!/^[A-Za-z0-9-]{4,64}$/.test(target.code||''))throw Error('Convite de registro inválido.');
 const r=await requestJson(target,'/undaunted/api/Register',
  {method:'POST',body:JSON.stringify({Username:username,InviteCode:target.code})});
 if(r.status===401)throw Error('Convite já usado ou inválido. Peça um novo no Discord.');
 if(r.status===409)throw Error('Nome de personagem já utilizado.');
 if(r.status!==200)throw Error('Cadastro não foi confirmado pelo servidor (HTTP '+r.status+').');
 if(typeof r.data?.UUK!=='string'||!/^UUK_[a-f0-9]{48}$/i.test(r.data.UUK))throw Error('Servidor retornou uma key inválida.');
 return r.data.UUK;
}
async function validateAccount(target,key){
 if(!/^UUK_[a-f0-9]{48}$/i.test(key))throw Error('Key pessoal inválida.');
 const r=await requestJson(target,'/undaunted/api/GetUserInfo',
   {headers:{'x-undaunted-user-api-key':key}});
 if(r.status!==200||typeof r.data?.Username!=='string')throw Error('Conta não reconhecida pelo servidor público.');
 return {username:r.data.Username};
}
function pinnedFetch(target){
 assertTarget(target);
 return async(resource,{headers={},method='GET',signal}={})=>{
  let url;try{url=new URL(resource);}catch{throw Error('URL pública inválida.');}
  if(url.protocol!=='https:'||url.host!==(target.port===443?target.host:target.host+':'+target.port)||
     url.username||url.password||url.hash||url.search)
    throw Error('URL fora do servidor TLS definido pelo convite.');
  const res=await requestStream(target,url.pathname,{method,headers,signal});
  const head=new Headers();
  if(res.headers['content-length'])head.set('content-length',String(res.headers['content-length']));
  if(res.headers['content-type'])head.set('content-type',String(res.headers['content-type']));
  const noBody=[204,205,304].includes(res.statusCode);
  return new Response(noBody?null:Readable.toWeb(res),{status:res.statusCode,headers:head});
 };
}
module.exports={requestStream,requestJson,register,validateAccount,pinnedFetch,assertTarget};
