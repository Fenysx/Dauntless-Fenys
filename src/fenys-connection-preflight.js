'use strict';
// Network detection only. No router changes, open ports, credentials or cloud writes.
const os=require('node:os'),crypto=require('node:crypto'),dgram=require('node:dgram'),dns=require('node:dns');
const {lanIP,publicIP}=require('./fenys-network');
const MAGIC=0x2112a442, PORT=19302;
function localNetworks(interfaces=os.networkInterfaces()){
 const addresses=[];
 for(const [name,records] of Object.entries(interfaces||{}))
  for(const item of records||[]){
   const ip=item?.address;
   if(item.family!=='IPv4'||item.internal||!lanIP(ip))continue;
   if(!addresses.some(x=>x.address===ip))addresses.push({name,address:ip});
  }
 const score=name=>/^(wi-?fi|wlan|wireless)/i.test(name)?0:/^(ethernet|eth)/i.test(name)?1:/^(vEthernet|virtual|vmware|virtualbox|docker|tailscale|zerotier)/i.test(name)?4:2;
 addresses.sort((a,b)=>score(a.name)-score(b.name)||a.address.localeCompare(b.address));
 return addresses;
}
function readStunResponse(data,transaction){
 if(!Buffer.isBuffer(data)||data.length<20||data.readUInt16BE(0)!==0x0101||data.readUInt32BE(4)!==MAGIC||!data.subarray(8,20).equals(transaction))return null;
 const end=Math.min(data.length,20+data.readUInt16BE(2));
 for(let i=20;i+4<=end;){
  const kind=data.readUInt16BE(i),length=data.readUInt16BE(i+2);i+=4;
  if(length>end-i)break;
  if((kind===0x0020||kind===0x0001)&&length>=8&&data[i+1]===1){
   const bytes=[...data.subarray(i+4,i+8)];
   if(kind===0x0020){const mask=[0x21,0x12,0xa4,0x42];for(let n=0;n<4;n++)bytes[n]^=mask[n];}
   const ip=bytes.join('.');
   if(publicIP(ip))return ip;
  }
  i+=(length+3)&~3;
 }
 return null;
}
async function publicIPv4({hostname='stun.l.google.com',port=PORT,timeout=3200,lookup=dns.promises.lookup,socketFactory=()=>dgram.createSocket('udp4')}={}){
 let target;
 try{target=await lookup(hostname,{family:4});}catch{return null;}
 if(!target?.address)return null;
 const transaction=crypto.randomBytes(12),packet=Buffer.alloc(20);
 packet.writeUInt16BE(0x0001,0);packet.writeUInt32BE(MAGIC,4);transaction.copy(packet,8);
 return new Promise(resolve=>{
  const socket=socketFactory();let done=false,timer;
  const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{socket.close();}catch{}resolve(value);};
  timer=setTimeout(()=>finish(null),timeout);
  socket.once('error',()=>finish(null));
  socket.on('message',message=>{const ip=readStunResponse(message,transaction);if(ip)finish(ip);});
  try{socket.send(packet,port,target.address,error=>{if(error)finish(null);});}catch{finish(null);}
 });
}
async function diagnose(options={}){
 const networks=localNetworks(options.interfaces),external=await publicIPv4(options.stun||{});
 return {
  addresses:networks.map(x=>x.address),
  preferred:networks[0]?.address||null,
  publicIPv4:external,
  detectedBy:'STUN',
  // A NAT address is not proof the host is reachable or that UDP ports are forwarded.
  internetReady:false,
  udpVerified:false,
  message:networks.length?'Endereço deste PC detectado. O acesso pela internet ainda exige um host público ou relay UDP e verificação de portas.':'Nenhum IPv4 de rede local encontrado; verifique Wi-Fi ou Ethernet.'
 };
}
function resetConnectionPreferences(config,{hasActiveGoogleHost=false}={}){
 // Preserve Google player/host identity and progress. Never delete account or admin keys.
 const next={...config};
 const removed=[];
 for(const key of ['tailscaleAddress','tailscaleIp','tailscaleIP','vpnAddress','vpnIp','vpnIP','legacyNetworkMode','legacyServerAddress']){
  if(Object.hasOwn(next,key)){delete next[key];removed.push(key);}
 }
 if(!hasActiveGoogleHost&&!next.googleSelected&&!next.cloudRole){
  if(next.gameServer&&next.gameServer!=='127.0.0.1:61000'){next.gameServer='127.0.0.1:61000';removed.push('gameServer (redefinido para local)');}
 }
 return {config:next,removed};
}
module.exports={localNetworks,readStunResponse,publicIPv4,diagnose,resetConnectionPreferences};
