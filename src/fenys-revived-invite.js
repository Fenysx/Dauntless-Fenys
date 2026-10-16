'use strict';
// Strictly parses the original private v1 / public v2 launcher invite.
// No external requests, credential handling or registration in this module.
const net=require('node:net');
const V1=new Set(['v','host','port','code','name','share']);
const V2=new Set(['v','mode','host','port','fp','code','name']);
const badControl=/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/;
function validHost(host){
 if(typeof host!=='string'||!host||host.length>253||!/^[a-z0-9.-]+$/.test(host))return false;
 if(/^[0-9.]+$/.test(host))return net.isIP(host)===4&&host.split('.').every(s=>/^(0|[1-9][0-9]{0,2})$/.test(s));
 const labels=host.split('.');
 return labels.every(x=>x&&x.length<=63&&!x.startsWith('-')&&!x.endsWith('-'))&&!/^(?:\d+|0x[a-f0-9]+)$/.test(labels.at(-1));
}
function isPrivate(host){
 if(host==='localhost'||host.startsWith('127.')&&net.isIP(host)===4)return true;
 const v=host.split('.').map(Number);
 return net.isIP(host)===4&&v[0]===100&&v[1]>=64&&v[1]<=127||
   host.endsWith('.ts.net')&&host.split('.').length>=3&&validHost(host);
}
function parseRevivedInvite(input){
 if(typeof input!=='string'||input.length>2048)throw Error('Convite inválido ou grande demais.');
 const raw=input.trim(),prefix=/^dauntless-revived:\/\/join\/?\?/i.exec(raw);
 if(!prefix||raw.includes('#'))throw Error('Cole o link completo dauntless-revived://join?...');
 const q=raw.slice(prefix[0].length),pairs=new Map();
 for(const pair of q.split('&')){
  const k=pair.indexOf('=');
  if(k<=0)throw Error('Parâmetros inválidos no convite.');
  const name=pair.slice(0,k);
  if(pairs.has(name)||!V1.has(name)&&!V2.has(name))throw Error('Parâmetro duplicado ou desconhecido.');
  let value;try{value=decodeURIComponent(pair.slice(k+1).replace(/\+/g,' '));}catch{throw Error('Codificação inválida no convite.');}
  pairs.set(name,value);
 }
 const v=pairs.get('v');
 if(v!=='1'&&v!=='2')throw Error('Versão de convite não suportada.');
 const allowed=v==='1'?V1:V2;
 if([...pairs.keys()].some(x=>!allowed.has(x)))throw Error('Parâmetro não permitido para a versão.');
 const host=pairs.get('host')?.toLowerCase();
 if(!validHost(host)||(v==='1'&&!isPrivate(host)))throw Error('Endereço do servidor inválido ou inseguro.');
 const portText=pairs.get('port')||(v==='2'?'443':'');
 if(!/^[1-9][0-9]{0,4}$/.test(portText)||Number(portText)>65535)throw Error('Porta inválida.');
 if(v==='2'&&(pairs.get('mode')!=='public'||!/^[a-f0-9]{64}$/.test(pairs.get('fp')||'')))throw Error('Convite público sem fingerprint TLS válido.');
 if(!/^[A-Za-z0-9-]{4,64}$/.test(pairs.get('code')||''))throw Error('Código de registro inválido.');
 const name=pairs.get('name')?.trim().replace(/\s+/g,' ');
 if(!name||name.length>64||badControl.test(name))throw Error('Nome de servidor inválido.');
 const share=pairs.get('share');
 if(share!==undefined){
  let u;try{u=new URL(share);}catch{throw Error('Link Tailscale inválido.');}
  if(share.length>512||u.protocol!=='https:'||u.hostname!=='login.tailscale.com'||u.username||u.password||u.port)throw Error('Compartilhamento Tailscale inválido.');
 }
 return {mode:v==='2'?'public':'private',version:Number(v),host,port:Number(portText),
  fingerprint:v==='2'?pairs.get('fp'):null,code:pairs.get('code'),name,share:share||null};
}
function safeSummary(invite){
 return {mode:invite.mode,version:invite.version,host:invite.host,port:invite.port,
  name:invite.name,usesTailscale:invite.mode==='private',
  fingerprintShort:invite.fingerprint?invite.fingerprint.slice(0,10)+'…'+invite.fingerprint.slice(-8):null};
}
module.exports={parseRevivedInvite,safeSummary,isPrivate};
