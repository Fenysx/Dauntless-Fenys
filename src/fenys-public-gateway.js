'use strict';
const https=require('node:https'),http=require('node:http'),fs=require('node:fs');
// Deny management routes before Express can decode or normalize them differently.
function allowed(url,method){
 if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//'))return false;
 const raw=url.split('?')[0];let decoded;try{decoded=decodeURIComponent(raw);}catch{return false;}
 if(decoded!==raw||/[\\\x00-\x20]/.test(raw)||raw.includes('//')||raw.split('/').some(x=>x==='.'||x==='..'))return false;
 const p=raw.toLowerCase().replace(/\/$/,'');
 if(p.startsWith('/internal')||p.startsWith('/admin'))return false;
 if(p.startsWith('/launcher'))return (p==='/launcher/google/status'&&method==='GET')||(/^\/launcher\/google\/(link|join|leave)$/.test(p)&&method==='POST');
 if(p.startsWith('/undaunted'))return /^\/undaunted\/api\/(getuserinfo|serverstatus)$/.test(p)&&method==='GET';
 return ['GET','POST','PUT','PATCH','DELETE'].includes(method);
}
function headers(req){const out={};for(const k of ['content-type','content-length','accept','accept-encoding','authorization','x-undaunted-user-api-key','user-agent'])if(req.headers[k])out[k]=req.headers[k];return out;}
function bridgeUpgrade(req,socket,head,{hostname,port,path,secure=false,ca,lookup}){
 const h={...headers(req),connection:'Upgrade',upgrade:'websocket'};
 for(const k of ['sec-websocket-key','sec-websocket-version','sec-websocket-protocol'])if(req.headers[k])h[k]=req.headers[k];
 const out=(secure?https:http).request({hostname,port,path,method:'GET',headers:h,...(ca?{ca}:{}),...(lookup?{lookup}:{}),timeout:15000});
 let peer;
 const close=()=>{out.destroy();peer?.destroy();socket.destroy();};
 out.once('upgrade',(res,remote,extra)=>{peer=remote;const lines=['HTTP/1.1 101 Switching Protocols'];for(const [k,v] of Object.entries(res.headers))if(['upgrade','connection','sec-websocket-accept','sec-websocket-protocol'].includes(k))lines.push(k+': '+v);socket.write(lines.join('\r\n')+'\r\n\r\n');if(extra.length)socket.write(extra);if(head.length)remote.write(head);remote.on('error',close);remote.on('close',()=>socket.destroy());socket.pipe(remote).pipe(socket);});
 out.on('response',close);out.on('error',close);out.on('timeout',close);socket.on('error',close);socket.on('close',()=>{out.destroy();peer?.destroy();});out.end();
}
function createGateway(app,{cert,key,chatPort=61099}){
 const server=https.createServer({cert,key,minVersion:'TLSv1.2'},(req,res)=>{
  if(!allowed(req.url,req.method)){res.writeHead(403);res.end();return;}
  // Origin classification in the upstream forbids admin/game-server credentials through proxies.
  req.headers={...headers(req),host:req.headers.host,...(req.headers['transfer-encoding']?{'transfer-encoding':req.headers['transfer-encoding']}:{}),via:'1.1 dlu-public'};req.dluPublic=true;
  app(req,res);
 });
 server.on('upgrade',(req,socket,head)=>{if(req.url!=='/launcher-chat'||req.headers.upgrade?.toLowerCase()!=='websocket'){socket.destroy();return;}bridgeUpgrade(req,socket,head,{hostname:'127.0.0.1',port:chatPort,path:'/'});});
 server.headersTimeout=15000;server.requestTimeout=180000;
 return server;
}
function listenPublic(app){const s=createGateway(app,{cert:fs.readFileSync(process.env.FENYS_PUBLIC_CERT),key:fs.readFileSync(process.env.FENYS_PUBLIC_KEY),chatPort:Number(process.env.CHAT_PORT||61099)});s.on('error',()=>console.error('Gateway HTTPS indisponível. Confira certificado, chave e porta.'));s.listen(Number(process.env.FENYS_PUBLIC_PORT),'0.0.0.0');return s;}
module.exports={allowed,headers,bridgeUpgrade,createGateway,listenPublic};
