'use strict';
const $=id=>document.getElementById(id);
const controlIds=['play','start','stop','restart','start2','stop2','restart2','refresh'];
void window.launcher.appVersion().then(v=>{$('launcher-version').textContent='VERSÃO INSTALADA • v'+v;}).catch(()=>{$('launcher-version').textContent='VERSÃO NÃO IDENTIFICADA';});
const screens={dashboard:'VISÃO GERAL',services:'CENTRAL DO SERVIDOR',players:'JOGADORES ONLINE',invites:'CONTA GOOGLE E CONVITES',connection:'ESCOLHER SERVIDOR',host:'HOSPEDAR SERVIDOR',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
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
  if(c.googleHost&&!window.hostWizard?.userEdited){$('google-network-mode').value=['lan','public'].includes(c.googleNetworkMode)?c.googleNetworkMode:'lan';$('google-network-address').value=c.googleHostAddress||'';$('google-game-address').value=c.googleGameAddress||'';}
  const googleMode=$('google-network-mode').value;
  $('google-network-address-fields').hidden=false;
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
  $('adminKeyState').textContent=c.adminKeySelected?'Chave selecionada':'Não selecionada';
  $('accountKeyState').textContent=c.accountKeySelected?'Conta vinculada':'Não vinculada';
   if(!$('screen-host').hidden)void window.hostWizard?.refresh();
 }catch(e){note('Falha ao obter configurações: '+e.message);}
}
async function action(type){if(operating)return; if((type==='stop'||type==='restart')&&!window.confirm(type==='stop'?'Desligar os serviços iniciados por este launcher?':'Reiniciar os serviços iniciados por este launcher?'))return;
 operating=true;for(const id of controlIds)$(id).disabled=true;
 const labels={play:'Preparando abertura do jogo…',start:'Iniciando serviços…',stop:'Encerrando serviços locais…',restart:'Reiniciando serviços…'};note(labels[type]);
 try{const result=await window.launcher[type]();if(!result.ok)throw new Error(result.error||'Operação não concluída');paint(result.status);note(({play:'Launcher do jogo aberto.',start:'Serviços iniciados ou já disponíveis.',stop:'Processos gerenciados encerrados.',restart:'Serviços reiniciados.'})[type]);}catch(e){note('Atenção: '+e.message);}finally{operating=false;for(const id of controlIds)$(id).disabled=false;await refresh();}}
