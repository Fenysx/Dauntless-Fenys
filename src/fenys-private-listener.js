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
 if(process.env.CHAT!=='0'){
  const chatPort=Number(process.env.CHAT_PORT||61099);
  const relay=net.createServer(socket=>{
   const target=net.connect({host:'127.0.0.1',port:chatPort});
   socket.on('error',()=>target.destroy());target.on('error',()=>socket.destroy());
   socket.on('close',()=>target.destroy());target.on('close',()=>socket.destroy());
   socket.pipe(target).pipe(socket);
  });
  relay.on('error',()=>console.error('Fenys: chat Tailscale indisponível na porta '+chatPort));
  relay.listen(chatPort,ip);
  http.once('close',()=>relay.close());
 }
 return http;
}
module.exports={listenPrivate};
