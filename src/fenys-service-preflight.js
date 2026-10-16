'use strict';
// Validate service launch requirements before spawning ANY process.
// Never read or print .env contents, save data or keys.
const fs=require('node:fs'),path=require('node:path');
const SERVICES=[['Metagame','UndauntedMetagame'],['DeployServer','UndauntedDeployServer']];
function verifyServerFiles(root,offline,{existsSync=fs.existsSync}={}){
 const missing=[];
 const requested=SERVICES.filter(([name])=>offline.includes(name));
 for(const [name,folder] of requested){
  const location=path.join(root,folder);
  if(!existsSync(path.join(location,'dist','server.js')))missing.push(name+': dist/server.js ausente');
  if(!existsSync(path.join(location,'.env')))missing.push(name+': .env ausente');
 }
 if(missing.length)throw Error('Servidor não preparado em '+root+'. '+missing.join('; ')+'. Abra Hospedar servidor → Diagnóstico e arquivos do servidor, selecione a pasta correta ou prepare os serviços seguindo docs/INSTALACAO.md. Nenhum save foi modificado.');
 return true;
}
function failureMessage(name,{code,signal,error}={}){
 if(error)return name+': não foi possível iniciar processo Node: '+error;
 if(signal)return name+': processo encerrado por sinal '+signal+'. Consulte Atividades e a configuração do serviço.';
 return name+': processo terminou com código '+String(code??'desconhecido')+'. Consulte Atividades e o diagnóstico do servidor.';
}
module.exports={SERVICES,verifyServerFiles,failureMessage};
