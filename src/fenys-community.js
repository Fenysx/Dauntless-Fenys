'use strict';
const {URL,KEY}=require('./fenys-google-auth');
const ENDPOINT=URL+'/functions/v1/fenys-community';
const OPERATIONS=new Set(['list','inbox','access','register','username','invite','decide','revoke']);
async function community(operation,fields={},token,fetchImpl=fetch){
 if(!OPERATIONS.has(operation))throw Error('Operação de comunidade inválida.');
 if(typeof token!=='string'||!token)throw Error('Entre com Google para acessar os servidores da comunidade.');
 const response=await fetchImpl(ENDPOINT,{
  method:'POST',headers:{apikey:KEY,'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({operation,...fields}),redirect:'error',signal:AbortSignal.timeout(20000)
 });
 const raw=await response.text();
 if(raw.length>65536)throw Error('A comunidade retornou uma resposta muito grande.');
 let result;try{result=JSON.parse(raw);}catch{throw Error('Serviço da comunidade indisponível. Os dados do personagem não foram alterados.');}
 if(!response.ok)throw Error(typeof result.error==='string'?result.error:'Serviço da comunidade indisponível.');
 return result;
}
module.exports={community,ENDPOINT,OPERATIONS};
