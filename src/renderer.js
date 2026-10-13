'use strict';
const $=id=>document.getElementById(id);
const controlIds=['play','start','stop','restart','start2','stop2','restart2','refresh'];
const screens={dashboard:'VISÃO GERAL',services:'MEU SERVIDOR',players:'JOGADORES ONLINE',invites:'CONTA GOOGLE E CONVITES',connection:'JOGAR / SERVIDORES',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
let operating=false;
function note(s){const text=String(s);$('feedback').textContent=text;$('global-feedback').textContent=text;$('global-feedback').hidden=false;const el=$('activity');el.textContent=`[${new Date().toLocaleTimeString('pt-BR')}] ${text}\n`+el.textContent;}
function paint(s){for(const [key,primary,secondary] of [['metagame','metagame','metagame-service'],['deploy','deploy','deploy-service']]){const online=Boolean(s[key]);const el=$(primary);el.textContent=online?'Online':'Offline';el.className='metric-value '+(online?'online':'offline');const sub=$(secondary);sub.textContent=online?'Online':'Offline';sub.className='state'+(online?' on':'');}
 const owned=Array.isArray(s.owned)?s.owned:[];$('service-detail').textContent=owned.length?`Processos gerenciados nesta sessão: ${owned.join(', ')}.`:'Nenhum processo gerenciado nesta sessão. Serviços externos não podem ser desligados por este painel.';
 const canStop=owned.length>0;
 for(const id of ['stop','stop2','restart','restart2'])$(id).disabled=!canStop||operating;
 for(const id of ['start','start2'])$(id).disabled=operating;
 if(s.remote){
  $('service-detail').textContent='Jogo conectado a '+s.server+'. Estes controles iniciam ou encerram somente os serviços deste PC.';
 }
}
async function refresh(){try{paint(await window.launcher.status());}catch(e){note('Falha na verificação: '+e.message);}}
let playersWorking=false;
async function playersRefresh(){
 if(playersWorking)return;
 playersWorking=true;
 $('playersMessage').textContent='Consultando jogadores no Metagame…';
 $('playersList').replaceChildren();
 try{
  const result=await window.launcher.players();
  if(!result.ok)throw new Error(result.error||'Não foi possível consultar jogadores.');
  const data=result.data;
  if(data.limited){
   $('players-count').textContent='—';
   $('playersMessage').textContent='Vincule uma conta válida em Configurações para ver os jogadores.';
   return;
  }
  $('players-count').textContent=String(data.count);
  $('playersMessage').textContent=data.count===0?'Nenhum jogador detectado nos últimos 90 segundos.':data.count+' jogador(es) detectado(s).';
  const label={menu:'Menu',city:'Ramsgate',hunt:'Caçada',dojo:'Dojo',tutorial:'Tutorial',unknown:'Local desconhecido'};
  for(const player of data.players){
   const el=document.createElement('div');el.className='fenys-player';
   const name=document.createElement('strong');name.textContent=player.name;
   const location=document.createElement('span');location.textContent=label[player.where]||label.unknown;
   el.append(name,location);$('playersList').append(el);
  }
 }catch(e){$('players-count').textContent='—';$('playersMessage').textContent=e.message;}
 finally{playersWorking=false;}
}
async function settings(){
 try{
  const c=await window.launcher.getSettings();
  if(c.googleHost){$('google-network-mode').value=c.googleNetworkMode||'lan';$('google-network-address').value=c.googleHostAddress||'';$('google-game-address').value=c.googleGameAddress||'';}
  const googleMode=$('google-network-mode').value;
  $('google-network-address-fields').hidden=googleMode==='tailscale';
  $('google-public-fields').hidden=googleMode!=='public';
  $('google-lan-address-help').hidden=googleMode!=='lan';
  if(googleMode==='lan'){
   const suggestions=$('google-lan-ip-suggestions');
   suggestions.replaceChildren();
   const ips=await window.launcher.localAddresses();
   for(const ip of ips.addresses||[]){
    const o=document.createElement('option');o.value=ip+':61000';suggestions.append(o);
   }
   if(!c.googleHost&&!$('google-network-address').value.trim()&&ips.addresses?.length===1)
    $('google-network-address').value=ips.addresses[0]+':61000';
  }
  $('repo').textContent=c.repoPath;
  $('exe').textContent=c.launcherExe||'Não configurado';
  $('wine-settings').hidden=c.platform!=='linux';
  $('wine-executable').textContent=c.wineExecutable||'wine (sistema)';
  $('wine-prefix').textContent=c.winePrefix||'Padrão do Wine';
  const hostReady=$('community-host-readiness');
  if(hostReady){
   hostReady.textContent=!c.googleHost?'Este PC ainda não possui integração de host Google. Inicie os serviços, configure o servidor de origem e vincule os personagens existentes antes de publicar.':
     c.googleNetworkMode==='public'?'Host configurado para HTTPS público. Confira a conexão externa e os saves antes de publicar na comunidade.':
     'Seu host Google está configurado para '+(c.googleNetworkMode==='lan'?'rede local (LAN)':'rede privada antiga')+'. Para aparecer na comunidade, o administrador precisa configurar HTTPS público e IPv4 acessível para as partidas.';
  }
  $('serverAddress').value=c.gameServer||'127.0.0.1:61000';
  $('adminKeyState').textContent=c.adminKeySelected?'Chave selecionada':'Não selecionada';
  $('accountKeyState').textContent=c.accountKeySelected?'Conta vinculada':'Não vinculada';
 }catch(e){note('Falha ao obter configurações: '+e.message);}
}
async function action(type){if(operating)return; if((type==='stop'||type==='restart')&&!window.confirm(type==='stop'?'Desligar os serviços iniciados por este launcher?':'Reiniciar os serviços iniciados por este launcher?'))return;
 operating=true;for(const id of controlIds)$(id).disabled=true;
 const labels={play:'Preparando abertura do jogo…',start:'Iniciando serviços…',stop:'Encerrando serviços locais…',restart:'Reiniciando serviços…'};note(labels[type]);
 try{const result=await window.launcher[type]();if(!result.ok)throw new Error(result.error||'Operação não concluída');paint(result.status);note(({play:'Launcher do jogo aberto.',start:'Serviços iniciados ou já disponíveis.',stop:'Processos gerenciados encerrados.',restart:'Serviços reiniciados.'})[type]);}catch(e){note('Atenção: '+e.message);}finally{operating=false;for(const id of controlIds)$(id).disabled=false;await refresh();if(!$('screen-services').hidden)void hostingRefresh();}}
function setScreen(name){for(const [key,label] of Object.entries(screens)){const selected=key===name;const section=$('screen-'+key);section.hidden=!selected;section.classList.toggle('active',selected);document.querySelector(`[data-screen="${key}"]`).classList.toggle('active',selected);}$('screen-label').textContent=screens[name]||name;}
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>{setScreen(node.dataset.screen);if(node.dataset.screen==='players')void playersRefresh();if(node.dataset.screen==='services'){void hostingRefresh();void communityRefresh();}if(node.dataset.screen==='connection'){void communityRefresh();void globalRefresh();}if(node.dataset.screen==='invites')void communityRefresh();});
$('playersRefresh').addEventListener('click',playersRefresh);
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{try{await window.launcher.pickRepo();await settings();}catch(e){note(e.message);}});
$('hostDoctor').addEventListener('click',async()=>{
 const button=$('hostDoctor');button.disabled=true;
 const output=$('hostDoctorReport');output.hidden=false;output.textContent='Conferindo os arquivos locais e o estado do Google…';
 try{const result=await window.launcher.hostDoctor();if(!result?.ok)throw Error(result?.error||'Diagnóstico indisponível.');
  output.textContent=result.report;note('Diagnóstico: '+result.errors+' erro(s) e '+result.warnings+' aviso(s). Consulte o relatório em Configurações.');}
 catch(e){output.textContent='Não foi possível concluir a verificação: '+e.message;}
 finally{button.disabled=false;}
});
$('exePick').addEventListener('click',async()=>{try{await window.launcher.pickLauncher();await settings();}catch(e){note(e.message);}});
$('winePick').addEventListener('click',async()=>{try{await window.launcher.pickWine();await settings();}catch(e){note(e.message);}});
$('winePrefixPick').addEventListener('click',async()=>{try{await window.launcher.pickWinePrefix();await settings();}catch(e){note(e.message);}});
$('serverSave').addEventListener('click',async()=>{
 try{
  const result=await window.launcher.setServer($('serverAddress').value);
  note('Servidor configurado: '+result.server);
  await settings();await refresh();
 }catch(e){note('Atenção: '+e.message);}
});
$('playerKeyPick').addEventListener('click',async()=>{
 try{
  const r=await window.launcher.pickPlayerKey();
  if(r.selected)note('Conta existente vinculada: '+r.username);
  await settings();
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
let lastNativeWarning=0,lastGoogleWarning=0;
window.launcher.onActivity(message=>{
 const line=String(message);
 // Routine health polling happens every ten seconds. Keep the Activity panel useful.
 if(/^metagame: \{"level":30/.test(line)&&
    /"msg":"GET \/undaunted\/api\/(ServerStatus|GetUserInfo) gs=0"/.test(line))return;
 note(line);
 if(/Game server on port 8777 .*exited with code 3221225786/.test(line)){
  if(Date.now()-lastNativeWarning>45000){
   lastNativeWarning=Date.now();
   note('DIAGNÓSTICO RAMSGATE: o processo nativo saiu com 0xC000013A (encerramento por controle/sinal do Windows) antes de ficar disponível. Em Configurações → Administração → Verificar instalação, confira DLLs, caminho do executável e RAM. O código não prova quem encerrou o processo.');
  }
 }
 if(/Unstubbed route (GET \/launcher\/google\/status|POST \/launcher\/google\/(sync-now|host-invite))/.test(line)){
  if(Date.now()-lastGoogleWarning>45000){
   lastGoogleWarning=Date.now();
   note('DIAGNÓSTICO GOOGLE: o Metagame local ainda não respondeu às rotas Google. A conta Google pode estar conectada no launcher, mas o host precisa ser integrado antes de vincular o personagem antigo.');
  }
 }
});
let tailscaleWorking=false,tailscalePolling=false;
const tailscaleButtons=['tailscale-install','tailscale-connect','tailscale-background','tailscale-share','tailscale-refresh'];
async function tailscaleRefresh(){
 if(tailscalePolling||tailscaleWorking)return;tailscalePolling=true;
 try{
  const r=await window.launcher.tailscaleStatus();if(!r.ok)throw Error(r.error);
  $('tailscale-status').textContent=r.message;
  $('tailscale-ip').textContent=r.connected?'IP deste PC: '+r.addresses.join(', ')+(r.background===true?' • Continua ligado em segundo plano.':r.background===false?' • Modo em segundo plano desativado.':''):'';
  $('tailscale-install').disabled=r.installed;
  $('tailscale-connect').disabled=!r.installed||r.connected||r.connecting===true;
  $('tailscale-background').disabled=!r.connected||r.background===true;
  $('tailscale-share').disabled=!r.connected;
  if(r.connected)await connectionAddresses();
 }catch(e){$('tailscale-status').textContent=e.message;}
 finally{tailscalePolling=false;}
}
async function tailscaleAction(operation){
 if(tailscaleWorking)return;tailscaleWorking=true;
 for(const id of tailscaleButtons)$(id).disabled=true;
 const labels={tailscaleInstall:'Baixando o instalador oficial…',tailscaleConnect:'Conectando o Tailscale…',tailscaleBackground:'Aguarde a permissão do Windows para manter o Tailscale ligado…',tailscaleShare:'Abrindo o compartilhamento do PC…'};
 $('tailscale-status').textContent=labels[operation];
 try{const r=await window.launcher[operation]();if(!r.ok)throw Error(r.error);note(r.message);}
 catch(e){note('Atenção: '+e.message);}
 finally{tailscaleWorking=false;for(const id of tailscaleButtons)$(id).disabled=false;await tailscaleRefresh();}
}
$('tailscale-install').addEventListener('click',()=>void tailscaleAction('tailscaleInstall'));
$('tailscale-connect').addEventListener('click',()=>void tailscaleAction('tailscaleConnect'));
$('tailscale-background').addEventListener('click',()=>void tailscaleAction('tailscaleBackground'));
$('tailscale-share').addEventListener('click',()=>void tailscaleAction('tailscaleShare'));
$('tailscale-refresh').addEventListener('click',()=>void tailscaleRefresh());
async function connectionAddresses(){
 const list=$('connection-address'),selected=list.value;list.replaceChildren();
 try{
  const addresses=await window.launcher.connectionAddresses();
  for(const ip of addresses){const option=document.createElement('option');option.value=ip+':61000';option.textContent=ip+':61000';list.append(option);}
  if(addresses.some(ip=>ip+':61000'===selected))list.value=selected;
  if(!addresses.length){const option=document.createElement('option');option.value='';option.textContent='Conecte o Tailscale neste PC';list.append(option);}
 }catch(e){note(e.message);}
}
$('connection-setup').addEventListener('click',async()=>{
 const button=$('connection-setup');button.disabled=true;
 try{const r=await window.launcher.setupConnection($('connection-address').value);if(!r.ok)throw Error(r.error);note('Conexão Tailscale configurada. Inicie os serviços e gere o código para seu amigo.');await settings();await refresh();}
 catch(e){note('Atenção: '+e.message);}finally{button.disabled=false;}
});
$('connection-create').addEventListener('click',async()=>{
 const button=$('connection-create');button.disabled=true;$('connection-result').value='';
 try{const r=await window.launcher.createConnection($('connection-address').value,$('connection-name').value);if(!r.ok)throw Error(r.error);$('connection-result').value=r.code;note('Código criado. Envie ao usuário para conectar ao seu servidor.');}
 catch(e){note('Atenção: '+e.message);}finally{button.disabled=false;}
});
$('connection-join').addEventListener('click',async()=>{
 const button=$('connection-join');button.disabled=true;
 try{
  const code=$('connection-code').value.trim();
  const name=$('connection-username').value.trim();
  let createNew=false;
  if(code.startsWith('DLU3.')){
   const google=await window.launcher.googleState();
   if(!google?.ok||!google.signedIn)throw Error('Entre com Google antes de aceitar um convite.');
   if(!google.linked){
    if(!/^[A-Za-z0-9_]{3,16}$/.test(name))throw Error('Escolha um nome de 3 a 16 letras, números ou _ para o primeiro personagem.');
    if(!window.confirm('Você ainda não vinculou um personagem Google.\n\nSe já jogou, cancele e vincule o personagem antigo no servidor de origem.\n\nVocê confirma que este é seu PRIMEIRO personagem?'))return;
    createNew=true;
   }
  }
  const r=await window.launcher.joinConnection(code,name,createNew);if(!r.ok)throw Error(r.error);$('connection-code').value='';note('Servidor selecionado: '+r.server+'. Configure o executável do jogo e clique Jogar Agora.');await settings();await refresh();}
 catch(e){note('Atenção: '+e.message);}finally{button.disabled=false;}
});
$('connection-local').addEventListener('click',async()=>{
 try{const google=await window.launcher.googleState();if(google.ok&&google.signedIn&&google.hostEnabled){let createNew=false;if(!google.linked){if(!window.confirm('Nenhum personagem está vinculado ao Google.\n\nSe você já jogou Dauntless, clique em Cancelar e vincule seu personagem antigo primeiro.\n\nConfirma que é um jogador NOVO e deseja criar seu primeiro personagem?'))return;createNew=true;}let newName='';if(createNew){const choice=window.prompt('Nome do seu primeiro personagem (3 a 16 letras, números ou _):','');if(choice===null)return;newName=choice.trim();if(!/^[A-Za-z0-9_]{3,16}$/.test(newName))throw Error('Escolha um nome com 3 a 16 letras, números ou _.');}const result=await window.launcher.googleLocal(createNew,newName);if(!result.ok)throw Error(result.error||'Não foi possível selecionar o servidor local.');}else {const state=await window.launcher.globalState();if(state.global){const r=await window.launcher.globalHome();if(!r.ok)throw Error(r.error);}else await window.launcher.setServer('127.0.0.1:61000');}await settings();await refresh();note('Servidor principal selecionado. Os controles locais continuam disponíveis sem login.');}
 catch(e){note(e.message);}
});
$('connection-copy').addEventListener('click',async()=>{
 try{if(!$('connection-result').value)throw Error('Gere um código primeiro.');await navigator.clipboard.writeText($('connection-result').value);note('Código copiado.');}catch(e){note(e.message);}
});
settings();refresh();setInterval(()=>{if(!operating)void refresh();},10000);
setInterval(()=>{if(!operating&&document.getElementById('screen-players').hidden===false)void playersRefresh();},30000);
// Old Tailscale flow is hidden; do not poll or prompt players to install it.
let globalWorking=false;
async function globalRefresh(){
 try{const r=await window.launcher.globalState();if(!r.ok)throw Error(r.error);
  $('global-state').textContent=r.global?'Conta global conectada a '+r.server+(r.pending?' • Confirmação pendente.':'.'):'Sua chave existente será usada para manter o mesmo personagem nos hosts integrados.';
  if(r.localRole){$('global-role').value=r.localRole;$('global-role').disabled=true;}
  $('global-authorization-state').textContent=r.authorizationSelected?'Autorização selecionada.':'Nenhuma autorização Supabase selecionada.';
  $('global-authority-fields').hidden=$('global-role').value!=='authority';$('global-host-fields').hidden=$('global-role').value!=='host';
  $('global-central-controls').hidden=true;
 }catch(e){$('global-state').textContent=e.message;}
}
async function globalOperation(fn){if(globalWorking)return;globalWorking=true;try{const r=await fn();if(!r?.ok)throw Error(r?.error||'Operação global não concluída.');await globalRefresh();await settings();await refresh();return r;}catch(e){note('Atenção: '+e.message);}finally{globalWorking=false;}}
$('global-role').addEventListener('change',()=>void globalRefresh());
$('global-authorization-pick').addEventListener('click',()=>void globalOperation(()=>window.launcher.pickSupabaseAuthorization()));
$('global-activate').addEventListener('click',()=>void globalOperation(async()=>{const r=await window.launcher.activateGlobal({address:$('connection-address').value,role:$('global-role').value,hostCode:$('global-host-code').value.trim()});if(r.ok)note('Rede global ativada. Personagem, nível, inventário, guildas, amizades e placares são compartilhados entre os hosts.');return r;}));
$('global-host-invite').addEventListener('click',()=>void globalOperation(async()=>{const r=await window.launcher.createHostAuthorization();if(r.ok){$('global-host-result').value=r.code;note('Autorização de host gerada. Envie ao dono do outro servidor.');}return r;}));
$('global-backup-refresh').addEventListener('click',()=>void globalOperation(()=>globalBackup(false)));
$('global-backup-now').addEventListener('click',()=>void globalOperation(()=>globalBackup(true)));
$('global-recover').addEventListener('click',()=>void globalOperation(()=>window.launcher.globalRecover()));
async function globalBackup(force){const r=await window.launcher.globalBackup(force);if(r.ok)$('global-backup-state').textContent=(r.lastSuccess?'Última cópia confirmada: '+new Date(r.lastSuccess).toLocaleString('pt-BR')+'. ':'Nenhuma cópia confirmada ainda. ')+(r.dirty?'Há alterações pendentes. ':'')+(r.error||'')+(r.ready===false?' Aguarde a confirmação inicial do Supabase antes de jogar.':'');return r;}
setInterval(()=>{if(!$('screen-connection').hidden&&!globalWorking)void globalRefresh();},10000);

let googleWorking=false;
async function googleRefresh(){try{const r=await window.launcher.googleState();if(!r.ok)throw Error(r.error);$('google-state').textContent=!r.configured?'Google ainda não configurado no Supabase. O dono precisa cadastrar o cliente Google e autorizar o retorno do launcher.':r.signedIn?'Conta Google: '+r.email+'. '+(r.linked?'Personagem '+r.name+' vinculado • revisão '+r.revision+'.':'Vincule seu personagem atual ou conecte com um convite para criar um novo.'):'Entre com Google para recuperar seu personagem na nuvem.';$('google-login').hidden=r.signedIn;$('google-logout').hidden=!r.signedIn;$('google-link').hidden=!r.signedIn||r.linked;}catch(e){$('google-state').textContent=e.message;}}
async function googleOperation(fn){if(googleWorking)return;googleWorking=true;try{const r=await fn();if(!r?.ok)throw Error(r?.error||'Operação Google não confirmada.');if(r.notice)note(r.notice);await googleRefresh();await settings();void communityRefresh();return r;}catch(e){note(e.message);}finally{googleWorking=false;}}
$('google-login').addEventListener('click',async()=>{if(googleWorking)return;$('google-login').disabled=true;$('google-cancel').hidden=false;try{await googleOperation(()=>window.launcher.googleLogin());}finally{$('google-login').disabled=false;$('google-cancel').hidden=true;}});
$('google-cancel').addEventListener('click',async()=>{try{await window.launcher.googleCancel();note('Login Google cancelado.');}catch(e){note(e.message);}});
$('google-logout').addEventListener('click',()=>void googleOperation(()=>window.launcher.googleLogout()));
$('google-link').addEventListener('click',()=>void googleOperation(()=>window.launcher.googleLink()));
$('server-local-select').addEventListener('click',()=>$('connection-local').click());
function openHostSettings(){
 setScreen('services');
 $('hosting-wizard').scrollIntoView({behavior:'smooth',block:'start'});
 void hostingRefresh();void communityRefresh();
}
$('community-host-setup-open').addEventListener('click',openHostSettings);

 // Hosting is a guided view over the existing protected APIs, not a second backend.
 // Google invitations (validated by Supabase) replace insecure launcher-only passwords.
 let hostingBusy=false,hostingRefreshing=false,hostingSnapshot=null,hostingFirstLoad=true,hostingPublishedMessage='';
 function hostMessage(id,value){$(id).textContent=value;}
 function displayHostMode(){
  const mode=$('hosting-mode').value,vps=mode==='vps',internet=mode==='internet';
  for(const id of ['hosting-step-services','hosting-step-google','hosting-step-publish','hosting-step-invite'])$(id).hidden=vps;
  $('hosting-vps-note').hidden=!vps;
  $('hosting-lan-fields').hidden=internet||vps;
  $('hosting-public-fields').hidden=!internet;
  hostMessage('hosting-mode-help',vps?'Uma VPS roda os serviços em outra máquina. Este launcher não gerencia uma VPS remota automaticamente.':
   internet?'Seu computador será o host. Amigos de outras redes precisam de HTTPS público e portas de partida acessíveis.':
   'Seu PC será o servidor local. Para convidados de outra casa, escolha "Neste PC — amigos pela internet".');
 }
 async function hostingRefresh(){
  if(hostingRefreshing)return;hostingRefreshing=true;
  try{
   const [r,c,ips,g]=await Promise.all([window.launcher.hostingReadiness(),window.launcher.getSettings(),window.launcher.localAddresses(),window.launcher.googleState()]);
   if(!r?.ok)throw Error(r?.error||'A verificação do servidor falhou.');
   hostingSnapshot=r;
   if(hostingFirstLoad){
    hostingFirstLoad=false;
    if(r.googleConfigured&&r.networkMode==='public')$('hosting-mode').value='internet';
   }
   displayHostMode();
   const mode=$('hosting-mode').value,online=r.metagame&&r.deploy,active=r.googleConfigured&&r.googleActive;
   const ip=$('hosting-lan-ip'),previous=ip.value;ip.replaceChildren();
   for(const address of ips.addresses||[]){const option=document.createElement('option');option.value=address+':61000';option.textContent=option.value;ip.append(option);}
   if([...ip.options].some(o=>o.value===previous))ip.value=previous;
   else if([...ip.options].some(o=>o.value===r.hostAddress))ip.value=r.hostAddress;
   else if((ips.addresses||[]).length!==1){const option=document.createElement('option');option.value='';option.textContent='Selecione o IPv4 deste PC';ip.prepend(option);ip.value='';}
   if(!ip.options.length){const option=document.createElement('option');option.value='';option.textContent='Nenhum IPv4 da rede encontrado';ip.append(option);}
   if(r.networkMode==='public'&&r.hostAddress.startsWith('https://')&&!$('hosting-https').value.trim())$('hosting-https').value=r.hostAddress;
   if(c.googleGameAddress&&!$('hosting-public-ip').value.trim())$('hosting-public-ip').value=c.googleGameAddress;
   hostMessage('hosting-service-state',online?(r.managedByLauncher?'✓ Metagame e DeployServer iniciados por este launcher. Ramsgate e caçadas devem ser testados separadamente.':'Serviços ativos fora do launcher. Pare os serviços externos antes de configurar o Google e inicie-os pelo launcher.'):
    'Serviço parado ou incompleto. Inicie o servidor antes de integrá-lo.');
   hostMessage('hosting-google-state',active?'✓ Host Google integrado e registrado. Confira os saves antes de trocar de host.':
    r.googleMessage||'Integração Google não confirmada neste host.');
   $('hosting-admin-key').textContent=r.adminKeySelected?'✓ Chave administrativa selecionada':'1. Selecionar chave do administrador';
   $('hosting-authorization').textContent=r.authorizationSelected?'✓ Autorização Supabase selecionada':'2. Selecionar autorização Supabase';
   $('hosting-activate').textContent=active?'Reconfigurar integração Google':'Ativar integração Google neste servidor';
   $('hosting-activate').disabled=hostingBusy||!online||!r.managedByLauncher||mode==='vps';
   const canPublish=mode==='internet'&&active&&r.networkMode==='public'&&g?.ok&&g.signedIn;
   $('hosting-publish').disabled=hostingBusy||!canPublish;
   hostMessage('hosting-publish-state',mode!=='internet'?'O modo LAN não aparece na comunidade pela internet. Configure o acesso público quando quiser receber jogadores de outra rede.':
    !active?'Primeiro ative a integração Google.':
    r.networkMode!=='public'?'Este host ainda está em LAN. Configure HTTPS e reative a integração.':
    !g?.signedIn?'Entre com Google na aba Conta para publicar.':
    hostingPublishedMessage||'O host pode solicitar publicação. A conectividade externa ainda precisa ser testada em outra rede.');
   const hasOwn=!!$('hosting-owned-server').value;
   $('hosting-send-invite').disabled=hostingBusy||!active||!hasOwn;
   if(!hasOwn)hostMessage('hosting-invite-state','Publique seu servidor com a conta Google antes de convidar amigos.');
   hostMessage('hosting-overview',mode==='vps'?'VPS: prepare o host remoto sem modificar este servidor local.':
    !online?'Primeiro passo: iniciar o seu servidor local.':
    active?'Servidor local iniciado e conectado ao Google.':'Servidor local iniciado. Falta integrar o Google para publicar e preservar personagens.');
  }catch(e){hostMessage('hosting-overview','Não foi possível verificar tudo: '+e.message);}
  finally{hostingRefreshing=false;}
 }
 async function hostAction(id,fn){
  if(hostingBusy)return;hostingBusy=true;$(id).disabled=true;
  try{await fn();}catch(e){hostMessage('hosting-activate-state','Atenção: '+e.message);note('Hospedagem: '+e.message);}
  finally{hostingBusy=false;$(id).disabled=false;await hostingRefresh();}
 }
 $('hosting-mode').addEventListener('change',()=>{hostingPublishedMessage='';displayHostMode();void hostingRefresh();});
 $('hosting-start').addEventListener('click',()=>void hostAction('hosting-start',async()=>{
  const r=await window.launcher.start();if(!r?.ok)throw Error(r?.error||'Não foi possível iniciar os serviços.');
  if(r.status)paint(r.status);hostMessage('hosting-activate-state','Serviços iniciados. Continue com a integração Google.');
 }));
 $('hosting-check').addEventListener('click',()=>void hostAction('hosting-check',async()=>{
  const r=await window.launcher.hostDoctor();if(!r?.ok)throw Error(r?.error||'Verificação indisponível.');
  $('hostDoctorReport').textContent=r.report;$('hostDoctorReport').hidden=false;
  hostMessage('hosting-activate-state',r.errors?'Diagnóstico: '+r.errors+' erro(s) e '+r.warnings+' aviso(s). Abra as ferramentas técnicas para ver os detalhes.':
   'Diagnóstico concluído sem erro de configuração; '+r.warnings+' aviso(s). Ainda é necessário testar o jogo.');
 }));
 $('hosting-admin-key').addEventListener('click',()=>void hostAction('hosting-admin-key',async()=>{await window.launcher.pickAdminKey();await settings();}));
 $('hosting-authorization').addEventListener('click',()=>void hostAction('hosting-authorization',async()=>{
  const r=await window.launcher.pickSupabaseAuthorization();if(r?.ok===false)throw Error(r.error||'Autorização não selecionada.');await settings();
 }));
 for(const [id,api] of [['hosting-cert','networkCert'],['hosting-private-key','networkKey']])$(id).addEventListener('click',()=>void hostAction(id,async()=>{
  const selected=await window.launcher[api]();if(selected)hostMessage('hosting-activate-state','Arquivo HTTPS selecionado neste computador.');
 }));
 $('hosting-activate').addEventListener('click',()=>void hostAction('hosting-activate',async()=>{
  const mode=$('hosting-mode').value,r=hostingSnapshot;
  if(mode==='vps')throw Error('Este painel configura somente o servidor deste PC.');
  if(!r?.metagame||!r?.deploy)throw Error('Inicie os serviços primeiro.');
  if(!r.managedByLauncher)throw Error('Feche os serviços externos e inicie Metagame e DeployServer pelo launcher para integrar o Google.');
  if(!r.adminKeySelected)throw Error('Selecione a chave administrativa do seu servidor.');
  const hostCode=$('google-host-code').value.trim();
  if(!r.googleConfigured&&!r.authorizationSelected&&!hostCode)throw Error('Selecione a autorização Supabase do dono do host.');
  const address=mode==='internet'?$('hosting-https').value.trim():$('hosting-lan-ip').value;
  if(!address)throw Error('Informe um endereço válido deste servidor.');
  const gameAddress=mode==='internet'?$('hosting-public-ip').value.trim():'';
  if(mode==='internet'){
   const c=await window.launcher.getSettings();
   if(!/^https:\/\//i.test(address)||!gameAddress||!c.publicCertSelected||!c.publicKeySelected)
    throw Error('Configure o endereço HTTPS, o IPv4 público e o certificado com sua chave.');
  }
  if(!window.confirm('Todos devem estar fora do jogo. Faça backup de seus personagens antes de integrar ou reconfigurar o host.\n\nDeseja continuar?'))return;
  hostMessage('hosting-activate-state','Integrando o servidor e recompilando o Metagame…');
  const result=await window.launcher.googleActivate({networkMode:mode==='internet'?'public':'lan',address,gameAddress,hostCode});
  if(!result?.ok)throw Error(result?.error||'A integração Google falhou.');
  hostMessage('hosting-activate-state','Integração aplicada. Confira os saves e o status antes de conectar outro jogador.');
  await settings();
 }));
 $('hosting-publish').addEventListener('click',()=>void hostAction('hosting-publish',async()=>{
  if(!hostingSnapshot?.googleActive||hostingSnapshot.networkMode!=='public')throw Error('Ative o host Google em modo HTTPS público.');
  const name=$('hosting-server-name').value.trim();if(!name)throw Error('Informe o nome do seu servidor.');
  hostMessage('hosting-publish-state','Publicando no catálogo…');
  const result=await window.launcher.communityPublish({name,description:'',policy:$('hosting-server-policy').value});
  if(!result?.ok)throw Error(result?.error||'A publicação não foi confirmada.');
  hostingPublishedMessage='Servidor '+result.name+' cadastrado. Teste a conectividade com um amigo em outra rede.';
  hostMessage('hosting-publish-state',hostingPublishedMessage);
  await communityRefresh();
 }));
 $('hosting-owned-server').addEventListener('change',()=>{$('hosting-send-invite').disabled=!hostingSnapshot?.googleActive||!$('hosting-owned-server').value;});
 $('hosting-send-invite').addEventListener('click',()=>void hostAction('hosting-send-invite',async()=>{
  const id=$('hosting-owned-server').value,target=$('hosting-friend').value.trim();
  if(!id)throw Error('Publique seu servidor primeiro.');if(!target)throw Error('Informe o e-mail Google ou nome de usuário.');
  const result=await window.launcher.communityInvite(id,target,'member',30);
  if(!result?.ok)throw Error(result?.error||'O convite não foi entregue.');
  $('hosting-friend').value='';hostMessage('hosting-invite-state','Convite enviado para '+result.recipient+'. Ele receberá uma notificação ao entrar com Google.');
 }));

 $('hosting-advanced-open').addEventListener('click',()=>{
  setScreen('settings');$('admin-server-settings').open=true;$('google-host-tools').open=true;
  $('admin-server-settings').scrollIntoView({behavior:'smooth',block:'start'});void settings();
 });
$('google-go-server').addEventListener('click',()=>{openHostSettings();note('Integre o servidor de origem antes de vincular seu personagem. Faça backup dos saves e mantenha todos fora do jogo.');});
$('google-refresh').addEventListener('click',()=>void googleOperation(async()=>{const button=$('google-refresh');button.disabled=true;button.textContent='Consultando Supabase…';$('google-state').textContent='Consultando personagem vinculado à conta Google…';try{const r=await window.launcher.googleRefresh();if(r?.ok){if(!r.signedIn)note('Entre com Google para consultar seu personagem.');else if(r.linked)note('Personagem encontrado na nuvem: '+(r.name||'sem nome informado')+'. Progresso revisão '+(r.revision||0)+'.');else note('Nenhum personagem vinculado a esta conta Google. Integre primeiro o servidor de origem para preservar seu personagem existente.');}return r;}finally{button.disabled=false;button.textContent='Conferir personagem na nuvem';}}));
$('google-authorization').addEventListener('click',()=>void googleOperation(()=>window.launcher.pickSupabaseAuthorization()));
$('google-network-mode').addEventListener('change',()=>{const mode=$('google-network-mode').value;$('google-network-address-fields').hidden=mode==='tailscale';$('google-public-fields').hidden=mode!=='public';$('google-lan-address-help').hidden=mode!=='lan';if(mode==='lan')void settings();});
for(const [id,fn] of [['google-public-cert','networkCert'],['google-public-key','networkKey']])$(id).addEventListener('click',async()=>{try{if(await window.launcher[fn]())note('Arquivo HTTPS selecionado.');}catch(e){note(e.message);}});
$('google-host-activate').addEventListener('click',()=>void googleOperation(()=>window.launcher.googleActivate({networkMode:$('google-network-mode').value,address:$('google-network-mode').value==='tailscale'?$('connection-address').value:$('google-network-address').value.trim(),gameAddress:$('google-game-address').value.trim(),hostCode:$('google-host-code').value.trim()})));
$('google-host-invite').addEventListener('click',()=>void googleOperation(async()=>{const r=await window.launcher.googleHostInvite();if(r.ok)$('google-host-result').value=r.code;return r;}));
$('google-sync').addEventListener('click',()=>void googleOperation(async()=>{const r=await window.launcher.googleSync(true);if(r.ok)$('google-sync-state').textContent='Saves confirmados no Supabase.';return r;}));
void googleRefresh();setInterval(()=>{if(!googleWorking&&(!$('screen-invites').hidden||!$('screen-connection').hidden))void googleRefresh();},20000);

// Community directory, invitation notifications and access management.
let communityLoading=false,communityActionBusy=false;
function communityEmpty(container,message){
 container.replaceChildren();const p=document.createElement('p');p.className='notice';p.textContent=message;container.append(p);
}
function communityButton(label,callback,style='btn-outline'){
 const button=document.createElement('button');button.type='button';button.className='btn '+style;
 button.textContent=label;button.addEventListener('click',()=>void callback());return button;
}
async function communityRefresh(){
 if(communityLoading)return;
 communityLoading=true;
 try{
  const auth=await window.launcher.googleState();
  if(!auth?.ok||!auth.signedIn){
   $('community-bell').hidden=true;
   $('community-bell-count').textContent='0';
   $('community-catalog-state').textContent='Entre com Google na aba Conta e convites para consultar os servidores.';
   $('community-inbox-state').textContent='Entre com Google para receber convites.';
   communityEmpty($('community-server-list'),'Nenhum servidor consultado.');
   communityEmpty($('community-inbox-list'),'Nenhum convite consultado.');
   return;
  }
  $('community-bell').hidden=false;
  const [catalog,inbox]=await Promise.all([window.launcher.communityList(),window.launcher.communityInbox()]);
  if(!catalog?.ok)throw Error(catalog?.error||'Falha no catálogo de servidores.');
  if(!inbox?.ok)throw Error(inbox?.error||'Falha na consulta de convites.');
  const servers=Array.isArray(catalog.servers)?catalog.servers:[];
  const pending=Array.isArray(inbox.invitations)?inbox.invitations:[];
  $('community-bell-count').textContent=String(pending.length);
  $('community-bell').classList.toggle('has-notifications',pending.length>0);
  $('community-catalog-state').textContent=servers.length?servers.length+' servidor(es) cadastrado(s). A disponibilidade será confirmada ao conectar.':'';
  $('community-inbox-state').textContent=pending.length?pending.length+' convite(s) aguardando sua resposta.':'Nenhum convite pendente.';
  const list=$('community-server-list');list.replaceChildren();
  for(const server of servers){
   const card=document.createElement('div');card.className='community-server';
   const body=document.createElement('div'),name=document.createElement('strong'),subtitle=document.createElement('p');
   name.textContent=server.name;
   const policy={open:'Entrada livre',invite:'Somente convidados',vip:'Restrito / VIP'}[server.policy]||'Comunidade';
   const selected=auth.server===server.address;
   subtitle.textContent=policy+' • '+(server.description||'Sem descrição')+' • '+(selected?'Selecionado neste launcher':'Disponibilidade verificada ao conectar');
   body.append(name,subtitle);card.append(body);
   const button=communityButton(server.hasAccess?'Selecionar servidor':'Acesso restrito',async()=>{
    await communityOperation(async()=>{
     const account=await window.launcher.googleState();
     if(!account?.ok||!account.signedIn)throw Error('Entre com Google antes de selecionar um servidor.');
     let createNew=false;
     if(!account.linked){
      if(!window.confirm('Nenhum personagem está vinculado à sua conta Google.\n\nSe você já tem um personagem, clique em Cancelar e vincule-o no servidor de origem para não perder o progresso.\n\nVocê confirma que nunca jogou e deseja criar seu PRIMEIRO personagem neste servidor?'))return;
      createNew=true;
     }
     let newName='';
     if(createNew){
      const choice=window.prompt('Nome do seu primeiro personagem (3 a 16 letras, números ou _):','');
      if(choice===null)return;
      newName=choice.trim();
      if(!/^[A-Za-z0-9_]{3,16}$/.test(newName))throw Error('Escolha um nome com 3 a 16 letras, números ou _.');
     }
     const result=await window.launcher.communityJoin(server.id,createNew,newName);
     if(!result?.ok)throw Error(result?.error||'Não foi possível conectar.');
     note('Servidor '+server.name+' selecionado. Clique em Jogar Agora para entrar.');
     await settings();await refresh();
    },false);
   },server.hasAccess?'btn-red':'btn-outline');
   button.disabled=!server.hasAccess;card.append(button);list.append(card);
  }
  if(!servers.length)communityEmpty(list,'Ainda não há servidores disponíveis. Servidores de amigos aparecerão depois de aceitar um convite Google. Se você hospeda, use Configurações → Hospedar servidor.');
  const own=$('community-owner-server'),old=own.value;own.replaceChildren();
  const mine=servers.filter(s=>s.owned);
  for(const server of mine){const option=document.createElement('option');option.value=server.id;option.textContent=server.name;own.append(option);}
  if(mine.some(s=>s.id===old))own.value=old;
  if(!mine.length){const option=document.createElement('option');option.value='';option.textContent='Publique seu servidor HTTPS primeiro';own.append(option);}
  const hosted=$('hosting-owned-server'),previous=hosted.value;
  hosted.replaceChildren();
  for(const server of mine){const option=document.createElement('option');option.value=server.id;option.textContent=server.name;hosted.append(option);}
  if(mine.some(s=>s.id===previous))hosted.value=previous;
  if(!mine.length){const option=document.createElement('option');option.value='';option.textContent='Nenhum servidor publicado';hosted.append(option);}
  $('hosting-send-invite').disabled=hostingBusy||!hostingSnapshot?.googleActive||!mine.length;
  const incoming=$('community-inbox-list');incoming.replaceChildren();
  for(const invitation of pending){
   const card=document.createElement('div');card.className='community-server';
   const body=document.createElement('div'),name=document.createElement('strong'),hint=document.createElement('p');
   name.textContent=invitation.serverName||'Servidor da comunidade';
   hint.textContent=(invitation.tier==='vip'?'Convite VIP':'Convite de jogador')+' • válido até '+new Date(invitation.expires_at).toLocaleDateString('pt-BR');
   body.append(name,hint);
   const actions=document.createElement('div');actions.className='community-actions';
   for(const [label,decision] of [['Aceitar','accept'],['Recusar','decline']]){
    actions.append(communityButton(label,()=>communityOperation(async()=>{
     const r=await window.launcher.communityDecide(invitation.id,decision);
     if(!r?.ok)throw Error(r?.error||'Não foi possível responder ao convite.');
     note(decision==='accept'?'Convite aceito. O servidor agora pode aparecer na lista.':'Convite recusado.');
    }),decision==='accept'?'btn-red':'btn-outline'));
   }
   card.append(body,actions);incoming.append(card);
  }
  if(!pending.length)communityEmpty(incoming,'Você não tem convites pendentes.');
 }catch(e){
  $('community-catalog-state').textContent='A lista não pôde ser consultada: '+e.message;
  $('community-inbox-state').textContent='Não foi possível conferir os convites: '+e.message;
  $('community-bell-count').textContent='—';
 }finally{communityLoading=false;}
}
async function communityOperation(fn,refresh=true){
 if(communityActionBusy)return;
 communityActionBusy=true;
 try{await fn();if(refresh)await communityRefresh();}
 catch(e){$('community-admin-state').textContent='Não foi possível concluir: '+e.message;note('Comunidade: '+e.message);}
 finally{communityActionBusy=false;}
}
$('community-bell').addEventListener('click',()=>{setScreen('invites');$('community-notifications').scrollIntoView({behavior:'smooth',block:'center'});void communityRefresh();});
$('community-list-refresh').addEventListener('click',()=>void communityRefresh());
$('community-inbox-refresh').addEventListener('click',()=>void communityRefresh());
$('community-username-save').addEventListener('click',()=>void communityOperation(async()=>{
 const r=await window.launcher.communityUsername($('community-username').value.trim());
 if(!r?.ok)throw Error(r?.error||'Nome indisponível.');note('Nome de usuário configurado: '+r.username);
}));
$('community-publish').addEventListener('click',()=>void communityOperation(async()=>{
 $('community-admin-state').textContent='Conferindo autorização do host e publicando no Supabase…';
 const r=await window.launcher.communityPublish({name:$('community-host-name').value.trim(),description:$('community-host-description').value.trim(),policy:$('community-host-policy').value});
 if(!r?.ok)throw Error(r?.error||'Publicação não confirmada.');
 $('community-admin-state').textContent='Servidor '+r.name+' publicado na comunidade. Endereço e permissões verificados.';
 note('Servidor publicado: '+r.name);
}));
$('community-invite-send').addEventListener('click',()=>void communityOperation(async()=>{
 const id=$('community-owner-server').value;if(!id)throw Error('Publique e escolha um servidor que você administra.');
 const target=$('community-invite-target').value.trim();if(!target)throw Error('Informe o e-mail Google ou nome de usuário.');
 const r=await window.launcher.communityInvite(id,target,$('community-invite-tier').value,Number($('community-invite-days').value));
 if(!r?.ok)throw Error(r?.error||'Convite não enviado.');
 $('community-admin-state').textContent='Convite enviado para '+r.recipient+'. Ele aparecerá no launcher quando o destinatário entrar com Google.';
 $('community-invite-target').value='';
}));
$('community-revoke').addEventListener('click',()=>void communityOperation(async()=>{
 const id=$('community-owner-server').value;if(!id)throw Error('Escolha um servidor que você administra.');
 const username=$('community-revoke-username').value.trim();if(!username)throw Error('Informe o nome de usuário.');
 if(!window.confirm('Revogar o acesso de '+username+' a este servidor?'))return;
 const r=await window.launcher.communityRevoke(id,username);
 if(!r?.ok)throw Error(r?.error||'Não foi possível revogar.');
 $('community-admin-state').textContent='Permissão revogada para '+username+'. A próxima entrada será verificada pelo servidor.';
}));
void communityRefresh();
setInterval(()=>{if(!communityLoading&&!googleWorking)void communityRefresh();},30000);
