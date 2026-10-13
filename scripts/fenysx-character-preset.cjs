'use strict';
// Offline owner-only modification of an existing local Dauntless 1.4.4 character.
// Refuses cloud-linked or active sessions; no credentials or online APIs are used.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {createRequire}=require('node:module');
const net=require('node:net');

const RAMS=1_000_000_000_000;
const PLATINUM=10_000_000_000_000;
const TARGET_NAME='Fenysx';
const LEVEL_CAP=50; // 1.4.4 MasteryTrack_PlayerLevel (not a claim of level 100).
const VALID_UID=/^UID-[a-f0-9-]{36}$/i;
const VALID_UUID=/^[a-f0-9-]{36}$/i;

function parseArgs(argv){
 const opts={};
 for(let i=0;i<argv.length;i++){
  if(!argv[i].startsWith('--'))throw Error('Argumento inesperado: '+argv[i]);
  const key=argv[i].slice(2);
  if(['list','apply','server-stopped','accept-client-overflow-risk'].includes(key)){opts[key]=true;continue;}
  if(!['db','metagame','user-id','character-id','confirm'].includes(key)||!argv[i+1]||argv[i+1].startsWith('--'))
   throw Error('Argumento faltando ou desconhecido: --'+key);
  opts[key]=argv[++i];
 }
 return opts;
}
function storeUnlockPlan(catalog,itemKinds){
 if(!Array.isArray(catalog.webstore))throw Error('Catálogo webstore ausente.');
 const stacked=new Map(),instanced=new Set(),entitlements=new Set();
 for(const offer of catalog.webstore){
  if(!offer||typeof offer.id!=='string')throw Error('Oferta inválida.');
  // Repeatable purchases are consumables, not permanent "all owned" unlocks.
  if(offer.id==='bundle_currency_bounty_small')continue;
  for(const item of offer.items||[]){
   if(typeof item.catalogId!=='string'||!item.catalogId)throw Error('Item sem catálogo.');
   if(itemKinds[item.catalogId]==='stacked')stacked.set(item.catalogId,Math.max(stacked.get(item.catalogId)||0,1));
   else if(itemKinds[item.catalogId]==='instanced')instanced.add(item.catalogId);
   else throw Error('Tipo desconhecido no catálogo da loja: '+item.catalogId);
  }
  for(const grant of offer.entitlements||[]){
   if(typeof grant.name!=='string'||!grant.name)throw Error('Entitlement inválido.');
   entitlements.add(grant.name);
  }
 }
 return {stacked,instanced,entitlements};
}
function maxProgression(pathConfig){
 const paths=pathConfig?.payload?.paths;
 if(!Array.isArray(paths)||!paths.some(x=>x.progression_id==='MasteryTrack_PlayerLevel'))
  throw Error('Configuração de progressão 1.4.4 incompatível.');
 return paths.map(p=>{
  if(typeof p.progression_id!=='string'||!Array.isArray(p.requirements))throw Error('Trilha inválida.');
  const progress=p.requirements.reduce((sum,x)=>sum+x.xp_required,0);
  const rank=p.requirements.reduce((max,x)=>Math.max(max,x.rank_id),0);
  if(!Number.isSafeInteger(progress)||progress<0||!Number.isSafeInteger(rank))throw Error('Limite de trilha inválido.');
  return {progressionId:p.progression_id,progress,rank};
 });
}
function mergeStacks(items,changes,exactIds=new Set()){
 if(!Array.isArray(items))throw Error('Inventário empilhável inválido.');
 const result=items.map(item=>({...item}));
 for(const [catalogId,quantity] of changes){
  if(!Number.isSafeInteger(quantity)||quantity<0)throw Error('Quantidade inválida.');
  const matches=result.filter(x=>x.catalogId===catalogId);
  if(matches.length>1)throw Error('Pilha duplicada no inventário: '+catalogId);
  if(matches.length){
   const old=Number(matches[0].quantity);
   if(!Number.isSafeInteger(old)||old<0)throw Error('Quantidade existente inválida em '+catalogId);
   matches[0].quantity=exactIds.has(catalogId)?quantity:Math.max(old,quantity);
  }
  else result.push({catalogId,quantity});
 }
 return result;
}
function mergeInstances(items,catalogIds){
 if(!Array.isArray(items))throw Error('Inventário de instâncias inválido.');
 const result=items.map(item=>({...item}));
 const existing=new Set(result.map(item=>item.catalogId));
 for(const catalogId of catalogIds){
  if(existing.has(catalogId))continue;
  result.push({catalogId,instanceId:crypto.randomBytes(16).toString('hex'),updateVersion:0});
  existing.add(catalogId);
 }
 return result;
}
function requireTable(db,name){
 const row=db.prepare("select name from sqlite_master where type='table' and name=?").get(name);
 if(!row)throw Error('Tabela '+name+' ausente. Não modifique o banco errado.');
}
function characterRow(db,options){
 for(const table of ['users','characters','inventories','progress_tracks','entitlements'])requireTable(db,table);
 const u=db.prepare('SELECT userId,name,isAdmin FROM users WHERE userId=?').get(options['user-id']);
 if(!u)throw Error('UID não encontrado. Use --list antes de aplicar.');
 if(!options['character-id']||!VALID_UUID.test(options['character-id']))throw Error('Informe --character-id do personagem existente.');
 const c=db.prepare('SELECT characterId,userId,name,updateVersion FROM characters WHERE characterId=? and userId=?')
  .get(options['character-id'],u.userId);
 if(!c)throw Error('Character ID não pertence ao UID informado.');
 if(db.prepare('SELECT 1 FROM users WHERE lower(name)=lower(?) and userId<>?').get(TARGET_NAME,u.userId)||
    db.prepare('SELECT 1 FROM characters WHERE lower(name)=lower(?) and userId<>?').get(TARGET_NAME,u.userId))
  throw Error('Já existe Fenysx em outra conta. Não é seguro substituir.');
 if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='launcher_google_sessions'").get()){
  // Local writes after the Google link could be replaced by the canonical cloud revision.
  if(db.prepare('SELECT 1 FROM launcher_google_sessions WHERE userId=?').get(u.userId))
   throw Error('Personagem já possui sessão Google. Altere pela integração autenticada e sincronize a nuvem; não edite SQLite offline.');
 }
 return {user:u,character:c};
}
function verifyRealProgression(metagame){
 const envPath=path.join(metagame,'.env');
 if(!fs.existsSync(envPath))throw Error('Arquivo .env do Metagame não encontrado. Não é possível confirmar o modo de progressão real.');
 const lines=fs.readFileSync(envPath,'utf8').split(/\r?\n/).filter(l=>/^\s*PROGRESSION_MODE\s*=/.test(l));
 const mode=(lines.at(-1)?.split('=').slice(1).join('=')||'real').trim().replace(/^["']|["']$/g,'').toLowerCase();
 if(mode==='stub')throw Error('PROGRESSION_MODE=stub no .env. Com servidor desligado, altere somente essa chave para PROGRESSION_MODE=real antes de aplicar.');
 return mode;
}
function isListeningOnLoopback(port){
 return new Promise(resolve=>{
  const socket=net.createConnection({host:'127.0.0.1',port});
  let completed=false;
  const finish=exists=>{if(completed)return;completed=true;socket.destroy();resolve(exists);};
  socket.setTimeout(1100);
  socket.once('connect',()=>finish(true));
  socket.once('error',()=>finish(false));
  socket.once('timeout',()=>finish(true)); // fail closed on uncertain port state
 });
}
async function assertLocalServicesStopped(){
 for(const port of [61000,61001]){
  if(await isListeningOnLoopback(port))throw Error('Serviço ainda pode estar ativo na porta '+port+'. Pare Metagame e DeployServer antes de alterar o save.');
 }
}
function localClient(metagame){
 const packageJson=path.resolve(metagame,'package.json');
 if(!fs.existsSync(packageJson))throw Error('Pasta Metagame não encontrada: '+packageJson);
 return createRequire(packageJson)('better-sqlite3');
}
async function run(argv){
 const o=parseArgs(argv);
 if(!o.db||!o.metagame)throw Error('Use --db CAMINHO_DO_SQLITE --metagame CAMINHO_DO_UNDAUNTEDMETAGAME.');
 const dbFile=path.resolve(o.db),metagame=path.resolve(o.metagame);
 if(!fs.statSync(dbFile).isFile())throw Error('Arquivo informado não é um banco SQLite.');
 const DB=localClient(metagame);
 const catalog=JSON.parse(fs.readFileSync(path.join(metagame,'src/vendor/store_catalog.json'),'utf8'));
 const kinds=JSON.parse(fs.readFileSync(path.join(metagame,'src/vendor/store_item_kinds.json'),'utf8'));
 const config=JSON.parse(fs.readFileSync(path.join(metagame,'src/vendor/progression_config.json'),'utf8'));
 const store=storeUnlockPlan(catalog,kinds),tracks=maxProgression(config);
 const level=tracks.find(t=>t.progressionId==='MasteryTrack_PlayerLevel');
 if(level.rank!==LEVEL_CAP)throw Error('Limite inesperado do cliente. Pare e revise a versão do Metagame.');
 const db=new DB(dbFile,{fileMustExist:true,readonly:!o.apply});
 try{
  if(o.list){
   for(const table of ['users','characters'])requireTable(db,table);
   const rows=db.prepare('SELECT u.userId,u.name as accountName,c.characterId,c.name as characterName FROM users u JOIN characters c ON c.userId=u.userId ORDER BY u.name,c.name').all();
   return {mode:'list',characters:rows};
  }
  if(!VALID_UID.test(o['user-id']||''))throw Error('Use um UID completo de sua conta com --user-id.');
  const original=characterRow(db,o);
  const inv=db.prepare('SELECT characterId,stackedItems,instancedItems FROM inventories WHERE characterId=?').get(original.character.characterId);
  if(!inv)throw Error('Inventário atual ausente. Recusando criar/substituir um inventário vazio.');
  // Abort before any mutation if the existing data is malformed.
  const currentStacks=JSON.parse(inv.stackedItems),currentInstances=JSON.parse(inv.instancedItems);
  const requested=new Map([...store.stacked,['CURRENCY_NOTES',RAMS],['CURRENCY_PLATINUM',PLATINUM],['CURRENCY_PLATINUM_UNIV',PLATINUM]]);
  const nextStacks=mergeStacks(currentStacks,requested,new Set(['CURRENCY_NOTES','CURRENCY_PLATINUM','CURRENCY_PLATINUM_UNIV'])),nextInstances=mergeInstances(currentInstances,store.instanced);
  const plan={mode:o.apply?'apply':'preview',name:TARGET_NAME,userId:original.user.userId,characterId:original.character.characterId,
   requestedLevel:100,version144SupportedSlayerLevel:LEVEL_CAP,requestedReforgeHearts:100,reforgeAvailable:false,
   rams:RAMS,platinum:PLATINUM,oneTimeStoreStacked:store.stacked.size,
   oneTimeStoreInstanced:store.instanced.size,storeEntitlements:store.entitlements.size,masteryTracks:tracks.length,
   googleCloudSync:'REQUIRED: use Google Link and Sync inside launcher after the host is online',
   supportedItemsOnly:'Catalog 1.4.4; repeatable consumables and unavailable content excluded'};
  if(!o.apply)return plan;
  if(!o['server-stopped']||o.confirm!==TARGET_NAME)
   throw Error('Servidor e jogo devem estar DESLIGADOS. Informe --apply --server-stopped --confirm Fenysx somente após verificar UID e Character ID.');
  verifyRealProgression(metagame);
  await assertLocalServicesStopped();
  if(!o['accept-client-overflow-risk'])
   throw Error('Rams e platina pedidos ultrapassam int32. A versão 1.4.4 pode exibir valores incorretos; acrescente --accept-client-overflow-risk após conferir o backup e aceitar este risco.');
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' and name='fenys_passports'").get()){
   const row=db.prepare('SELECT active FROM fenys_passports WHERE userId=?').get(original.user.userId);
   if(row?.active)throw Error('Transferência ativa detectada. Feche a sessão e faça o backup antes.');
  }
  const check=db.pragma('quick_check',{simple:true});
  if(check!=='ok')throw Error('Integridade do SQLite inválida. Não edite o banco.');
  const backup=dbFile+'.fenysx-before-'+new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite';
  if(fs.existsSync(backup))throw Error('Destino de backup já existe.');
  await db.backup(backup);
  fs.chmodSync(backup,0o600);
  const now=new Date().toISOString();
  const tx=db.transaction(()=>{
   // Revalidate identity under the write transaction, never update a different player.
   characterRow(db,o);
   db.prepare('UPDATE users SET name=? WHERE userId=?').run(TARGET_NAME,original.user.userId);
   db.prepare('UPDATE characters SET name=?,lastModifiedDate=?,updateVersion=updateVersion+1 WHERE characterId=? and userId=?')
     .run(TARGET_NAME,now,original.character.characterId,original.user.userId);
   db.prepare('UPDATE inventories SET stackedItems=?,instancedItems=? WHERE characterId=?')
     .run(JSON.stringify(nextStacks),JSON.stringify(nextInstances),original.character.characterId);
   const grant=db.prepare('INSERT INTO entitlements(accountId,name,activatedDate,duration,source,grantedDate,revokedDate) VALUES(?,?,?,0,?,?,NULL) ON CONFLICT(accountId,name) DO UPDATE SET duration=0,source=excluded.source,grantedDate=excluded.grantedDate,revokedDate=NULL');
   for(const name of store.entitlements)grant.run(original.user.userId,name,now,'admin:fenysx-preset',now);
   const seed=db.prepare('INSERT INTO progress_tracks(accountId,progressionId,progress,confirmedFreeRank,confirmedPremiumRank,confirmedDate,updatedDate) VALUES(?,?,?,?,?,?,?) ON CONFLICT(accountId,progressionId) DO UPDATE SET progress=max(progress_tracks.progress,excluded.progress), confirmedFreeRank=max(progress_tracks.confirmedFreeRank,excluded.confirmedFreeRank), confirmedPremiumRank=max(progress_tracks.confirmedPremiumRank,excluded.confirmedPremiumRank), confirmedDate=excluded.confirmedDate,updatedDate=excluded.updatedDate');
   for(const p of tracks)seed.run(original.user.userId,p.progressionId,p.progress,p.rank,p.rank,now,now);
  });
  tx.immediate();
  const newInventory=db.prepare('SELECT stackedItems,instancedItems FROM inventories WHERE characterId=?').get(original.character.characterId);
  if(!newInventory)throw Error('Verificação falhou após a alteração. Restaure o backup.');
  const stacks=JSON.parse(newInventory.stackedItems);
  for(const [id,qty] of [['CURRENCY_NOTES',RAMS],['CURRENCY_PLATINUM',PLATINUM],['CURRENCY_PLATINUM_UNIV',PLATINUM]]){
   if(stacks.find(s=>s.catalogId===id)?.quantity!==qty)throw Error('Verificação de moeda falhou para '+id+'. Restaure o backup.');
  }
  const sanity=db.pragma('quick_check',{simple:true});
  if(sanity!=='ok')throw Error('Falha de integridade após gravar. Restaure o backup.');
  return {...plan,backup,verified:true,warning:'O patch local NÃO autentica no Google nem publica snapshot na nuvem. Depois de ativar o host, vincule a conta Google real e confirme revisão de save.'};
 }finally{db.close();}
}
if(require.main===module){
 run(process.argv.slice(2)).then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n');},error=>{
  console.error('Não executado: '+error.message);
  process.exitCode=1;
 });
}
module.exports={RAMS,PLATINUM,TARGET_NAME,LEVEL_CAP,parseArgs,storeUnlockPlan,maxProgression,mergeStacks,mergeInstances,verifyRealProgression,isListeningOnLoopback,assertLocalServicesStopped,run};
