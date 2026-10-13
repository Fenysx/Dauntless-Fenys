'use strict';
const http=require('node:http'),https=require('node:https');
const {parseEndpoint}=require('./fenys-network');
const {headers,bridgeUpgrade}=require('./fenys-public-gateway');
async function startRelay(address,{ca,lookup}={}){
 const endpoint=parseEndpoint(address);if(!endpoint.secure)throw Error('A ponte pública exige HTTPS.');
 const sockets=new Set();
 const valid=req=>req.headers.host==='127.0.0.1:'+server.address().port&&!req.headers.origin&&!Object.keys(req.headers).some(k=>k.startsWith('sec-fetch-'));
 const server=http.createServer((req,res)=>{
  if(!valid(req)||!req.url.startsWith('/')||req.url.startsWith('//')){res.writeHead(403);res.end();return;}
  const out=https.request({hostname:endpoint.host,port:endpoint.port,path:req.url,method:req.method,headers:{...headers(req),...(req.url.split('?')[0]==='/candidate/regions'?{'accept-encoding':'identity'}:{})},...(ca?{ca}:{}),...(lookup?{lookup}:{}),timeout:180000},up=>{up.on('error',()=>res.destroy());if(req.url.split('?')[0]==='/candidate/regions'&&up.statusCode===200){let body='';up.on('data',d=>{body+=d;if(body.length>1048576){up.destroy();res.destroy();}});up.on('end',()=>{try{const data=JSON.parse(body);if(!Array.isArray(data.payload?.regionUrls))throw Error('QoS inválido');data.payload.regionUrls=['http://127.0.0.1:'+server.address().port+'/QoS'];res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}catch{res.writeHead(502);res.end();}});}else{res.writeHead(up.statusCode,up.headers);up.pipe(res);}});
  out.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});out.on('timeout',()=>out.destroy());req.on('aborted',()=>out.destroy());res.on('close',()=>out.destroy());req.pipe(out);
 });
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
 server.on('upgrade',(req,socket,head)=>{if(!valid(req)||req.headers.upgrade?.toLowerCase()!=='websocket'){socket.destroy();return;}bridgeUpgrade(req,socket,head,{hostname:endpoint.host,port:endpoint.port,path:'/launcher-chat',secure:true,ca,lookup});});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {address:'127.0.0.1:'+server.address().port,port:server.address().port,close:()=>new Promise(resolve=>{for(const s of sockets)s.destroy();server.close(resolve);})};
}
module.exports={startRelay};
