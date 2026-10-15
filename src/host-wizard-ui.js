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
    $('host-player-invite-generate').disabled=!(r.servicesReady&&r.googleActive&&r.adminKeySelected);
    if(!r.googleActive||!r.adminKeySelected)message('host-player-invite-status',
      !r.servicesReady?'Ligue Metagame e DeployServer primeiro.':
      !r.googleActive?'Ative a integração Google neste host para gerar convites de jogador.':
      'Selecione a conta administradora original e confirme o acesso ao Metagame.');
    $('google-host-invite').disabled=!r.googleActive||!r.adminKeySelected;
    $('google-sync').disabled=!r.googleActive||!r.adminKeySelected;
    $('google-host-upgrade').disabled=!r.googleActive||!r.adminKeySelected||!r.managedServices;
    $('host-start').disabled=r.servicesReady;
    $('host-stop').disabled=!r.servicesReady||!r.managedServices;
    $('host-select-admin').textContent=r.adminKeySelected?'✓ Conta administradora validada':'Selecionar conta administradora';
    message('adminKeyState',r.adminKeySelected?'Conta administradora confirmada pelo Metagame.':r.adminProblem||'Chave administradora não encontrada. Selecione a conta original.');
    message('host-overview',r.servicesReady?
      'Servidor ligado neste PC • serviços ativos'+(r.googleActive?' • contas Google conectadas':'')+'. Ramsgate e caçadas precisam de teste no jogo.':
      'Servidor desligado. Clique em Ligar meu servidor.');
    message('host-local-state',(r.servicesReady?
      (r.managedServices?'O servidor foi iniciado por este launcher. Abra o jogo para testar Ramsgate e caçadas.':'O servidor já está rodando por outro programa. Para encerrá-lo, utilize esse programa.'):
      'O servidor local não foi iniciado.')+(r.nativeMemoryWarning?' Atenção: memória livre baixa para abrir a cidade do jogo. Feche aplicativos pesados.':''));
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
    $('host-next-step').hidden=false;
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
      for(const id of ['google-host-activate','community-publish','community-invite-send','google-sync','google-host-invite','host-player-invite-generate'])$(id).disabled=true;
      $('host-publish-form').hidden=true;$('host-invite-section').hidden=true;
    }finally{loading=false;}
  }
  const remoteOptions=$('host-online-settings');
  remoteOptions.addEventListener('toggle',()=>{
    $('host-activation-help').hidden=!remoteOptions.open;
    if(remoteOptions.open)void refresh();
  });
  $('host-refresh').addEventListener('click',()=>void refresh());
  $('host-network-auto').addEventListener('click',async()=>{
    const button=$('host-network-auto');
    button.disabled=true;
    message('host-network-state','Detectando rede local e IP de saída…');
    try{
      const report=await window.launcher.networkDiagnose();
      if(!report?.ok)throw Error(report?.error||'Não foi possível consultar a rede.');
      const mode=$('google-network-mode').value;
      if(report.preferred&&mode==='lan'){
        $('google-network-address').value=report.preferred+':61000';
        wizard.userEdited=true;
      }
      if(report.publicIPv4&&mode==='public'){
        $('google-game-address').value=report.publicIPv4;
        wizard.userEdited=true;
      }
      message('host-network-state',report.preferred?'IP local encontrado automaticamente.'
        +(report.publicIPv4?' IP público de saída identificado por STUN.':' IP de saída não identificado (STUN indisponível).')
        +' Endereço de saída não prova acesso externo: partidas UDP e HTTPS ainda precisam funcionar.':
        'Nenhum IPv4 LAN encontrado. Confira Wi-Fi ou cabo. Nenhuma configuração foi alterada.');
      await refresh();
    }catch(e){message('host-network-state','Falha ao detectar sua rede: '+e.message);}
    finally{button.disabled=false;}
  });
  $('host-network-reset').addEventListener('click',async()=>{
    if(!window.confirm('Limpar apenas as preferências antigas de rede? O launcher salvará um backup das configurações. Chaves, saves e conta Google serão preservados.'))return;
    const button=$('host-network-reset');button.disabled=true;
    try{
      const r=await window.launcher.networkResetLegacy();
      if(!r?.ok)throw Error(r?.error||'Não foi possível limpar as preferências.');
      message('host-network-reset-state',r.message+(r.removed?.length?' Itens: '+r.removed.join(', '):''));
      wizard.userEdited=false;
      await settings();await refresh();
    }catch(e){message('host-network-reset-state','Preferências mantidas: '+e.message);}
    finally{button.disabled=false;}
  });
  $('host-start').addEventListener('click',async()=>{await action('start');await refresh();});
  $('host-play').addEventListener('click',()=>void action('play'));
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
