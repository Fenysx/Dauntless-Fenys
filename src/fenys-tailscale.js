'use strict';
// Read-only Tailscale detection. No login, network, firewall or saved-game mutation.
const os=require('node:os'),path=require('node:path'),net=require('node:net');
const {execFile}=require('node:child_process');
function validTailIP(ip){
 if(net.isIP(String(ip))!==4)return false;
 const [a,b]=ip.split('.').map(Number);
 return a===100&&b>=64&&b<=127;
}
function adapters(interfaces=os.networkInterfaces()){
 const out=[];
 for(const [name,items] of Object.entries(interfaces||{}))
  for(const x of items||[])if(x?.family==='IPv4'&&!x.internal&&validTailIP(x.address)&&/tailscale/i.test(name))
   out.push(x.address);
 return [...new Set(out)];
}
function parseStatus(value,localIPs){
 const status=typeof value==='string'?JSON.parse(value):value;
 const candidates=Array.isArray(status?.Self?.TailscaleIPs)?status.Self.TailscaleIPs.filter(validTailIP):[];
 const online=status?.BackendState==='Running';
 const address=online?candidates.find(ip=>localIPs.includes(ip))||null:null;
 return {connected:!!address,address,backendState:typeof status?.BackendState==='string'?status.BackendState:'Unknown',hasAdapter:localIPs.length>0};
}
function cli(executable,execFileImpl=execFile){
 return new Promise((resolve,reject)=>execFileImpl(executable,['status','--json'],{encoding:'utf8',timeout:4500,maxBuffer:1024*1024,windowsHide:true},(error,stdout)=>error?reject(error):resolve(String(stdout))));
}
async function inspect({interfaces=os.networkInterfaces(),execFileImpl=execFile,platform=process.platform,env=process.env}={}){
 const ips=adapters(interfaces);
 const binaries=['tailscale'];
 if(platform==='win32'){
  const p=env.ProgramFiles||'C:\\Program Files';
  binaries.push(path.win32.join(p,'Tailscale','tailscale.exe'));
 }
 for(const bin of [...new Set(binaries)]){
  try{
   const status=parseStatus(await cli(bin,execFileImpl),ips);
   return {...status,installed:true,addresses:ips,
    message:status.connected?'Tailscale conectado. Host privado pode usar '+status.address+':61000.':
      status.backendState==='Running'?'Tailscale está ligado, mas o IP da interface não confere. Reinicie o Tailscale e atualize.':
      'Tailscale está instalado, mas não conectado. Abra o Tailscale e entre na sua conta.'};
  }catch{}
 }
 return {installed:false,connected:false,address:null,addresses:ips,backendState:'Unavailable',
  hasAdapter:ips.length>0,message:'Tailscale não respondeu. Instale ou abra o Tailscale e entre na conta; depois clique em Verificar Tailscale.'};
}
module.exports={validTailIP,adapters,parseStatus,inspect};
