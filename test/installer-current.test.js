'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('atualizador permanente le a versao do package.json, nao uma beta fixa',()=>{
 const installer=read('scripts/instalar-ultima-versao.cjs');
 assert.match(installer,/const version=require\(path\.join\(root,'package\.json'\)\)\.version/);
 assert.match(installer,/Dauntless-ultima-versao\.log/);
 assert.match(installer,/await run\('npm test',\['test'\]\)/);
 assert.match(installer,/await run\('npm run build:win',\['run','build:win'\]\)/);
 assert.match(installer,/matches=all\.filter\(x=>x\.version===version&&fs\.existsSync\(x\.exe\)\)/);
 assert.doesNotMatch(installer,/beta\.10 nao encontrada|const version='1\.8\.0-beta\./);
});
test('comando Windows sempre atualiza main e executa verificador dinamico',()=>{
 const cmd=read('scripts/Instalar-ultima-versao.cmd');
 assert.match(cmd,/git pull --ff-only origin main/);
 assert.match(cmd,/scripts\\instalar-ultima-versao\.cjs/);
 assert.match(cmd,/git diff --quiet/);
 assert.match(cmd,/git diff --cached --quiet/);
 assert.doesNotMatch(cmd,/instalar-beta1[0-9]-verificado/);
});