function setScreen(name){for(const [key,label] of Object.entries(screens)){const selected=key===name;const section=$('screen-'+key);section.hidden=!selected;section.classList.toggle('active',selected);document.querySelector(`[data-screen="${key}"]`)?.classList.toggle('active',selected);}$('screen-label').textContent=screens[name]||name;}
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>{setScreen(node.dataset.screen);if(node.dataset.screen==='players')void playersRefresh();if(node.dataset.screen==='connection')void communityRefresh();if(node.dataset.screen==='invites')void communityRefresh();if(node.dataset.screen==='host'){void settings();void communityRefresh();}});
$('playersRefresh').addEventListener('click',playersRefresh);
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{try{await window.launcher.pickRepo();await settings();}catch(e){note(e.message);}});
$('host-check').addEventListener('click',async()=>{
 const button=$('host-check');button.disabled=true;
 const output=$('hostDoctorReport');output.hidden=false;output.textContent='Conferindo os arquivos locais e o estado do Google…';
 try{const result=await window.launcher.hostDoctor();if(!result?.ok)throw Error(result?.error||'Diagnóstico indisponível.');
  output.textContent=result.report;note('Diagnóstico: '+result.errors+' erro(s) e '+result.warnings+' aviso(s). Consulte o relatório na aba Hospedar servidor.');}
 catch(e){output.textContent='Não foi possível concluir a verificação: '+e.message;}
 finally{button.disabled=false;}
});
$('exePick').addEventListener('click',async()=>{try{await window.launcher.pickLauncher();await settings();}catch(e){note(e.message);}});
$('winePick').addEventListener('click',async()=>{try{await window.launcher.pickWine();await settings();}catch(e){note(e.message);}});
$('winePrefixPick').addEventListener('click',async()=>{try{await window.launcher.pickWinePrefix();await settings();}catch(e){note(e.message);}});
$('playerKeyPick').addEventListener('click',async()=>{
 try{
  const r=await window.launcher.pickPlayerKey();
  if(r.selected)note('Conta existente vinculada: '+r.username);
  await settings();
 }catch(e){note('Atenção: '+e.message);}
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
   note('DIAGNÓSTICO RAMSGATE: o processo nativo saiu com 0xC000013A (encerramento por controle/sinal do Windows) antes de ficar disponível. Em Hospedar servidor → Verificar instalação, confira DLLs, caminho do executável e RAM. O código não prova quem encerrou o processo.');
  }
 }
 if(/Unstubbed route (GET \/launcher\/google\/status|POST \/launcher\/google\/(sync-now|host-invite))/.test(line)){
  if(Date.now()-lastGoogleWarning>45000){
   lastGoogleWarning=Date.now();
   note('DIAGNÓSTICO GOOGLE: o Metagame local ainda não respondeu às rotas Google. A conta Google pode estar conectada no launcher, mas o host precisa ser integrado antes de vincular o personagem antigo.');
  }
 }
});
$('server-local-select').addEventListener('click',async()=>{
 try{const google=await window.launcher.googleState();if(google.ok&&google.signedIn&&google.hostEnabled){let createNew=false;if(!google.linked){if(!window.confirm('Nenhum personagem está vinculado ao Google.\n\nSe você já jogou Dauntless, clique em Cancelar e vincule seu personagem antigo primeiro.\n\nConfirma que é um jogador NOVO e deseja criar seu primeiro personagem?'))return;createNew=true;}let newName='';if(createNew){const choice=window.prompt('Nome do seu primeiro personagem (3 a 16 letras, números ou _):','');if(choice===null)return;newName=choice.trim();if(!/^[A-Za-z0-9_]{3,16}$/.test(newName))throw Error('Escolha um nome com 3 a 16 letras, números ou _.');}const result=await window.launcher.googleLocal(createNew,newName);if(!result.ok)throw Error(result.error||'Não foi possível selecionar o servidor local.');}else await window.launcher.setServer('127.0.0.1:61000');await settings();await refresh();note('Servidor principal selecionado. Os controles locais continuam disponíveis sem login.');}
 catch(e){note(e.message);}
});
settings();refresh();setInterval(()=>{if(!operating)void refresh();},10000);
setInterval(()=>{if(!operating&&document.getElementById('screen-players').hidden===false)void playersRefresh();},30000);
let googleWorking=false;
async function googleRefresh(){try{const r=await window.launcher.googleState();if(!r.ok)throw Error(r.error);$('google-state').textContent=!r.configured?'Google ainda não configurado no Supabase. O dono precisa cadastrar o cliente Google e autorizar o retorno do launcher.':r.signedIn?'Conta Google: '+r.email+'. '+(r.linked?'Personagem '+r.name+' vinculado • revisão '+r.revision+'.':'Vincule seu personagem atual ou conecte com um convite para criar um novo.'):'Entre com Google para recuperar seu personagem na nuvem.';$('google-login').hidden=r.signedIn;$('google-logout').hidden=!r.signedIn;$('google-link').hidden=!r.signedIn||r.linked;}catch(e){$('google-state').textContent=e.message;}}
async function googleOperation(fn){if(googleWorking)return;googleWorking=true;try{const r=await fn();if(!r?.ok)throw Error(r?.error||'Operação Google não confirmada.');if(r.notice)note(r.notice);await googleRefresh();await settings();void communityRefresh();return r;}catch(e){note(e.message);}finally{googleWorking=false;void window.hostWizard?.refresh();}}
$('google-login').addEventListener('click',async()=>{if(googleWorking)return;$('google-login').disabled=true;$('google-cancel').hidden=false;try{await googleOperation(()=>window.launcher.googleLogin());}finally{$('google-login').disabled=false;$('google-cancel').hidden=true;}});
$('google-cancel').addEventListener('click',async()=>{try{await window.launcher.googleCancel();note('Login Google cancelado.');}catch(e){note(e.message);}});
$('google-logout').addEventListener('click',()=>void googleOperation(()=>window.launcher.googleLogout()));
$('google-link').addEventListener('click',()=>void googleOperation(()=>window.launcher.googleLink()));
function openHostSettings(){
 setScreen('host');
 void settings();
 void window.hostWizard?.refresh();
}
$('google-go-server').addEventListener('click',()=>{openHostSettings();note('Integre o servidor de origem antes de vincular seu personagem. Faça backup dos saves e mantenha todos fora do jogo.');});
$('google-refresh').addEventListener('click',()=>void googleOperation(async()=>{const button=$('google-refresh');button.disabled=true;button.textContent='Consultando Supabase…';$('google-state').textContent='Consultando personagem vinculado à conta Google…';try{const r=await window.launcher.googleRefresh();if(r?.ok){if(!r.signedIn)note('Entre com Google para consultar seu personagem.');else if(r.linked)note('Personagem encontrado na nuvem: '+(r.name||'sem nome informado')+'. Progresso revisão '+(r.revision||0)+'.');else note('Nenhum personagem vinculado a esta conta Google. Integre primeiro o servidor de origem para preservar seu personagem existente.');}return r;}finally{button.disabled=false;button.textContent='Conferir personagem na nuvem';}}));
$('google-authorization').addEventListener('click',()=>void googleOperation(async()=>{
 const result=await window.launcher.pickSupabaseAuthorization();
 if(result?.ok&&result.selected)note(result.automatic?'Autorização Supabase encontrada automaticamente neste PC.':'Autorização Supabase selecionada e validada.');
 return result;
}));
$('google-network-mode').addEventListener('change',()=>{
 const mode=$('google-network-mode').value;
 $('google-network-address-fields').hidden=false;
 $('google-public-fields').hidden=mode!=='public';
 $('google-lan-address-help').hidden=mode!=='lan';
 $('google-network-address').placeholder=mode==='public'?'https://servidor.exemplo.com':'192.168.1.20:61000';
 // Never carry a LAN endpoint into public mode, or an HTTPS endpoint into LAN mode.
 const current=$('google-network-address').value.trim();
 if((mode==='public'&&!current.startsWith('https://'))||(mode==='lan'&&current.startsWith('https://')))$('google-network-address').value='';
 if(mode==='lan')void settings();
 void window.hostWizard?.refresh();
});
for(const [id,fn] of [['google-public-cert','networkCert'],['google-public-key','networkKey']])$(id).addEventListener('click',async()=>{try{if(await window.launcher[fn]())note('Arquivo HTTPS selecionado.');void window.hostWizard?.refresh();}catch(e){note(e.message);}});
$('google-host-activate').addEventListener('click',()=>void googleOperation(async()=>{
 const preflight=await window.launcher.hostReadiness();
 if(!preflight?.ok||!preflight.servicesReady||!preflight.managedServices)throw Error('Inicie o servidor local pelo launcher antes de integrar.');
 if(preflight.googleActive&&!window.confirm('Mudar a rede exige reiniciar serviços. Faça backup, encerre todas as partidas e confirme que ninguém está jogando. Continuar?'))return {ok:true};
 const result=await window.launcher.googleActivate({networkMode:$('google-network-mode').value,address:$('google-network-address').value.trim(),gameAddress:$('google-game-address').value.trim(),hostCode:$('google-host-code').value.trim()});
 if(result?.ok)window.hostWizard.userEdited=false;
 return result;
}));
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
   const policy={open:'Entrada livre',invite:'Somente convidados',vip:'Somente autorizados (legado)'}[server.policy]||'Comunidade';
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
  if(!servers.length)communityEmpty(list,'Ainda não há servidores públicos disponíveis. Os servidores privados aparecerão após aceitar um convite Google. Para criar o seu, abra Hospedar servidor.');
  const own=$('community-owner-server'),old=own.value;own.replaceChildren();
  const mine=servers.filter(s=>s.owned);
  for(const server of mine){const option=document.createElement('option');option.value=server.id;option.textContent=server.name;own.append(option);}
  if(mine.some(s=>s.id===old))own.value=old;
  if(!mine.length){const option=document.createElement('option');option.value='';option.textContent='Publique seu servidor HTTPS primeiro';own.append(option);}
  const incoming=$('community-inbox-list');incoming.replaceChildren();
  for(const invitation of pending){
   const card=document.createElement('div');card.className='community-server';
   const body=document.createElement('div'),name=document.createElement('strong'),hint=document.createElement('p');
   name.textContent=invitation.serverName||'Servidor da comunidade';
   hint.textContent=(invitation.tier==='vip'?'Convite restrito anterior':'Convite de jogador')+' • válido até '+new Date(invitation.expires_at).toLocaleDateString('pt-BR');
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
 }finally{communityLoading=false;void window.hostWizard?.refresh();}
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
$('guest-network-auto').addEventListener('click',async()=>{
 const button=$('guest-network-auto');
 button.disabled=true;
 $('guest-network-state').textContent='Detectando a rede deste computador…';
 try{
  const report=await window.launcher.networkDiagnose();
  if(!report?.ok)throw Error(report?.error||'Diagnóstico da rede não disponível.');
  $('guest-network-state').textContent=(report.preferred?'Rede local detectada automaticamente. ':'Nenhuma rede local encontrada. ')
   +(report.publicIPv4?'Saída para a internet identificada via STUN. ':'O teste STUN não respondeu. ')
   +'Para entrar no servidor de outra pessoa, use Google e o catálogo; não precisa digitar endereço IP.';
  await communityRefresh();
 }catch(e){$('guest-network-state').textContent='Não foi possível detectar a rede: '+e.message;}
 finally{button.disabled=false;}
});
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
 const r=await window.launcher.communityInvite(id,target,'member',30);
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
