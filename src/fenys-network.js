'use strict';
const net=require('node:net');
const {parseServerAddress}=require('./fenys-api');
function lanIP(host){if(net.isIP(host)!==4)return false;const [a,b]=host.split('.').map(Number);return a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168);}
function publicIP(host){if(net.isIP(host)!==4)return false;const [a,b]=host.split('.').map(Number);return !lanIP(host)&&a>0&&a<224&&a!==127&&!(a===169&&b===254)&&!(a===100&&b>=64&&b<=127);}
function parseEndpoint(value){
 const input=String(value??'').trim();
 if(input.startsWith('https://')){
  // Require canonical origins: no credentials, paths, query, fragments or URL parser tricks.
  if(!/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(input))throw Error('Use somente https://dominio:porta, sem caminho ou credenciais.');
  const u=new URL(input),host=u.hostname,port=Number(u.port||443);
  if(!port||port>65535||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||(!net.isIP(host)&&(!host.includes('.')||host.length>253||!host.split('.').every(s=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(s)))))throw Error('Domínio HTTPS inválido.');
  if(net.isIP(host)&&!publicIP(host))throw Error('O endpoint HTTPS público precisa de IP público ou domínio.');
  return {host,port,local:false,address:u.origin,secure:true};
 }
 const m=/^([0-9.]+)(?::([0-9]{1,5}))?$/.exec(input);
 if(m&&lanIP(m[1])){const port=Number(m[2]||61000);if(!port||port>65535)throw Error('Porta inválida.');return {host:m[1],port,local:false,address:m[1]+':'+port,lan:true};}
 return parseServerAddress(input);
}
function origin(value){const p=parseEndpoint(value);return p.secure?p.address:'http://'+p.address;}
function lanRequest(req){const ip=String(req.socket?.remoteAddress||'').replace(/^::ffff:/,'');return lanIP(ip)&&!Object.keys(req.headers).some(k=>['via','forwarded','x-real-ip','x-dauntless-gateway'].includes(k)||k.startsWith('x-forwarded-'));}
module.exports={parseEndpoint,origin,lanIP,publicIP,lanRequest};
