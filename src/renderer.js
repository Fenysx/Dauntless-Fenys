'use strict';
const $=id=>document.getElementById(id);
const screens={dashboard:'VISÃO GERAL',services:'CENTRAL DO SERVIDOR',players:'JOGADORES ONLINE',invites:'CONVITES',settings:'CONFIGURAÇÕES',activity:'ATIVIDADES'};
const controls=['play','start','stop','restart','start2','stop2','restart2','refresh'];
let me=null,operating=false,playersBusy=false;
function note(message,error=false){
 const msg=String(message);
 $('feedback').textContent=msg;
 const banner=$('global-feedback');banner.textContent=msg;banner.hidden=false;banner.classList.toggle('is-error',error);
 $('activity').textContent='['+new Date().toLocaleTimeString('pt-BR')+'] '+msg+'\n'+$('activity').textContent;
}
function formNote(id,message,error=false){
 $(id).textContent=message;$(id).classList.toggle('is-error',error);
 note(message,error);
}
function authMessage(message,error=false){
 $('auth-message').textContent=message;
 $('auth-message').classList.toggle('is-error',error);
}
window.addEventListener('error',e=>note('Erro na interface: '+e.message,true));
window.addEventListener('unhandledrejection',e=>note('Falha na interface: '+String(e.reason?.message||e.reason),true));
function setScreen(name){
 if((name==='services'||name==='invites')&&me?.role!=='admin')name='dashboard';
 for(const [key,label] of Object.entries(screens)){
  const selected=name===key;
  const section=$('screen-'+key);
  section.hidden=!selected;section.classList.toggle('active',selected);
  document.querySelector('[data-screen="'+key+'"]').classList.toggle('active',selected);
 }
 $('screen-label').textContent=screens[name];
}
function renderStatus(s){
 for(const [name,primary,secondary] of [['metagame','metagame','metagame-service'],['deploy','deploy','deploy-service']]){
  const online=Boolean(s[name]);
  const el=$(primary);el.textContent=online?'Online':'Offline';el.className='metric-value '+(online?'online':'offline');
  const badge=$(secondary);badge.textContent=online?'Online':'Offline';badge.className='state'+(online?' on':'');
 }
 const isAdmin=me?.role==='admin', owned=Array.isArray(s.owned)?s.owned:[];
 const localControls=isAdmin&&!s.remote;
 $('service-detail').textContent=!isAdmin?'Conta comum: você pode jogar, mas não controlar os serviços.':
  s.remote?'O servidor é remoto. Só o computador hospedeiro pode iniciar ou parar os serviços.':
  owned.length?'Serviços iniciados nesta sessão: '+owned.join(', '):'Nenhum processo iniciado nesta sessão pelo Fenys.';
 for(const id of ['stop','stop2','restart','restart2'])$(id).disabled=!localControls||!owned.length||operating;
 for(const id of ['start','start2'])$(id).disabled=!localControls||operating;
 if(s.remote){
  $('deploy').textContent='Somente host';
  $('deploy-service').textContent='Somente host';
 }
}
async function refresh(){
 if(!me)return;
 try{renderStatus(await window.launcher.status());}
 catch(e){note('Falha ao consultar status: '+e.message,true);}
}
async function playerRefresh(){
 if(!me||playersBusy)return;playersBusy=true;
 $('playersMessage').textContent='Consultando o servidor…';$('playersList').replaceChildren();
 try{
  const result=await window.launcher.players();
  if(!result.ok)throw new Error(result.error||'Consulta não concluída.');
  const data=result.data;
  if(data.limited){
   $('players-count').textContent='—';
   $('playersMessage').textContent='Uma conta válida é necessária para consultar a lista de jogadores.';
  }else{
   $('players-count').textContent=String(data.count);
   $('playersMessage').textContent=data.count+' jogador(es) detectado(s) recentemente.';
   const locations={menu:'Menu',city:'Ramsgate',hunt:'Caçada',dojo:'Dojo',tutorial:'Tutorial',unknown:'Desconhecido'};
   for(const p of data.players){
    const line=document.createElement('div');line.className='fenys-player';
    const label=document.createElement('strong');label.textContent=p.name;
    const where=document.createElement('span');where.textContent=locations[p.where]||'Desconhecido';
    line.append(label,where);$('playersList').append(line);
   }
  }
 }catch(e){$('players-count').textContent='—';$('playersMessage').textContent=e.message;}
 finally{playersBusy=false;}
}
async function loadSettings(){
 try{
  const c=await window.launcher.getSettings();
  $('repo').textContent=c.repoPath||'Somente administrador';
  $('exe').textContent=c.launcherExe||'Não configurado';
  $('serverAddress').value=c.gameServer||'127.0.0.1:61000';
  $('serverSave').disabled=true;
  $('accountKeyState').textContent='Conta vinculada: '+me.username;
  $('adminKeyState').textContent=me.role==='admin'?'Validada pelo servidor':'Somente administrador';
  $('adminKeyPick').disabled=true;
  $('playerKeyPick').disabled=true;
  $('repoPick').disabled=me.role!=='admin';
 }catch(e){note('Configurações: '+e.message,true);}
}
async function action(type){
 if(!me||operating)return;
 if((type==='start'||type==='stop'||type==='restart')&&me.role!=='admin'){
  note('Acesso negado: somente administradores podem controlar o servidor.',true);return;
 }
 if((type==='stop'||type==='restart')&&!window.confirm('Confirma a operação nos serviços locais?'))return;
 operating=true;for(const id of controls)$(id).disabled=true;
 note(({start:'Iniciando serviços…',stop:'Encerrando serviços…',restart:'Reiniciando serviços…',play:'Iniciando o jogo com a conta '+me.username+'…'})[type]);
 try{
  const r=await window.launcher[type]();
  if(!r?.ok)throw new Error(r?.error||'Operação não concluída.');
  renderStatus(r.status);
  note(type==='play'?'Jogo iniciado com seu perfil selecionado.':'Operação concluída.');
 }catch(e){note(e.message,true);}
 finally{operating=false;for(const id of controls)$(id).disabled=false;await refresh();}
}
function viewAuth(mode){
 for(const key of ['login','register','import','recover']){
  $('auth-panel-'+key).hidden=key!==mode;
  const tab=document.querySelector('[data-auth-mode="'+key+'"]');
  tab.classList.toggle('active',key===mode);
 }
 $('auth-heading').textContent=({login:'Entrar no Fenys',register:'Criar conta de jogador',import:'Vincular conta existente',recover:'Recuperar meu acesso'})[mode];
 authMessage('Selecione uma conta e siga as instruções.');
}
async function showState(){
 const state=await window.launcher.authState();
 const select=$('login-user');select.replaceChildren();
 const option=document.createElement('option');option.value='';option.textContent='Selecione o perfil';select.append(option);
 for(const p of state.profiles){
  const item=document.createElement('option');item.value=p.username;
  item.textContent=p.username+(p.role==='admin'?' • Administrador':' • Jogador');select.append(item);
 }
 me=state.current;
 if(!me){
  $('app-shell').hidden=true;$('auth-shell').hidden=false;
  $('recovery-box').hidden=true;
  for(const el of document.querySelectorAll('.auth-tabs'))el.hidden=false;
  viewAuth('login');return;
 }
 $('auth-shell').hidden=true;$('app-shell').hidden=false;
 $('profile-display').textContent=me.username+(me.role==='admin'?' • ADMIN':' • JOGADOR');
 for(const el of document.querySelectorAll('.admin-only'))el.hidden=me.role!=='admin';
 $('admin-control-card').hidden=me.role!=='admin';
 setScreen('dashboard');await loadSettings();await refresh();
}
function recovery(code){
 $('auth-shell').hidden=false;$('app-shell').hidden=true;
 $('recovery-box').hidden=false;
 for(const el of document.querySelectorAll('.auth-tabs, .auth-panel'))el.hidden=true;
 $('recovery-value').value=code;
 $('auth-heading').textContent='Seu código de recuperação';
 authMessage('Guarde este código em local seguro. Não será mostrado outra vez.');
}
async function doAuth(fn){
 authMessage('Processando…');
 try{
  const r=await fn();
  if(!r?.ok)throw new Error(r?.error||'Operação não concluída.');
  if(r.recoveryCode)recovery(r.recoveryCode);
  else await showState();
 }catch(e){authMessage(e.message||'Falha desconhecida.',true);}
}
for(const node of document.querySelectorAll('[data-auth-mode]'))
 node.addEventListener('click',()=>viewAuth(node.dataset.authMode));
