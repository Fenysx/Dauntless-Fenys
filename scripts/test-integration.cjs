'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=path.join(root,'server/upstream'),target=path.join(root,'test-upstream');
if(fs.existsSync(target))throw Error('test-upstream já existe. Use um checkout limpo para evitar modificar uma instalação existente.');
if(!fs.existsSync(source))throw Error('server/upstream ausente. Atualize o checkout.');
if(!process.env.npm_execpath)throw Error('Execute por npm run test:integration.');
fs.cpSync(source,target,{recursive:true});
function run(args,cwd){const r=spawnSync(process.execPath,args,{cwd,stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exit(r.status||1);}
run([process.env.npm_execpath,'ci'],path.join(target,'UndauntedMetagame'));
run([process.env.npm_execpath,'ci'],path.join(target,'UndauntedDeployServer'));
run([process.env.npm_execpath,'run','build'],path.join(target,'UndauntedDeployServer'));
for(const name of ['host','cloud','google'])run(['test/integration-'+name+'.cjs'],root);

for(const mode of ['lan','public']){process.env.DLU_TEST_NETWORK=mode;run(['test/integration-google.cjs'],root);}
