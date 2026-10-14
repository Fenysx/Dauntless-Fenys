# Dauntless Launcher Ultimate 1.8 — servidores da comunidade

## Como o jogador entra

A tela **Escolher servidor** oferece apenas **Servidor local** e **Servidores da comunidade**. O jogador faz login com Google e consulta o catálogo. O administrador do servidor define uma política:

| Política | Experiência |
|---|---|
| Entrada livre | Qualquer conta Google válida pode selecionar o servidor |
| Somente convidados | O dono envia convite por e-mail Google ou nome de usuário; o jogador aceita no sino 🔔 |

O sino consulta a API **fenys-community**, exibe convites pendentes e permite aceitar ou recusar. É possível cadastrar um nome de usuário único, com 3–20 caracteres, para ser encontrado sem expor e-mails no catálogo. Um jogador que ainda não escolheu nome pode receber convite pelo e-mail Google, inclusive antes do primeiro login no launcher.

O launcher novo não cria planos VIP ou cobranças. Convites novos são de membro comum; permissões antigas já registradas continuam reconhecidas no backend até que o proprietário decida migrá-las.

## Segurança e preservação

- A autenticação Google é validada no backend da Edge Function, e a identidade não pode ser fornecida livremente pelo renderer.
- Publicar um servidor exige **conta Google + chave administradora local + assinatura Ed25519 do host** já registrado no Supabase. Outro jogador não consegue anunciar um host que não controla.
- A Edge Function consulta os hosts registrados em \`fenys_global.google_hosts\`; servidores do catálogo precisam de origem **HTTPS pública**.
- O **host consulta a autorização no Supabase em toda entrada remota**, mesmo de quem já entrou antes. Uma autorização expirada/revogada não pode ser substituída por um botão no launcher.
- Se a consulta de permissão falhar, a entrada remota não é liberada automaticamente.
- As novas tabelas \`public.dlu_community_*\` usam RLS, sem acesso SQL direto para \`anon\`/\`authenticated\`. Apenas o backend com \`service_role\` consulta os dados. A credencial \`service_role\` nunca vai para o launcher.
- O sistema de personagem/saves fica no fluxo Google existente; não se cria automaticamente outro personagem para "substituir" um antigo. Migre primeiro o personagem pelo servidor de origem.
- Revogar acesso impede a próxima entrada; expulsar instantaneamente um jogador já em partida ainda é uma melhoria futura.

## Hospedar no próprio PC ou em uma VPS

1. Prepare um Windows compatível para hospedar o servidor de jogo e instale Node.js, Metagame, DeployServer e dependências. Configure as pastas \`UndauntedMetagame\` e \`UndauntedDeployServer\` com \`.env\` e \`dist/server.js\`.
2. Utilize um **IPv4 público** alcançável para as partidas UDP. DNS e TLS válidos são necessários para a API HTTPS do host, como \`https://jogo.exemplo.com:8443\`. Libere a porta TCP HTTPS escolhida e **UDP 8770–8777**, conforme a configuração atual do jogo. Não exponha diretamente TCP 61001.
3. No computador que controla o host, integre o servidor ao Google em **Administração avançada → Internet — HTTPS**, incluindo o IPv4 público de partida e o certificado/chave. Faça backup de saves e identidades antes dessa ativação; não a execute com jogadores online.
4. No mesmo host, após a integração, entre com sua conta Google e use **Publicar ou atualizar meu servidor**. A autenticação do administrador local precisa funcionar; um login Google sozinho não prova a posse do servidor.
5. Se o servidor for administrado por um amigo, ele configura seu próprio host/identidade e recebe autorização de outro host integrado, sem compartilhar sua chave privada.
6. Para usar o host sem manter o launcher aberto, rode os serviços com \`npm run host:run -- --repo "C:\caminho\dauntless-revived"\` na máquina Windows do servidor. Esse supervisor reinicia Metagame e DeployServer em falhas de processo. Configure o agendador de tarefas do Windows (execução ao iniciar o computador, com conta dedicada e diretório correto) ou um gerenciador de serviço Windows apropriado para iniciá-lo automaticamente ao ligar a VPS. **O script não instala uma tarefa ou serviço automaticamente.**
7. Teste com **dois computadores em redes externas distintas**, incluindo login, seleção de servidor, partida UDP real, desconexão, sincronização e restauração do progresso. Só depois desligue o antigo host.

A conta do jogador não precisa de Tailscale. **Supabase é controle de identidade, convites, permissões e persistência; não é servidor do jogo nem encaminha UDP.** Um host atrás de CGNAT sem IPv4 público precisará de VPS ou relay UDP (ainda não implementado). Não há garantias de conectividade em qualquer provedor sem teste.

## Implantar a API em uma réplica independente

Aplique **uma vez** \`supabase/community.sql\` **depois de** \`supabase/schema.sql\` e \`supabase/google-players.sql\`. Não reaplique arquivos de instalação de banco sobre produção sem migração e backup.

Publique \`supabase/functions/fenys-community/index.ts\` como **fenys-community**, na mesma URL Supabase usada pelo login Google. Use \`verify_jwt=false\` somente porque a própria Edge Function chama \`auth/v1/user\` para validar cada token Google; não remova essa validação. Configure \`SUPABASE_URL\` e \`SUPABASE_SERVICE_ROLE_KEY\` **somente na função**.

Os endereços do Supabase públicos usados pelo launcher devem apontar ao mesmo projeto dos hosts. Após publicar, \`GET /functions/v1/fenys-community\` responde \`{"service":"dlu-community","version":1}\`; operações protegidas sem token Google devem responder HTTP 401.

Para adicionar novo host, cadastre-o pela integração \`fenys-global/players\` antes de publicá-lo no catálogo. A conta Google mantém o personagem entre hosts compatíveis, mas não concede acesso automático a servidores privados: cada servidor continua autorizando seus convidados.

## Situação da versão beta

O banco, a API e os controles estão implementados. Os testes unitários/CI validam componentes isolados; **não** substituem um teste de partida real em uma VPS externa. Não é um serviço de hosting comercial pronto, não inclui cobrança e não inclui relay UDP.


## Proteção de personagens — 1.8.0-beta.2

- Entrar em **Servidor local** ou **Servidores da comunidade** não pode criar um personagem novo silenciosamente. Para uma conta Google ainda sem vínculo, o launcher tenta reconhecer a conta antiga do servidor de origem; se não encontrar, explica que a vinculação deve ser feita antes de migrar.
- Somente jogadores realmente novos podem confirmar explicitamente que desejam criar seu **primeiro** personagem e informar um nome de 3 a 16 letras, números ou sublinhado. O nome só é usado na criação; mudar de servidor não renomeia personagens vinculados.
- O fluxo de compatibilidade por convite DLU3 também exige essa confirmação antes da primeira criação. Cancelar a operação mantém a seleção e os dados anteriores.
- Se o host anterior ficar indisponível, o launcher não ignora um **lease Google ainda ativo**. Depois que o prazo de reserva da sessão no Supabase expirar, pode tentar a conexão no novo host; o broker continua responsável por recusar sessões duplas e atualizações conflitantes.
- Se o prazo do lease for desconhecido, a transferência não é liberada automaticamente. Aguarde a confirmação da nuvem e evite iniciar dois servidores simultaneamente com o mesmo personagem.

Essas proteções não substituem backup prévio, teste de recuperação e confirmação do save antes de formatar o computador ou desligar definitivamente o host de origem.


## Interface simplificada — 1.8.0-beta.3

A aba **Escolher servidor** é a área do jogador e exibe duas opções: **Servidor local** e **Servidores da comunidade**. Não é necessário informar IP, configurar Tailscale nem acessar chaves administrativas para apenas entrar em um servidor já publicado.

Administradores encontram as ferramentas em **Configurações → Hospedar um servidor — integração Google e comunidade** (ou **Escolher servidor → Configurar hospedagem**). O painel mantém três etapas: integrar o host Google de origem, publicar um host HTTPS público e convidar jogadores por e-mail Google/nome de usuário. O launcher indica se o host ainda está no modo LAN/rede privada, caso em que ele não pode ser publicado no catálogo da comunidade.

As ferramentas legadas por código, rede antiga e recuperação de contas continuam mantidas no código para compatibilidade; não são o fluxo principal de novos jogadores.

Se o catálogo mostrar "Nenhum servidor disponível", isso não significa que o login Google falhou. Consulte a saúde da API e confirme se algum servidor HTTPS já foi **publicado**. O Supabase não transforma um host LAN em servidor público automaticamente. Não publique TCP 61001 e não force a ativação pública com jogadores em partida.
