'use strict';
const net=require('node:net');
const {parseServerAddress}=require('./fenys-api');
const listeners=new Set();
function listenPrivate(app,port){
 const ip=process.env.FENYS_TAILSCALE_IP;
 if(!ip||listeners.has(ip+':'+port))return;
 const server=parseServerAddress(ip+':'+port);
 if(server.local||!/^100\./.test(server.host))throw Error('FENYS_TAILSCALE_IP precisa ser um IPv4 do Tailscale.');
 const http=app.listen(port,server.host,error=>{
  if(error)console.error('Fenys: não foi possível escutar no IP Tailscale. Confira a conexão VPN.');
  else console.log('Fenys API privada pronta em '+server.address);
 });
 listeners.add(ip+':'+port);
 // Upstream XMPP binds loopback only; relay its authenticated protocol on the VPN interface.
 if(process.env.CHAT!=='0'||process.env.FENYS_CLOUD_ROLE==='host'){
  const chatPort=Number(process.env.CHAT_PORT||61099);
  const chatTarget=process.env.FENYS_CLOUD_ROLE==='host'?parseServerAddress(process.env.FENYS_CLOUD_CHAT_ADDRESS):{host:'127.0.0.1',port:chatPort};
  const createRelay=()=>net.createServer(socket=>{
   const target=net.connect({host:chatTarget.host,port:chatTarget.port});
   socket.on('error',()=>target.destroy());target.on('error',()=>socket.destroy());
   socket.on('close',()=>target.destroy());target.on('close',()=>socket.destroy());
   socket.pipe(target).pipe(socket);
  });
  const relay=createRelay();
  relay.on('error',()=>console.error('Fenys: chat Tailscale indisponível na porta '+chatPort));
  relay.listen(chatPort,ip);
  http.once('close',()=>relay.close());
  if(process.env.FENYS_CLOUD_ROLE==='host'){
   const local=createRelay();local.on('error',()=>console.error('Fenys: chat global local indisponível.'));local.listen(chatPort,'127.0.0.1');http.once('close',()=>local.close());
  }
 }
 return http;
}
module.exports={listenPrivate};
