'use strict';
// Comunicação apenas com o Metagame local ou pela rede privada Tailscale.
const net=require('node:net');
function serverAddress(value){
 const input=String(value||'127.0.0.1:61000').trim();
 if(!/^[a-zA-Z0-9.-]+(?::[0-9]{1,5})?$/.test(input))throw new Error('Endereço de servidor inválido.');
 const [host,portText]=input.split(':');
 const port=portText?Number(portText):61000;
 const ip=net.isIP(host)===4;
 const parts=host.split('.').map(Number);
 const privateTailnet=ip&&parts[0]===100&&parts[1]>=64&&parts[1]<=127;
 if(!['127.0.0.1','localhost'].includes(host.toLowerCase())&&!privateTailnet&&!/^[a-z0-9.-]+\.ts\.net$/i.test(host))throw new Error('Use localhost ou endereço privado Tailscale.');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Porta inválida.');
 return host+':'+port;
}
function parseServerAddress(value){
 const address=serverAddress(value);
 const host=address.split(':')[0].toLowerCase();
 return {address,host,local:host==='localhost'||host==='127.0.0.1'};
}
async function apiRequest(address,route,{key,method='GET',body}={}){
 if(!/^\/undaunted\/api\/[A-Za-z]+$/.test(route))throw new Error('Rota inválida.');
 const headers={accept:'application/json'};
 if(key)headers['x-undaunted-user-api-key']=key;
 if(body!==undefined)headers['content-type']='application/json';
 let res;
 try{res=await fetch('http://'+serverAddress(address)+route,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});}
 catch{throw new Error('API indisponível. Confira o Metagame na porta 61000.');}
 const raw=await res.text();
 if(raw.length>65536)throw new Error('Resposta da API muito grande.');
 let data={};
 try{data=raw?JSON.parse(raw):{};}catch{throw new Error('Resposta inválida da API.');}
 if(!res.ok){
  const messages={400:'Dados inválidos ou cadastro fechado.',401:'Chave da conta não aceita.',403:'Permissão negada pelo Metagame.',404:'Endpoint não disponível nesta versão do Metagame.',429:'Muitas tentativas. Aguarde.'};
  throw new Error(messages[res.status]||'API respondeu HTTP '+res.status+'.');
 }
 return data;
}
async function inviteStatus(address){
 const data=await apiRequest(address,'/undaunted/api/RegistrationStatus');
 return {online:true,registrationMode:String(data.RegistrationMode||'DESCONHECIDO')};
}
async function createInvite(address,key,description){
 const info=await apiRequest(address,'/undaunted/api/GetUserInfo',{key});
 if(info.IsAdmin!==true)throw new Error('Esta chave não pertence a uma conta administradora no Metagame.');
 const state=await inviteStatus(address);
 if(state.registrationMode!=='INVITECODE')throw new Error('Configure REGISTRATION_MODE=INVITECODE no .env do Metagame e reinicie o servidor.');
 const name=String(description||'').trim();
 if(name.length>64)throw new Error('A descrição deve ter até 64 caracteres.');
 const result=await apiRequest(address,'/undaunted/api/CreateInvite',{key,method:'POST',body:{uses:1,name}});
 if(typeof result.code!=='string'||!/^[A-Z0-9-]{8,32}$/.test(result.code))throw new Error('O servidor não retornou um convite válido.');
 return {code:result.code,uses:1};
}
module.exports={parseServerAddress,requestApi:apiRequest,inviteStatus,createInvite};
