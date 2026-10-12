'use strict';
const $=id=>document.getElementById(id);
const controlIds=['play','start','stop','restart','start2','stop2','restart2','refresh'];
const screens={dashboard:'VISÃO GERAL',services:'CENTRAL DO SERVIDOR',players:'JOGADORES ONLINE',invites:'CONVITES',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
let operating=false;
function note(s){const text=String(s);$('feedback').textContent=text;const el=$('activity');el.textContent=`[${new Date().toLocaleTimeString('pt-BR')}] ${text}\n`+el.textContent;}
function paint(s){for(const [key,primary,secondary] of [['metagame','metagame','metagame-service'],['deploy','deploy','deploy-service']]){const online=Boolean(s[key]);const el=$(primary);el.textContent=online?'Online':'Offline';el.className='metric-value '+(online?'online':'offline');const sub=$(secondary);sub.textContent=online?'Online':'Offline';sub.className='state'+(online?' on':'');}
 const owned=Array.isArray(s.owned)?s.owned:[];$('service-detail').textContent=owned.length?`Processos gerenciados nesta sessão: ${owned.join(', ')}.`:'Nenhum processo gerenciado nesta sessão. Serviços externos não podem ser desligados por este painel.';
 const canStop=owned.length>0;for(const id of ['stop','stop2','restart','restart2'])$(id).disabled=!canStop||operating;
}
async function refresh(){try{paint(await window.launcher.status());}catch(e){note('Falha na verificação: '+e.message);}}
async function settings(){try{const c=await window.launcher.getSettings();$('repo').textContent=c.repoPath;$('exe').textContent=c.launcherExe||'Não configurado';}catch(e){note('Falha ao obter configurações: '+e.message);}}
async function action(type){if(operating)return; if((type==='stop'||type==='restart')&&!window.confirm(type==='stop'?'Desligar os serviços iniciados por este launcher?':'Reiniciar os serviços iniciados por este launcher?'))return;
 operating=true;for(const id of controlIds)$(id).disabled=true;
 const labels={play:'Preparando abertura do jogo…',start:'Iniciando serviços…',stop:'Encerrando serviços locais…',restart:'Reiniciando serviços…'};note(labels[type]);
 try{const result=await window.launcher[type]();if(!result.ok)throw new Error(result.error||'Operação não concluída');paint(result.status);note(({play:'Launcher do jogo aberto.',start:'Serviços iniciados ou já disponíveis.',stop:'Processos gerenciados encerrados.',restart:'Serviços reiniciados.'})[type]);}catch(e){note('Atenção: '+e.message);}finally{operating=false;for(const id of controlIds)$(id).disabled=false;await refresh();}}
async function refreshInvites(){
 const badge=$('invite-api-status'),msg=$('invite-message'),btn=$('invite-generate');
 badge.textContent='VERIFICANDO API';btn.disabled=true;
 try{
  const r=await window.launcher.inviteStatus();
  if(!r.ok)throw new Error(r.error||'API indisponível');
  if(r.registrationMode!=='INVITECODE'){
   badge.textContent='CADASTRO FECHADO';
   msg.textContent='API online, mas REGISTRATION_MODE='+r.registrationMode+'. Configure INVITECODE no Metagame.';
   return;
  }
  badge.textContent='API CONECTADA';
  msg.textContent='Metagame conectado. Para gerar, selecione sua account.key de administrador se solicitado.';
  btn.disabled=false;
 }catch(e){badge.textContent='API OFFLINE';msg.textContent=e.message;}
}
async function showVersion(){
 try{const version=await window.launcher.getVersion();$('app-version').textContent='FENYS • v'+version;$('top-version').textContent='LAUNCHER v'+version;}
 catch{$('app-version').textContent='FENYS • versão indisponível';}
}
function setScreen(name){for(const [key,label] of Object.entries(screens)){const selected=key===name;const section=$('screen-'+key);section.hidden=!selected;section.classList.toggle('active',selected);document.querySelector(`[data-screen="${key}"]`).classList.toggle('active',selected);}$('screen-label').textContent=screens[name]||name;if(name==='invites')void refreshInvites();}
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>setScreen(node.dataset.screen));
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{try{await window.launcher.pickRepo();await settings();}catch(e){note(e.message);}});
$('exePick').addEventListener('click',async()=>{try{await window.launcher.pickLauncher();await settings();}catch(e){note(e.message);}});
$('clear').addEventListener('click',()=>{$('activity').textContent='';});
$('invite-generate').addEventListener('click',async()=>{
 const btn=$('invite-generate'),msg=$('invite-message');
 btn.disabled=true;msg.textContent='Solicitando convite ao Metagame…';
 try{
  const r=await window.launcher.createInvite($('invite-name').value);
  if(!r.ok)throw new Error(r.error||'Falha ao criar convite.');
  $('invite-code').value=r.code;
  msg.textContent='Convite criado! Copie o código acima e envie ao jogador. Uso único.';
  note('Convite criado pelo Metagame (código oculto no histórico).');
 }catch(e){msg.textContent='Não foi possível gerar: '+e.message;note('Convite: '+e.message);}
 finally{btn.disabled=false;}
});
window.launcher.onActivity(note);
settings();refresh();showVersion();setInterval(()=>{if(!operating)void refresh();},10000);
