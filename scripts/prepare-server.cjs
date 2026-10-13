'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),source=path.join(root,'server/upstream');
const target=path.resolve(process.argv[2]||path.join(root,'runtime/server'));
if(!fs.existsSync(path.join(source,'UndauntedMetagame/package-lock.json')))throw Error('A cópia server/upstream está ausente. Atualize o checkout do projeto.');
if(fs.existsSync(target))throw Error('O destino já existe. Preserve a instalação e escolha uma pasta nova; nenhuma configuração foi alterada.');
if(!process.env.npm_execpath)throw Error('Execute por npm run server:prepare -- [destino].');
fs.mkdirSync(path.dirname(target),{recursive:true});
fs.cpSync(source,target,{recursive:true,filter:p=>!path.relative(source,p).split(path.sep).some(n=>['node_modules','dist','build','fenys','fenys-backups','.env'].includes(n))});
for(const component of ['UndauntedMetagame','UndauntedDeployServer']){
 const cwd=path.join(target,component);
 for(const args of [['ci'],['run','build']]){
  const r=spawnSync(process.execPath,[process.env.npm_execpath,...args],{cwd,stdio:'inherit'});
  if(r.error)throw r.error;
  if(r.status!==0)throw Error(`${component}: npm ${args.join(' ')} falhou. A cópia foi preservada em ${target}; consulte docs/INSTALACAO.md.`);
 }
}
console.log('Serviços compilados em '+target+'\nConfigure os arquivos .env e o jogo conforme docs/INSTALACAO.md antes de iniciar.');
