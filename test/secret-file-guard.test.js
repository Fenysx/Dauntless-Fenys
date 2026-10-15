'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const git=(args)=>spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true});

function secretPath(file){
 const p=String(file).replace(/\\/g,'/');
 const parts=p.split('/');
 const name=parts.at(-1)||'';
 if(parts.some(x=>/^(senha|secret|secrets|private|credentials)$/i.test(x)))return true;
 if(/^(client[_-]secrets?.*|service[_-]account.*|credentials|authorization|supabase-authorization|google-host)\.json$/i.test(name))return true;
 if(/^\.env(?:\..*)?$/i.test(name)&&!/\.env\.example$/i.test(name))return true;
 if(/\.(?:key|pem|p8|p12|pfx|keystore|jks|db|sqlite|sqlite3|secret|secrets)$/i.test(name))return true;
 if(/\.(?:db|sqlite|sqlite3)-(?:wal|shm|journal)$/i.test(name))return true;
 return false;
}
test('segredos locais nunca entram no indice Git publico',t=>{
 if(!fs.existsSync(path.join(root,'.git')))return t.skip('Sem checkout Git local; executar nos builds do repositório.');
 const result=git(['ls-files','-z']);
 assert.equal(result.status,0,'Não foi possível listar o índice Git.');
 const paths=result.stdout.split('\0').filter(Boolean);
 const leaked=paths.filter(secretPath);
 assert.deepEqual(leaked,[],'Há arquivos com nomes de credenciais rastreados pelo Git. Nunca exponha seu conteúdo. Remova do índice com git rm --cached e rotacione se já publicados.');
});
test('gitignore bloqueia arquivos sensiveis em qualquer pasta',t=>{
 if(!fs.existsSync(path.join(root,'.git')))return t.skip('Sem checkout Git local.');
 for(const file of [
  'senha/acesso.txt','configs/senha/supabase.txt','client_secret_google.json',
  'configs/client_secret_test.json','config/credentials.json',
  'metagame/.env','metagame/.env.local','metagame/fenys/google-host.json',
  'keys/account.key','google/authorization.json','google/supabase-authorization.json',
  'data/undaunted.db','data/undaunted.db-wal','private/token.pem'
 ]){
  const result=git(['check-ignore','--no-index','-q','--',file]);
  assert.equal(result.status,0,'Caminho sensível não bloqueado pelo .gitignore: '+file);
 }
});
module.exports={secretPath};
