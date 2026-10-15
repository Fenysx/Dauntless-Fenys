'use strict';
// Read-only hosting guide. Only existing Electron actions can change the server.
// Progress and publishing controls depend on the live Metagame Google route, not on a settings flag.
(() => {
  const $ = id => document.getElementById(id);
  let loading = false, state = null;
  const wizard = {userEdited:false, refresh};
  window.hostWizard = wizard;
  function message(id,text){$(id).textContent=text;}
  function update(){
    const r = state;
    if(!r)return;
    const mode=$('google-network-mode').value,addr=$('google-network-address').value.trim();
    const ips=Array.from($('google-lan-ip-suggestions').options,x=>x.value);
    const addressOK=mode==='lan'?ips.includes(addr):
      mode==='public'?/^https:\/\/[^\s/]+/i.test(addr)
        && /^\d{1,3}(?:\.\d{1,3}){3}$/.test($('google-game-address').value.trim())
        && r.publicCertSelected && r.publicKeySelected:false;
    const authorization=r.authorizationSelected||r.identityPresent||/^DLUH3\.[\w-]+$/.test($('google-host-code').value.trim());
    message('host-authorization-state',r.googleActive?'Integração Google já ativa.':r.identityPresent?'Identidade do host encontrada neste PC.':r.authorizationSelected?'✓ Autorização Supabase válida encontrada neste PC.':'Autorização ainda não selecionada. O launcher procurará um arquivo válido automaticamente.');
    const needsActivation=!r.googleActive||r.networkMode!==mode||r.advertisedAddress!==addr||(mode==='public'&&r.gameAddress!==$('google-game-address').value.trim());
    const canActivate=r.servicesReady&&r.managedServices&&r.adminKeySelected&&authorization&&addressOK&&needsActivation;
    $('google-host-activate').disabled=!canActivate;
    $('host-check-services').classList.toggle('complete',r.servicesReady);
    $('host-check-google').classList.toggle('complete',r.googleActive);
    const canPublish=r.servicesReady&&r.googleActive&&r.networkMode==='public'&&r.signedIn;
    $('host-check-public').classList.toggle('complete',canPublish);
    $('host-publish-form').hidden=!canPublish;
    $('community-publish').disabled=!canPublish;
    const hasOwn=Boolean($('community-owner-server').value);
    $('host-invite-section').hidden=!canPublish||!hasOwn;
    $('community-invite-send').disabled=!canPublish||!hasOwn;
    $('community-revoke').disabled=!canPublish||!hasOwn;
    $('google-host-invite').disabled=!r.googleActive||!r.adminKeySelected;
    $('google-sync').disabled=!r.googleActive||!r.adminKeySelected;
    $('host-start').disabled=r.servicesReady;
    $('host-stop').disabled=!r.servicesReady||!r.managedServices;
    $('host-select-admin').textContent=r.adminKeySelected?'✓ Conta administradora selecionada':'Selecionar conta administradora';
    message('host-overview',r.servicesReady?
      'Servidor local ligado • Metagame e DeployServer online • Ramsgate ainda não testada'+(r.googleActive?' • Google pronto':''):
      'Servidor desligado');
    message('host-local-state',r.servicesReady?
      (r.managedServices?'Serviços básicos ativos pelo launcher. Teste Ramsgate e uma caçada para confirmar o servidor de jogo.':'Serviços abertos por outro programa. Para ativar a integração, encerre-os com segurança e reinicie pelo launcher.'):
      'Clique em Iniciar servidor para jogar neste PC.');
    message('host-internet-help',mode==='lan'?'Este modo funciona no seu Wi-Fi. Um amigo em outra casa precisa de acesso HTTPS público e portas de jogo disponíveis.':'Para amigos pela internet, configure HTTPS e as portas de partida. O launcher não cria automaticamente um túnel ou VPS.');
    message('community-host-readiness',r.googleActive?'Integração Google confirmada pelo Metagame.':
      r.googleConfigured?'Há uma configuração Google salva, mas as rotas do servidor não responderam corretamente. Não vincule personagens até corrigir.':
      'Integração Google ainda não ativada neste servidor.');
    let next='';
    if(!r.servicesReady)next='Ligue seu servidor no passo 1. Para jogar sozinho, não é necessário configurar a nuvem.';
    else if(!r.managedServices)next='O servidor já está ligado por outro programa. Feche-o no programa original e inicie por este launcher para integrar Google.';
    else if(!r.googleActive||needsActivation){
      if(!r.adminKeySelected)next='2. Escolha a chave administradora original do servidor. Ela permanece no seu PC.';
      else if(!authorization)next='2. Autorização não encontrada. Clique em Selecionar autorização Supabase abaixo.';
      else if(!addressOK)next=mode==='lan'?(ips.length?'2. Escolha um endereço da lista de endereços locais disponíveis.':'2. Nenhum IPv4 local encontrado. Conecte este PC ao Wi-Fi e clique em Atualizar.'):'2. Informe o endereço HTTPS e IPv4 público e selecione os certificados.';
      else next='2. Com todos fora do jogo e backup conferido, ative a integração Google.';
    }else if(r.networkMode!=='public')next='Google funcionando na rede local. Para amigos de outras redes, configure Internet/HTTPS e IP público ou VPS.';
    else if(!r.signedIn)next='Entre com Google na aba Conta Google e convites para compartilhar seu servidor.';
    else if(!hasOwn)next='Salve o servidor na lista acima. Depois você poderá enviar convites Google.';
    else next='Seu servidor pode receber convites. Informe o e-mail Google ou usuário de um amigo.';
    message('host-next-step',next);
    message('host-activation-help',r.googleActive&&!needsActivation?'Integração ativa. Você não precisa reconfigurar.':next);
    message('host-publish-explanation',canPublish?
      (hasOwn?'Seu servidor está publicado. Você pode atualizar as informações e convidar amigos.':'Agora você pode publicar seu servidor para convidados ou para a comunidade.'):
      !r.googleActive?'Este passo fica disponível após confirmar a integração Google no servidor.':
      r.networkMode!=='public'?'Seu servidor está em rede local. Para entrar pela internet, é necessário HTTPS válido, IPv4 público ou VPS, e portas UDP 8770–8777.':
      'Entre com sua conta Google para publicar.');
    if(!r.googleActive&&r.servicesReady&&r.adminKeySelected&&!authorization)$('host-authorization-tools').open=true;
  }
  async function refresh(){
    if(loading||$('screen-host').hidden)return;
    loading=true;
    try{
      const result=await window.launcher.hostReadiness();
      if(!result?.ok)throw Error(result?.error||'Não foi possível verificar o host.');
      state=result;
      if($('google-network-mode').value==='lan'){
        // Populate the options before checking addressOK. Multiple adapters must not leave activation stuck.
        try{
          const suggestions=await window.launcher.localAddresses();
          const values=[...new Set((suggestions.addresses||[]).map(ip=>ip+':61000'))];
          const choices=$('google-lan-ip-suggestions');
          choices.replaceChildren();
          for(const value of values){const option=document.createElement('option');option.value=value;choices.append(option);}
          if(values.length&&!values.includes($('google-network-address').value.trim())){
            $('google-network-address').value=values[0];
          }
          $('google-network-address-fields').hidden=false;
        }catch(e){message('host-next-step','Não foi possível consultar os IPs locais: '+e.message);}
      }
      update();
    }catch(e){
      state=null;message('host-overview','Não foi possível verificar este PC: '+e.message);
      message('host-next-step','Confira se o servidor está instalado e tente Atualizar.');
      for(const id of ['google-host-activate','community-publish','community-invite-send','google-sync','google-host-invite'])$(id).disabled=true;
      $('host-publish-form').hidden=true;$('host-invite-section').hidden=true;
    }finally{loading=false;}
  }
  $('host-refresh').addEventListener('click',()=>void refresh());
  $('host-start').addEventListener('click',async()=>{await action('start');await refresh();});
  $('host-stop').addEventListener('click',async()=>{await action('stop');await refresh();});
  $('host-select-admin').addEventListener('click',async()=>{
    try{const result=await window.launcher.pickAdminKey();if(result?.selected)message('adminKeyState','Chave original selecionada neste computador.');await settings();await refresh();}
    catch(e){message('host-next-step','Não foi possível selecionar a conta administradora: '+e.message);}
  });
  $('players-open').addEventListener('click',()=>{setScreen('players');void playersRefresh();});
  $('google-network-mode').addEventListener('change',()=>{wizard.userEdited=true;void refresh();});
  for(const id of ['google-network-address','google-game-address']){
    $(id).addEventListener('input',()=>{wizard.userEdited=true;update();});
  }
  $('google-host-code').addEventListener('input',update);
  // Do not query legacy Google routes while the user is elsewhere in the launcher.
  setInterval(()=>{if(!loading&&!operating)void refresh();},45000);
})();
