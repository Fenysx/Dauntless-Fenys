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
      mode==='tailscale'?Boolean(r.tailscale?.connected&&addr===r.tailscale.address+':61000'):
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
    $('host-player-invite-generate').disabled=!(r.servicesReady&&r.googleActive&&r.adminKeySelected&&(r.networkMode!=='tailscale'||r.tailscale?.connected));
    if(!r.googleActive||!r.adminKeySelected||(r.networkMode==='tailscale'&&!r.tailscale?.connected))message('host-player-invite-status',
      !r.servicesReady?'Ligue Metagame e DeployServer primeiro.':
      !r.googleActive?'Ative a integração Google neste host para gerar convites de jogador.':
      !r.adminKeySelected?'Selecione a conta administradora original e confirme o acesso ao Metagame.':'Conecte o Tailscale antes de gerar o convite.');
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
    message('host-internet-help',mode==='tailscale'?'Seu amigo precisa instalar Tailscale e aceitar o compartilhamento deste PC. Não abra portas no roteador. O código de jogador DLU3 continua sendo necessário.':mode==='lan'?'Este modo funciona no seu Wi-Fi. Um amigo em outra casa pode usar o modo Tailscale ou HTTPS público.':'Para amigos pela internet pública, configure HTTPS e portas de partida. Como alternativa privada, use Tailscale.');
    message('community-host-readiness',r.googleActive?'Integração Google confirmada pelo Metagame.':
      r.googleConfigured?'Há uma configuração Google salva, mas as rotas do servidor não responderam corretamente. Não vincule personagens até corrigir.':
      'Integração Google ainda não ativada neste servidor.');
    let next='';
    if(!r.servicesReady)next='Ligue seu servidor no passo 1. Para jogar sozinho, não é necessário configurar a nuvem.';
    else if(!r.managedServices)next='O servidor já está ligado por outro programa. Feche-o no programa original e inicie por este launcher para integrar Google.';
    else if(!r.googleActive||needsActivation){
      if(!r.adminKeySelected)next='2. Escolha a chave administradora original do servidor. Ela permanece no seu PC.';
      else if(!authorization)next='2. Autorização não encontrada. Clique em Selecionar autorização Supabase abaixo.';
      else if(!addressOK)next=mode==='tailscale'?'2. Conecte o Tailscale neste computador e clique em Verificar Tailscale. O IP privado será preenchido automaticamente.':mode==='lan'?(ips.length?'2. Escolha um endereço da lista de endereços locais disponíveis.':'2. Nenhum IPv4 local encontrado. Conecte este PC ao Wi-Fi e clique em Atualizar.'):'2. Informe o endereço HTTPS e IPv4 público e selecione os certificados.';
      else next='2. Com todos fora do jogo e backup conferido, ative a integração Google.';
    }else if(r.networkMode==='tailscale')next='Host Google no Tailscale. Gere um convite DLU3 e compartilhe este dispositivo pelo painel do Tailscale. O amigo precisa aceitar o compartilhamento antes de entrar.';
    else if(r.networkMode!=='public')next='Google na LAN. Para amigos de outras casas escolha Tailscale ou Internet/HTTPS.';
    else if(!r.signedIn)next='Entre com Google na aba Conta Google e convites para compartilhar seu servidor.';
    else if(!hasOwn)next='Salve o servidor na lista acima. Depois você poderá enviar convites Google.';
    else next='Seu servidor pode receber convites. Informe o e-mail Google ou usuário de um amigo.';
    message('host-next-step',next);
    $('host-next-step').hidden=false;
    message('host-activation-help',r.googleActive&&!needsActivation?'Integração ativa. Você não precisa reconfigurar.':next);
    message('host-publish-explanation',canPublish?
      (hasOwn?'Seu servidor está publicado. Você pode atualizar as informações e convidar amigos.':'Agora você pode publicar seu servidor para convidados ou para a comunidade.'):
      !r.googleActive?'Este passo fica disponível após confirmar a integração Google no servidor.':
      r.networkMode!=='public'?'Seu servidor é privado (LAN ou Tailscale). Use o convite direto DLU3 para amigos; somente hosts HTTPS públicos aparecem no catálogo.':
      'Entre com sua conta Google para publicar.');
    if(!r.googleActive&&r.servicesReady&&r.adminKeySelected&&!authorization)$('host-authorization-tools').open=true;
  }
  async function refresh(){
    if(loading||$('screen-host').hidden)return;
    loading=true;
    try{
      const result=await window.launcher.hostReadiness();
      if(!result?.ok)throw Error(result?.error||'Não foi possível verificar o host.');
      const ts=await window.launcher.tailscaleStatus();
      const vpn=ts?.ok?ts:null;
      state={...result,tailscale:vpn};
      $('tailscale-host-address').value=vpn?.connected?vpn.address+':61000':'';
      message('tailscale-state',vpn?.message||'Não foi possível verificar o Tailscale. Tente novamente.');
      $('google-tailscale-address-help').hidden=$('google-network-mode').value!=='tailscale';
      if($('google-network-mode').value==='tailscale'){
        const choices=$('google-lan-ip-suggestions');
        choices.replaceChildren();
        const value=vpn?.connected?vpn.address+':61000':null;
        if(value){
          const option=document.createElement('option');option.value=value;choices.append(option);
          if($('google-network-address').value!==value)$('google-network-address').value=value;
        }
        $('google-network-address-fields').hidden=false;
      }
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
  $('tailscale-refresh').addEventListener('click',async()=>{
    message('tailscale-state','Conferindo Tailscale neste PC…');
    await refresh();
  });
  $('tailscale-open-download').addEventListener('click',async()=>{
    const r=await window.launcher.tailscaleOpen('download');
    if(!r?.ok)message('tailscale-state','Não foi possível abrir o site do Tailscale: '+(r?.error||'erro'));
  });
  $('tailscale-open-share').addEventListener('click',async()=>{
    const r=await window.launcher.tailscaleOpen('share');
    if(!r?.ok)message('tailscale-state','Não foi possível abrir o compartilhamento: '+(r?.error||'erro'));
  });
  $('tailscale-start').addEventListener('click',async()=>{
    const button=$('tailscale-start');
    if(button.disabled)return;
    button.disabled=true;
    message('tailscale-state','Conferindo a VPN e iniciando Metagame e DeployServer…');
    try{
      const r=await window.launcher.tailscaleStart();
      if(!r?.ok)throw Error(r?.error||'Falha ao iniciar host Tailscale.');
      const ts=r.status?.tailscale;
      if(!ts?.address)throw Error('O Tailscale não retornou um IP válido.');
      $('google-network-mode').value='tailscale';
      $('google-network-address').value=ts.address+':61000';
      $('google-network-address-fields').hidden=false;
      $('host-online-settings').open=true;
      wizard.userEdited=true;
      message('tailscale-state',r.status.message);
      message('tailscale-guide',ts.ready?
        'Host Tailscale e Google ativos. Compartilhe este PC no Tailscale, depois use Gerar convite de jogador DLU3.':
        'Metagame e DeployServer iniciados. Falta ativar o Google neste modo: confirme conta administradora e autorização, depois clique Preparar acesso Google neste servidor.');
      await refresh();
    }catch(e){message('tailscale-state','Não foi possível iniciar: '+e.message);$('admin-server-settings').open=true;}
    finally{button.disabled=false;}
  });
  $('tailscale-copy-info').addEventListener('click',async()=>{
    const info=await window.launcher.tailscaleStatus();
    if(!info?.ok||!info.connected){message('tailscale-guide','Conecte o Tailscale neste PC antes de enviar instruções.');return;}
    const share=$('tailscale-share-link').value.trim();
    if(share&&!/^https:\/\/login\.tailscale\.com\/[^\s]+$/.test(share)){
      message('tailscale-guide','Use um link de compartilhamento https://login.tailscale.com/... gerado no painel oficial.');
      return;
    }
    const lines=[
      'Dauntless Launcher Ultimate — convite para servidor privado',
      '1. Instale o Tailscale: https://tailscale.com/download',
      '2. Entre no Tailscale e aceite o compartilhamento deste computador.',
      ...(share?['Compartilhamento do dispositivo: '+share]:['Peça ao anfitrião o compartilhamento do PC no painel do Tailscale.']),
      '3. Endereço do host: '+info.address+':61000',
      '4. No Dauntless Launcher Ultimate, entre com Google.',
      '5. Peça também o convite temporário DLU3 (código de jogador).',
      '6. Em Escolher servidor, cole o convite DLU3 e clique em Entrar usando convite.',
      '7. Só depois de confirmar a conexão, clique em Jogar agora.',
      'Não compartilhe chaves administrativas, arquivos .env ou autorização Supabase.'
    ];
    try{
      await navigator.clipboard.writeText(lines.join('\n'));
      message('tailscale-guide','Instruções copiadas. Compartilhe o PC pelo Tailscale e envie também o código DLU3 ao seu amigo.');
    }catch(e){message('tailscale-guide','Não foi possível copiar. Verifique a permissão de área de transferência.');}
  });
  $('host-start').addEventListener('click',async()=>{
    const result=await action('start');
    await refresh();
    if(!result?.ok){
      $('host-local-state').textContent='Não foi possível ligar o servidor: '+(result?.error||'erro desconhecido')+'. Abra Diagnóstico e arquivos do servidor → Verificar instalação.';
      $('admin-server-settings').open=true;
    }
  });
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
