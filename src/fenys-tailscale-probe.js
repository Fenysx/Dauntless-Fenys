'use strict';
// Client-side, read-only reachability test for a privately shared Tailscale host.
// Never transmit player tokens or native admin keys; limit destination to tailnet IP:61000.
const net=require('node:net');
const {validTailIP}=require('./fenys-tailscale');
function parseAddress(value){
 const input=String(value||'').trim();
 const m=/^(100\.(?:\d{1,3}\.){2}\d{1,3})(?::(61000))?$/.exec(input);
 if(!m||!validTailIP(m[1]))throw Error('Informe apenas o IP Tailscale do anfitrião (100.64.0.0 a 100.127.255.255), com porta 61000.');
 return {ip:m[1],address:m[1]+':61000'};
}
function reachTcp(ip,{createConnection=net.createConnection,timeout=3500}={}){
 return new Promise(resolve=>{
  let socket,ended=false;
  const finish=value=>{if(ended)return;ended=true;try{socket?.destroy()}catch{}resolve(value)};
  try{
   socket=createConnection({host:ip,port:61000});
   socket.setTimeout(timeout);
   socket.once('connect',()=>finish(true));
   socket.once('error',()=>finish(false));
   socket.once('timeout',()=>finish(false));
  }catch{finish(false)}
 });
}
async function probe(address,{checkTailscale,reach=reachTcp,fetchImpl=fetch}={}){
 const destination=parseAddress(address);
 if(typeof checkTailscale!=='function')throw Error('Verificação Tailscale indisponível.');
 const vpn=await checkTailscale();
 if(!vpn?.connected)return {address:destination.address,vpnConnected:false,tcpOnline:false,googleReady:false,
  message:'O Tailscale deste PC está desconectado. Entre na sua conta, aceite o compartilhamento do host e teste novamente.'};
 const tcpOnline=await reach(destination.ip);
 if(!tcpOnline)return {address:destination.address,vpnConnected:true,tcpOnline:false,googleReady:false,
  message:'Tailscale conectado, mas a porta TCP 61000 do host não responde. Confira se o anfitrião compartilhou este dispositivo, se o Metagame está ligado e se o firewall permite acesso somente pela rede Tailscale.'};
 try{
  const response=await fetchImpl('http://'+destination.address+'/launcher/google/status',{
   method:'GET',redirect:'error',signal:AbortSignal.timeout(6000),
   headers:{accept:'application/json'}
  });
  if(!response.ok)throw Error('HTTP '+response.status);
  const raw=await response.text();
  if(raw.length>8192)throw Error('Resposta muito grande.');
  const caps=JSON.parse(raw);
  if(caps?.mode==='google'&&caps.registered===true)return {address:destination.address,vpnConnected:true,tcpOnline:true,googleReady:true,
   message:'O Metagame e a integração Google responderam pelo Tailscale. Peça o convite DLU3 e faça uma partida de teste: as portas UDP ainda não foram verificadas.'};
  return {address:destination.address,vpnConnected:true,tcpOnline:true,googleReady:false,
   message:'A porta TCP do host respondeu, mas a integração Google não está registrada. O anfitrião precisa ativar Google em Hospedar servidor antes de gerar o convite DLU3.'};
 }catch{
  return {address:destination.address,vpnConnected:true,tcpOnline:true,googleReady:false,
   message:'O Metagame responde na porta TCP 61000, mas a rota Google não respondeu corretamente. Peça ao anfitrião para verificar a integração e os logs; seu personagem não foi alterado.'};
 }
}
module.exports={parseAddress,reachTcp,probe};
