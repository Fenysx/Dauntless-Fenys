# Jogar com amigos — Dauntless Launcher Ultimate beta.12

O fluxo de convite de **jogador** é independente de publicar um servidor no catálogo. Não compartilhe chaves administrativas, autorização do Supabase ou arquivo `google-host.json`.

## 1. Preparar o computador anfitrião

1. Abra **Hospedar servidor → Ligar meu servidor**. Metagame (TCP 61000) e DeployServer (TCP 61001) devem ficar ligados.
2. Clique em **Diagnóstico e arquivos do servidor → Verificar instalação** se algum serviço não iniciar. Confirme pasta contendo `UndauntedMetagame`, `UndauntedDeployServer`, seus `.env` e `dist/server.js`.
3. Abra **Convidar amigos ou publicar um servidor**. Escolha o modo da rede:
   - **Mesmo Wi-Fi/LAN**: selecione um IPv4 real do computador host (por exemplo, `192.168.1.20:61000`). A API Google será disponibilizada somente nessa interface de rede e o cliente da partida precisará alcançá-la; não requer internet pública para transportar a partida, embora autenticação e saves Google exijam acesso ao Supabase.
   - **Outra casa/internet**: configure um domínio HTTPS público com TLS válido, porta TCP HTTPS acessível e IPv4 público alcançável para o tráfego **UDP 8770–8777**. Sem IPv4 público/encaminhamento UDP (por exemplo, sob CGNAT), será necessária hospedagem numa VPS ou relay UDP administrado separadamente. **O launcher não provisiona relay/VPS nem abre roteador automaticamente**.
4. Selecione ou confirme a chave administrativa do **seu** Metagame. O launcher também procura uma conta administrativa antiga já protegida e valida a permissão no Metagame.
5. Com todos fora do jogo e backup local da base `undaunted.db`, clique em **Preparar acesso Google neste servidor**. Um host já integrado com as mesmas configurações não precisa ser ativado novamente.
6. Depois que o Metagame confirmar a rota `/launcher/google/status` e o cadastro do host, clique em **Gerar convite de jogador**. O código começa com `DLU3.` e expira em aproximadamente **15 minutos**. É código **de jogador**, diferente de `DLUH3.` para autorizar **outro anfitrião**.

## 2. Entrada do amigo

1. O amigo instala o Dauntless Launcher Ultimate e os arquivos necessários do cliente Dauntless Revived 1.4.4.
2. Na aba **Conta Google e convites**, entra com Google. Se já tem personagem, vincula o personagem original antes de transferir de servidor. Nunca crie outro personagem para contornar erro de vínculo.
3. Na aba **Escolher servidor → Entrar no servidor de um amigo**, cola o código `DLU3.`, clica em **Entrar usando convite** e confirma a criação somente se for realmente novo.
4. O host valida o código, o Google e a reserva de progresso no Supabase. O launcher seleciona o endereço do anfitrião apenas após a confirmação. Clique em **Jogar agora**.
5. Confirme numa partida real em dois computadores que a cidade (Ramsgate), a caçada, o inventário, o progresso e as portas UDP funcionam. Os testes de API não substituem uma partida real.

## 3. Diagnóstico

- **Botão Ligar falha**: leia o erro exibido em Hospedar servidor e use Verificar instalação. Servidor iniciado por outro programa não pode ser interrompido ou reconfigurado silenciosamente.
- **Google indisponível**: confira se o host está integrado. Login Google no launcher não instala rotas dentro do Metagame.
- **O convidado não alcança status do host**: verifique se está no mesmo Wi-Fi/sub-rede, firewall do Windows e IP do host. Para internet, confirme DNS, TLS, TCP e encaminhamento NAT. A resposta do próprio host a seu IP não confirma acesso externo.
- **Convite expirou**: gere um novo. Não reuse `DLUH3.` (código de anfitrião) para jogadores.
- **Jogo abre, mas caçada não conecta**: a API TCP pode funcionar sem as portas de jogo UDP; confira anúncio do DeployServer, TCP HTTPS e UDP 8770–8777 externamente.
- **CGNAT**: um IP descoberto por STUN é o IP de saída, não prova que a conexão de entrada existe. Solicite IPv4 público ao provedor ou use uma VPS com transporte UDP seguro.
- **Erro de save/vínculo**: preserve banco e chaves locais; não faça logout, migração à força ou restauração de snapshot sem confirmar a revisão no Supabase.

## Escopo dos testes

O novo teste `fenys-google.test.js` cobre dois usuários Google independentes conectando ao mesmo host por convite de jogador, sem catálogo, sem compartilhar chave administrativa, e sem criar personagem implicitamente. `launcher-buttons.test.js` confere os controles e chamadas IPC. Os testes automatizados são simulações: a validação física entre dois computadores (incluindo TCP/HTTPS e UDP) continua necessária para declarar a hospedagem externa operacional.
