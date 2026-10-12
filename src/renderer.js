'use strict';
const $=id=>document.getElementById(id);
const controlIds=['play','start','stop','restart','start2','stop2','restart2','refresh'];
const screens={dashboard:'VISÃO GERAL',services:'CENTRAL DO SERVIDOR',players:'JOGADORES ONLINE',invites:'CONVITES',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
let operating=false;
function note(s){const text=String(s);$('feedback').textContent=text;const el=$('activity');el.textContent=`[${new Date().toLocaleTimeString('pt-BR')}] ${text}\n`+el.textContent;}
function paint(s){for(const [key,primary,secondary] of [['metagame','metagame','metagame-service'],['deploy','deploy','deploy-service']]){const online=Boolean(s[key]);const el=$(primary);el.textContent=online?'Online':'Offline';el.className='metric-value '+(online?'online':'offline');const sub=$(secondary);sub.textContent=online?'Online':'Offline';sub.className='state'+(online?' on':'');}
 const owned=Array.isArray(s.owned)?s.owned:[];$('service-detail').textContent=owned.length?`Processos gerenciados nesta sessão: ${owned.join(', ')}.`:'Nenhum processo gerenciado nesta sessão. Serviços externos não podem ser desligados por este painel.';
 const canStop=owned.length>0&&!s.remote;
 for(const id of ['stop','stop2','restart','restart2'])$(id).disabled=!canStop||operating;
 for(const id of ['start','start2'])$(id).disabled=Boolean(s.remote)||operating;
 if(s.remote){
  $('service-detail').textContent='Modo jogador: conexão remota com '+s.server+'. Os controles de servidor ficam desativados.';
  for(const id of ['deploy','deploy-service']){const el=$(id);el.textContent='Somente host';}
 }
}
async function refresh(){try{paint(await window.launcher.status());}catch(e){note('Falha na verificação: '+e.message);}}
async function settings(){
 try{
  const c=await window.launcher.getSettings();
  $('repo').textContent=c.repoPath;
  $('exe').textContent=c.launcherExe||'Não configurado';
  $('serverAddress').value=c.gameServer||'127.0.0.1:61000';
  $('adminKeyState').textContent=c.adminKeySelected?'Chave selecionada':'Não selecionada';
 }catch(e){note('Falha ao obter configurações: '+e.message);}
}
async function action(type){if(operating)return; if((type==='stop'||type==='restart')&&!window.confirm(type==='stop'?'Desligar os serviços iniciados por este launcher?':'Reiniciar os serviços iniciados por este launcher?'))return;
 operating=true;for(const id of controlIds)$(id).disabled=true;
 const labels={play:'Preparando abertura do jogo…',start:'Iniciando serviços…',stop:'Encerrando serviços locais…',restart:'Reiniciando serviços…'};note(labels[type]);
 try{const result=await window.launcher[type]();if(!result.ok)throw new Error(result.error||'Operação não concluída');paint(result.status);note(({play:'Launcher do jogo aberto.',start:'Serviços iniciados ou já disponíveis.',stop:'Processos gerenciados encerrados.',restart:'Serviços reiniciados.'})[type]);}catch(e){note('Atenção: '+e.message);}finally{operating=false;for(const id of controlIds)$(id).disabled=false;await refresh();}}
function setScreen(name){for(const [key,label] of Object.entries(screens)){const selected=key===name;const section=$('screen-'+key);section.hidden=!selected;section.classList.toggle('active',selected);document.querySelector(`[data-screen="${key}"]`).classList.toggle('active',selected);}$('screen-label').textContent=screens[name]||name;}
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>setScreen(node.dataset.screen));
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{try{await window.launcher.pickRepo();await settings();}catch(e){note(e.message);}});
$('exePick').addEventListener('click',async()=>{try{await window.launcher.pickLauncher();await settings();}catch(e){note(e.message);}});
$('serverSave').addEventListener('click',async()=>{
 try{
  const result=await window.launcher.setServer($('serverAddress').value);
  note('Servidor configurado: '+result.server);
  await settings();await refresh();
 }catch(e){note('Atenção: '+e.message);}
});
$('adminKeyPick').addEventListener('click',async()=>{
 try{await window.launcher.pickAdminKey();await settings();}catch(e){note('Atenção: '+e.message);}
});
$('invite-create').addEventListener('click',async()=>{
 const button=$('invite-create');button.disabled=true;
 $('invite-result').value='';
 try{
  const result=await window.launcher.createInvite($('invite-name').value);
  if(!result.ok)throw new Error(result.error);
  $('invite-result').value=result.code;
  note('Convite de uso único criado. Envie o código em particular ao seu amigo.');
 }catch(e){note('Atenção: '+e.message);}
 finally{button.disabled=false;}
});
$('register-submit').addEventListener('click',async()=>{
 const button=$('register-submit');button.disabled=true;
 try{
  const result=await window.launcher.register($('register-username').value,$('register-invite').value);
  if(!result.ok)throw new Error(result.error);
  $('register-invite').value='';
  note('Conta '+result.username+' criada e chave salva neste computador. Agora configure o jogo e clique JOGAR.');
 }catch(e){note('Atenção: '+e.message);}
 finally{button.disabled=false;}
});
$('clear').addEventListener('click',()=>{$('activity').textContent='';});
window.launcher.onActivity(note);
settings();refresh();setInterval(()=>{if(!operating)void refresh();},10000);
