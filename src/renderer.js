'use strict';
const $=id=>document.getElementById(id);
const controlIds=['play','start','stop','restart','start2','stop2','restart2','refresh'];
const screens={dashboard:'VISÃO GERAL',services:'CENTRAL DO SERVIDOR',players:'JOGADORES ONLINE',invites:'CONVITES',connect:'CONECTAR A UM SERVIDOR',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
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
let inviteReady=false;
let inviteBusy=false;
let inviteRequest=0;
function inviteMessage(message,type=''){
 const el=$('invite-message');el.textContent=message;el.className='invite-feedback'+(type?' is-'+type:'');
}
function inviteStatusText(id,text,state=''){
 const el=$(id);el.textContent=text;el.className='invite-status-value'+(state?' is-'+state:'');
}
async function refreshInvites(){
 const request=++inviteRequest;
 const btn=$('invite-generate');
 inviteReady=false;btn.disabled=true;
 inviteStatusText('invite-api-status','Verificando…');
 inviteStatusText('invite-registration-status','Verificando…');
 $('invite-server-description').textContent='Consultando o Metagame na porta configurada.';
 $('invite-registration-description').textContent='Aguardando resposta da API.';
 $('invite-setup').hidden=true;
 if(!inviteBusy)inviteMessage('Verificando a conexão com o servidor…');
 $('invite-refresh').disabled=true;
 try{
  const result=await window.launcher.inviteStatus();
  if(request!==inviteRequest)return;
  if(!result.ok)throw new Error(result.error||'O Metagame não respondeu.');
  inviteStatusText('invite-api-status','Conectado','online');
  $('invite-server-description').textContent='API do Metagame respondendo normalmente.';
  const mode=result.registrationMode;
  if(mode==='INVITECODE'){
   inviteStatusText('invite-registration-status','Somente convite','online');
   $('invite-registration-description').textContent='Novos jogadores precisam de um código válido.';
   inviteReady=true;
   inviteMessage('Tudo pronto. Preencha a identificação, se quiser, e gere um convite.');
  }else{
   const isOpen=mode==='OPEN',closed=mode==='CLOSED';
   inviteStatusText('invite-registration-status',isOpen?'Aberto a todos':closed?'Cadastro desativado':'Modo: '+mode,'warning');
   $('invite-registration-description').textContent=isOpen?'O cadastro está público: jogadores podem se registrar sem convite.':closed?'O servidor não está aceitando novos cadastros.':'O modo atual não permite a geração de convites por esta tela.';
   $('invite-setup').hidden=false;
   $('invite-setup-steps').hidden=false;
   $('invite-setup-title').textContent=isOpen?'Ative o cadastro por convite':'Habilite o modo de convites';
   $('invite-setup-description').textContent=isOpen?'Seu Metagame está online, mas em modo OPEN. Para permitir novos cadastros somente com convite, faça o ajuste no computador do servidor.':'Altere o modo de cadastro no Metagame para INVITECODE antes de gerar códigos.';
   inviteMessage('Geração pausada até o modo de cadastro ser alterado. Seus jogadores existentes não serão apagados.');
  }
 }catch(e){
  if(request!==inviteRequest)return;
  inviteStatusText('invite-api-status','Indisponível','error');
  $('invite-server-description').textContent=e.message;
  inviteStatusText('invite-registration-status','Não verificado');
  $('invite-registration-description').textContent='Conecte-se ao Metagame para consultar o modo de cadastro.';
  $('invite-setup').hidden=true;
  inviteMessage('Não foi possível conectar à API. Confira se o Metagame está ligado.','error');
 }finally{
  if(request===inviteRequest){$('invite-refresh').disabled=false;btn.disabled=!inviteReady||inviteBusy;}
 }
}
async function showVersion(){
 try{const version=await window.launcher.getVersion();$('app-version').textContent='FENYS • v'+version;$('top-version').textContent='LAUNCHER v'+version;}
 catch{$('app-version').textContent='FENYS • versão indisponível';}
}
function setScreen(name){for(const [key,label] of Object.entries(screens)){const selected=key===name;const section=$('screen-'+key);section.hidden=!selected;section.classList.toggle('active',selected);document.querySelector(`[data-screen="${key}"]`).classList.toggle('active',selected);}$('screen-label').textContent=screens[name]||name;if(name==='invites')void refreshInvites();if(name==='connect')void showConnection();}
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>setScreen(node.dataset.screen));
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{try{await window.launcher.pickRepo();await settings();}catch(e){note(e.message);}});
$('exePick').addEventListener('click',async()=>{try{await window.launcher.pickLauncher();await settings();}catch(e){note(e.message);}});
$('clear').addEventListener('click',()=>{$('activity').textContent='';});
$('invite-refresh').addEventListener('click',refreshInvites);
$('invite-generate').addEventListener('click',async()=>{
 if(!inviteReady||inviteBusy)return;
 inviteBusy=true;
 const btn=$('invite-generate'),copy=$('invite-copy');
 btn.disabled=true;copy.disabled=true;
 $('invite-code').value='';
 inviteMessage('Solicitando novo código ao Metagame…');
 try{
  const r=await window.launcher.createInvite($('invite-name').value,$('invite-host').value);
  if(!r.ok)throw new Error(r.error||'Não foi possível gerar o convite.');
  $('invite-code').value=r.code;
  copy.disabled=false;
  inviteMessage('Código Fenys criado! Copie e envie ao jogador. Ele contém um convite de uso único e o endereço do servidor.','success');
  note('Código de conexão Fenys criado para '+r.server+'; o código completo não foi registrado no histórico.');
 }catch(e){
  inviteMessage('Falha ao gerar convite: '+e.message,'error');
  note('Falha ao gerar convite: '+e.message);
 }finally{
  inviteBusy=false;
  btn.disabled=!inviteReady;
 }
});
$('invite-copy').addEventListener('click',async()=>{
 const code=$('invite-code').value;
 if(!code)return;
 try{
  const result=await window.launcher.copyInvite(code);
  if(!result.ok)throw new Error(result.error||'Falha ao copiar.');
  inviteMessage('Código copiado! Envie apenas ao jogador convidado.','success');
 }catch(e){inviteMessage('Não foi possível copiar: '+e.message,'error');}
});
let lastPresenceServer=null;
let lastPlayers=null;
let connectedPlayer=null;
async function showConnection(){
 try{
  const r=await window.launcher.getConnection();
  $('connect-current-server').textContent=r.local?'Meu servidor local':r.server;
  $('connect-current-description').textContent='Destino do botão Jogar Agora: '+r.server;
  $('active-server').textContent='Servidor selecionado: '+r.server;
 }catch(e){$('connect-current-server').textContent='Indisponível';$('connect-current-description').textContent=e.message;}
}
function setConnectionMessage(message,type=''){
 const el=$('connect-message');el.textContent=message;el.className='invite-feedback'+(type?' is-'+type:'');
}
$('connect-submit').addEventListener('click',async()=>{
 const code=$('connect-code').value.trim();
 if(!code){setConnectionMessage('Cole primeiro o código completo enviado pelo anfitrião.','error');return;}
 const btn=$('connect-submit');
 btn.disabled=true;setConnectionMessage('Localizando servidor e conferindo sua conta de jogo…');
 inviteStatusText('connect-state','Verificando…');
 try{
  const r=await window.launcher.joinServer(code);
  if(!r.ok)throw new Error(r.error||'Não foi possível selecionar o servidor.');
  connectedPlayer=r.username;lastPresenceServer=null;lastPlayers=null;
  inviteStatusText('connect-state','Acesso autorizado','online');
  $('connect-state-details').textContent='Conta '+r.username+' reconhecida no Metagame.';
  setConnectionMessage('Servidor '+r.name+' selecionado! Sua conta '+r.username+' foi reconhecida. Clique em Jogar Agora para entrar no jogo.','success');
  note('Servidor selecionado: '+r.name+'. A entrada em jogo será confirmada pela API.');
  await showConnection();
  void refreshPresence();
 }catch(e){
  inviteStatusText('connect-state','Não autorizado','warning');
  $('connect-state-details').textContent='Nenhum servidor foi alterado.';
  setConnectionMessage(e.message,'error');
 }finally{btn.disabled=false;}
});
$('connect-home').addEventListener('click',async()=>{
 const btn=$('connect-home');btn.disabled=true;
 try{
  const r=await window.launcher.goHome();
  if(!r.ok)throw new Error(r.error||'Falha ao voltar.');
  lastPresenceServer=null;lastPlayers=null;connectedPlayer=null;
  inviteStatusText('connect-state','Servidor local','online');
  $('connect-state-details').textContent='Destino restaurado para seu Metagame.';
  setConnectionMessage('Seu servidor local foi selecionado.','success');
  await showConnection();
  void refreshPresence();
 }catch(e){setConnectionMessage(e.message,'error');}
 finally{btn.disabled=false;}
});
async function refreshPresence(){
 try{
  const r=await window.launcher.serverPresence();
  if(!r.ok)throw new Error(r.error||'API indisponível');
  if(lastPresenceServer!==r.server){lastPresenceServer=r.server;lastPlayers=null;}
  const names=Array.isArray(r.players)?r.players:[];
  if(r.limited){
   $('connect-player-count').textContent='Privado';
   $('connect-activity').textContent='O servidor não liberou a lista de jogadores para esta conta.';
  }else{
   $('connect-player-count').textContent=String(names.length);
   if(lastPlayers!==null){
    const entering=names.filter(name=>!lastPlayers.has(name));
    for(const name of entering){
     const msg='Jogador '+name+' entrou no servidor '+r.name+'.';
     $('connect-activity').textContent='['+new Date().toLocaleTimeString('pt-BR')+'] '+msg+'\n'+$('connect-activity').textContent.slice(0,2000);
     note(msg);
     if(connectedPlayer===name){
      inviteStatusText('connect-state','Dentro do servidor','online');
      $('connect-state-details').textContent='Entrada de '+name+' confirmada pelo Metagame.';
      setConnectionMessage('Você entrou no servidor '+r.name+'!','success');
     }
    }
   }else{
    $('connect-activity').textContent=names.length?('Jogadores conectados: '+names.join(', ')):'Nenhum jogador online no momento.';
    if(connectedPlayer&&names.includes(connectedPlayer)){
     inviteStatusText('connect-state','Dentro do servidor','online');
     $('connect-state-details').textContent='Entrada de '+connectedPlayer+' confirmada pelo Metagame.';
     setConnectionMessage('Você entrou no servidor '+r.name+'!','success');
    }
   }
   lastPlayers=new Set(names);
  }
 }catch{
  $('connect-player-count').textContent='—';
  lastPlayers=null;
 }
}
window.launcher.onActivity(note);
settings();refresh();showVersion();showConnection();void refreshPresence();setInterval(()=>{if(!operating)void refresh();},10000);setInterval(()=>{if(!operating)void refreshPresence();},15000);