$('auth-login').addEventListener('click',()=>doAuth(()=>window.launcher.login($('login-user').value,$('login-pass').value)));
$('auth-register').addEventListener('click',()=>doAuth(async()=>{
 const set=await window.launcher.setServer($('reg-server').value);
 if(!set.ok)throw new Error(set.error);
 return window.launcher.createAccount($('reg-user').value,$('reg-pass').value,$('reg-code').value);
}));
$('auth-import').addEventListener('click',()=>doAuth(async()=>{
 const set=await window.launcher.setServer($('import-server').value);
 if(!set.ok)throw new Error(set.error);
 return window.launcher.importAccount($('import-user').value,$('import-pass').value);
}));
$('auth-recover').addEventListener('click',()=>doAuth(()=>window.launcher.recoverAccount($('reset-user').value,$('reset-code').value,$('reset-pass').value)));
$('recovery-ack').addEventListener('click',()=>{
 $('recovery-value').value='';
 for(const el of document.querySelectorAll('.auth-tabs'))el.hidden=false;
 showState().catch(e=>authMessage(e.message,true));
});
$('profile-switch').addEventListener('click',async()=>{
 if(!window.confirm('Sair do Fenys? Feche o jogo antes de trocar de personagem.'))return;
 await window.launcher.logout();$('login-pass').value='';await showState();
});
$('profile-change-password').addEventListener('click',()=>{$('password-dialog').hidden=false;});
$('password-cancel').addEventListener('click',()=>{$('password-dialog').hidden=true;});
$('password-apply').addEventListener('click',async()=>{
 try{
  const r=await window.launcher.changePassword($('password-old').value,$('password-new').value);
  if(!r.ok)throw new Error(r.error);
  $('password-dialog').hidden=true;$('password-old').value='';$('password-new').value='';
  recovery(r.recoveryCode);
 }catch(e){note('Não foi possível mudar a senha: '+e.message,true);}
});
for(const node of document.querySelectorAll('[data-screen]'))node.addEventListener('click',()=>{
 setScreen(node.dataset.screen);
 if(node.dataset.screen==='players')void playerRefresh();
});
$('playersRefresh').addEventListener('click',playerRefresh);
$('play').addEventListener('click',()=>action('play'));
for(const id of ['start','start2'])$(id).addEventListener('click',()=>action('start'));
for(const id of ['stop','stop2'])$(id).addEventListener('click',()=>action('stop'));
for(const id of ['restart','restart2'])$(id).addEventListener('click',()=>action('restart'));
$('refresh').addEventListener('click',refresh);
$('repoPick').addEventListener('click',async()=>{
 try{await window.launcher.pickRepo();await loadSettings();}catch(e){note(e.message,true);}
});
$('exePick').addEventListener('click',async()=>{
 try{await window.launcher.pickLauncher();await loadSettings();}catch(e){note(e.message,true);}
});
$('serverSave').addEventListener('click',()=>note('Para trocar de servidor, saia da conta e crie ou importe um perfil para aquele servidor.',true));
$('adminKeyPick').addEventListener('click',()=>note('Os privilégios são reconhecidos automaticamente quando você importa a conta administradora.',true));
$('playerKeyPick').addEventListener('click',()=>note('Para vincular outra conta existente, saia e use Importar conta.',true));
$('invite-create').addEventListener('click',async()=>{
 const button=$('invite-create');button.disabled=true;
 $('invite-result').value='';
 formNote('invite-status','Solicitando convite ao Metagame…');
 try{
  const r=await window.launcher.createInvite($('invite-name').value);
  if(!r.ok)throw new Error(r.error);
  $('invite-result').value=r.code;
  formNote('invite-status','Convite criado. Envie apenas para seu amigo. Após o primeiro cadastro não precisará de novo convite.');
 }catch(e){formNote('invite-status',e.message,true);}
 finally{button.disabled=false;}
});
$('clear').addEventListener('click',()=>{$('activity').textContent='';});
if(window.launcher?.authState){
 window.launcher.onActivity(message=>{if(me?.role==='admin')note(message);});
 showState().catch(e=>authMessage('Erro ao carregar perfis: '+e.message,true));
 setInterval(()=>{if(me&&!operating)void refresh();},10000);
 setInterval(()=>{if(me&&!operating&&!$('screen-players').hidden)void playerRefresh();},30000);
}else{authMessage('O componente Electron não carregou. Reinicie o launcher com npm start.',true);}
