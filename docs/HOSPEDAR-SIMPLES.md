# Hospedar meu Dauntless — guia simples

A partir da interface 1.8.0-beta.5, use **Meu servidor** em vez de procurar integrações dentro de Configurações. O launcher mostra etapas de hospedagem e esconde os controles técnicos em **Configurações avançadas e diagnóstico**. A conta Google do jogador continua separada da identidade do host.

## 1. Jogar sozinho no próprio computador

1. Abra **Meu servidor → Neste PC — jogar sozinho ou na rede local**.
2. Clique em **Iniciar meu servidor** e verifique a mensagem de Metagame/DeployServer.
3. Clique em **Jogar Agora** na visão geral. Um Metagame online não comprova que Ramsgate iniciou; teste a cidade e uma caçada.

**Não é obrigatório integrar o Google para continuar jogando com sua conta antiga no servidor local.** Antes de transferir personagem entre hosts, é necessário configurar a integração Google, conferir backup e vincular com segurança a conta original.

> A escolha de LAN identifica o host neste PC, mas **não publica automaticamente** um servidor para a internet nem garante que amigos na LAN consigam entrar sem configuração adicional do cliente e da conta.

## 2. Preparar progresso Google, sem perder personagem

1. Faça backup de `undaunted.db`, identidade/chaves, `account.key` e arquivos `.env`; guarde uma cópia criptografada fora do PC. **Não substitua a chave antiga**.
2. Com todos fora do jogo, inicie os serviços pelo launcher; em **Meu servidor**, selecione a chave de administrador **local** e a autorização inicial **Supabase** do dono.
3. Na LAN, escolha o IPv4 identificado do próprio computador (p.ex. `192.168.1.20:61000`). O loopback `127.0.0.1` não pode ser anunciado como host LAN na nuvem. Se houver várias placas de rede, selecione a realmente acessível.
4. Clique em **Ativar integração Google** e aguarde a compilação/reinicialização do Metagame. A tela consulta **a rota real de status** do host; login Google sozinho não indica que ele foi ativado.
5. Somente quando a integração estiver confirmada, vincule o **personagem já existente** ao Google e valide um backup e a restauração em ambiente isolado. **Não crie um personagem novo por engano.**

Se aparecer *Unstubbed route /launcher/google/status*, o host não reconhece a integração. Abra **Configurações avançadas e diagnóstico** e verifique os erros. Não tente publicar ou migrar saves até corrigir.

## 3. Amigos pela internet — usar o PC atual

1. Em **Meu servidor**, escolha **Neste PC — amigos pela internet**.
2. Informe o endereço **HTTPS público** válido da API (p.ex. `https://jogo.seudominio.com:8443`) e um IPv4 público de partida; selecione certificado e chave TLS válidos. A internet precisa alcançar a porta HTTPS escolhida e **UDP 8770–8777**.
3. Se o roteador estiver atrás de **CGNAT**, pedir senha não resolve o problema de alcance: solicite IP público ao provedor, use uma VPS compatível ou outra solução de rede adequada. O launcher **não oferece relay UDP**.
4. Não exponha a porta de administração **TCP 61001** diretamente na internet. Siga o proxy/gateway seguro do projeto.
5. Com backup e todos desconectados, integre o host no modo público, aguarde o status **Google integrado e registrado**, entre com Google no launcher e clique em **Publicar na comunidade**.
6. Dê um nome ao servidor; escolha **Privado — somente convidados pelo Google** (padrão) ou **Público — jogadores Google**. Convide o amigo por e-mail ou nome de usuário. O convite chega no sino, sem colar um código enorme.
7. Teste com **um segundo computador em outra rede**: conexão HTTPS, portas UDP, carregamento de Ramsgate e caçadas, permissões Google, progresso e reconexão. **O fato de publicar no catálogo não prova que o servidor está acessível externamente.**

**Senha como Minecraft:** o fluxo seguro atual usa identidade Google e permissões conferidas no host. Adicionar uma senha curta por IP exige validação no **servidor**, limitação de tentativas e proteção do tráfego. Não existe ainda autenticação por senha de servidor neste projeto; nenhum botão deve fingir que uma senha local protegerá o acesso.

## 4. Futuramente, uma VPS

- A VPS é **outro computador**: o botão **Iniciar meu servidor** liga apenas o host local, não o remoto.
- Instale nela a base compatível (Metagame, DeployServer, binário nativo/DLL, configuração), TLS público e portas de partida.
- Prepare backup e identidade Google do host segundo `docs/COMUNIDADE.md`.
- Para manter um host Windows online **sem depender do Electron**, use `npm run host:run -- --repo "C:\\caminho\\dauntless-revived"` **na máquina servidora** e configure um gerenciador de serviço/Agendador do Windows. Esse script **não** cria sozinho um serviço 24/7.
- Mantenha o host antigo e os backups até validar a transição de personagem e progresso.

## Segurança e limites

- Nada dessa interface altera `account.key` automaticamente.
- Os controles de administração e as chaves permanecem locais e exigem a identidade do dono.
- A integração Google/Supabase não encaminha o tráfego UDP do jogo.
- A tela separa os passos, mas depende de autorização Supabase, conectividade e testes reais. **Hospedagem e sincronização entre dois PCs ainda não foram validadas em ambiente de produção.**
