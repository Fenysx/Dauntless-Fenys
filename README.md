# Dauntless Launcher Ultimate

Launcher comunitário para **Dauntless Revived 1.4.4**, com controle local de serviços, conexão privada por Tailscale, cadastro individual de jogadores e convites de uso único do Metagame.

**Não inclui o cliente proprietário do Dauntless**, nem fornece downloads do jogo. O cliente inicia nativamente no **Windows** e possui integração experimental com **Wine no Linux**. A execução de partidas no Wine ainda precisa ser validada com o cliente 1.4.4.

## Google + personagem na nuvem (1.6.0-beta.2)

O fluxo principal é **Continuar com Google → colar código do servidor → jogar**. O login abre no navegador e usa Supabase Auth com PKCE. Não há senha própria do launcher, nem arquivo de chave de jogador para guardar. Iniciar, desligar e reiniciar os serviços locais continua disponível sem entrar com Google.

### Situação da configuração

A API v3 e o banco privado já estão publicados no projeto selecionado. **O provedor Google ainda está desativado**: o dono precisa configurar um cliente OAuth próprio do Google antes de usar o login real. O launcher verifica isso e mostra a pendência; não simula um login bem-sucedido.

1. No [Google Auth Platform](https://console.cloud.google.com/auth/clients), crie um cliente OAuth do tipo **Aplicativo da Web**, com nome **Dauntless Launcher Ultimate**. Configure os escopos básicos `openid`, `email` e `profile`. Em modo de testes, adicione os e-mails dos jogadores autorizados na audiência.
2. Cadastre como URI de redirecionamento autorizado do Google:

```
https://hbbtbbqsauivnierqxvh.supabase.co/auth/v1/callback
```

3. No [provedor Google do Supabase](https://supabase.com/dashboard/project/hbbtbbqsauivnierqxvh/auth/providers), habilite Google e preencha Client ID e Client Secret. O segredo permanece no Supabase; não deve ser inserido no launcher nem publicado no GitHub.
4. Na [configuração de URLs do Supabase](https://supabase.com/dashboard/project/hbbtbbqsauivnierqxvh/auth/url-configuration), adicione este retorno à lista permitida:

```
http://127.0.0.1:43967/**
```

O listener abre somente no loopback, valida um caminho aleatório de uso único e troca o código com o verificador PKCE. O launcher não recebe nem armazena a senha do Google. A sessão Supabase é protegida com safeStorage quando disponível; sem proteção do sistema, a sessão fica apenas em memória.

### Ativar cada servidor

1. Atualize o launcher e mantenha todos fora do jogo. Inicie os serviços e selecione a chave administradora original deste servidor em Configurações, se necessário. Essa autorização do dono é separada do acesso Google dos jogadores.
2. Em **Conectar servidor → Servidor com personagens Google**, selecione seu IP Tailscale. O primeiro host seleciona a autorização Supabase privada já fornecida. Hosts adicionais colam uma autorização de host gerada por **Autorizar outro servidor** em um host já integrado. Clique em **Ativar servidor Google**.
3. A configuração faz backup dos arquivos, conserva o banco nativo e reverte configurações se a compilação falhar. Hosts da integração anterior deixam de encaminhar o Metagame ao PC central. Para migrar jogadores da rede anterior, primeiro ative Google no servidor que contém o progresso mais recente.
4. Clique em **Continuar com Google**. Se a chave antiga e o servidor de origem já estão disponíveis, o vínculo é automático. Caso contrário, use **Vincular meu personagem atual ao Google** no servidor de origem. O vínculo valida a chave original no servidor e copia o mesmo UID, personagem e progresso; não deduz propriedade pelo nome ou e-mail.
5. **Antes de formatar ou apagar chaves antigas, confirme esse primeiro vínculo e o último save enviado.** A integração não consegue recuperar uma conta antiga que nunca foi vinculada se todas as provas de acesso já tiverem sido perdidas.
6. O dono usa **Gerar código de conexão** para emitir o convite de jogador. Cole o código no outro launcher, entre com Google e conecte. O nome de jogador é necessário apenas para uma conta nova.

### Recuperação e troca de host

No modo Google, cada host executa seu próprio Metagame. O Supabase mantém o progresso canônico por usuário Google: o mesmo UID, personagens, nível/XP, inventário, equipamentos, bounties e escalation. A perda dos arquivos do launcher no PC do jogador é resolvida entrando com o mesmo Google e escolhendo um host integrado. **Não é necessário manter o PC central da integração anterior ligado.** O host escolhido precisa estar ligado, com Tailscale e acesso ao Supabase.

Feche a partida antes de trocar. O launcher solicita ao host anterior a confirmação do save e libera a sessão antes de conectar ao destino. Se o host anterior estiver offline, aguarde expirar a sessão exclusiva (75 segundos); o destino recupera o último progresso confirmado na nuvem. O cliente não envia um save editável e não é tratado como autoridade do progresso.

O servidor assina os snapshots com Ed25519. A API valida a identidade Google no Supabase Auth e verifica a autorização do host. Uma revisão antiga, outro jogador ou outro host durante a sessão não pode substituir o save. Saves confirmados pelo servidor passam pela persistência na nuvem antes da resposta; resposta perdida mantém uma outbox local idempotente. Em falhas, o progresso local é preservado e novas operações são bloqueadas até confirmar a sincronização. Não há garantia de recuperar um save que nunca foi confirmado na nuvem se o disco do host também for perdido.

Cada personagem tem snapshot JSON de até 16 MiB em tabelas privadas. Tokens, chaves nativas e saves não são expostos ao renderer nem a tabelas públicas. A chave nativa existe somente como detalhe interno de compatibilidade e é recuperada pela conta Google; não é uma tarefa do jogador guardar esse arquivo.

**Guildas, amizades e placares coletivos permanecem por servidor neste novo modo**, conforme o comportamento nativo. Os bancos antigos e suas relações são conservados; os dados sociais não são copiados pelo snapshot pessoal.

Os testes locais validam PKCE, proteção dos tokens, identidade Google, perda dos dados locais, troca de host e recuperação após resposta perdida. O RPC real do Supabase foi validado em uma transação isolada e revertida, preservando personagem, nível, XP e inventário. O CI também executa dois Metagames reais com um broker Google isolado. **Login com uma conta Google real e partida entre dois PCs Windows/Tailscale ainda precisam ser validados após configurar o provedor.**

Fontes oficiais: [Google no Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls).

Os arquivos `supabase/google-players.sql` e `supabase/functions/fenys-global/players.ts` documentam o backend. `supabase/dashboard-api.ts` é o bundle único implantado, incluindo o endpoint antigo de backups para compatibilidade.

## Correções e execução Linux (1.6.0-beta.2)

- Login reservado desde a consulta inicial: dois cliques não abrem duas tentativas. O botão **Cancelar login** encerra a tentativa, inclusive antes de abrir o navegador.
- Cancelamento, timeout e saída descartam respostas atrasadas, inclusive durante a validação do usuário. Falhas ao abrir o navegador liberam a próxima tentativa.
- A interface limpa o personagem ao sair, mesmo se a revogação remota falhar. Respostas antigas não restauram o perfil.
- Uma conta Google já admitida pode voltar ao mesmo host sem pedir outro convite; contas desconhecidas continuam exigindo convite.
- Falha ao sincronizar um personagem não pula os outros saves. O servidor conserva o progresso pendente e continua informando a falha.
- As notificações de entrada/saída usam também a credencial administradora recuperada pelo Google.

### Jogar no Linux com Wine

1. Instale e configure Wine de 64 bits e as dependências gráficas necessárias ao cliente 1.4.4. Abra `winecfg` no ambiente que pretende usar.
2. Em **Configurações**, selecione o executável do jogo. Escolha também o Wine e a pasta do ambiente (a pasta contém `drive_c` e `system.reg`). Sem seleção, são usados `wine` do sistema e `WINEPREFIX` ou `~/.wine`.
3. Conecte a um servidor remoto pelo Tailscale. Entre com Google quando o provedor estiver habilitado, ou use o acesso existente compatível.
4. Clique em **Jogar Agora**. O launcher valida os arquivos, resolve a pasta AppData dentro do Wine, configura o chat e passa os argumentos diretamente ao Wine. A DLL `dxgi` da versão 1.4.4 é carregada com a preferência nativa.

Essa integração não instala Wine, não configura Proton e não transforma o DeployServer em host Linux. O jogo e o servidor nativo precisam de validação prática; os testes automatizados do runtime verificam argumentos, prefixo, caminhos e tratamento de erros.

### Evidências desta revisão

`npm test` passou com 70 testes. Também passaram localmente `integration-connection.cjs`, `integration-host.cjs`, `integration-cloud.cjs` e `integration-google.cjs`, usando a revisão fixada do Metagame. O último usa identidade Google e broker isolados: ele não substitui login OAuth real ou uma caçada pela internet.

A API pública de personagens respondeu corretamente e recusou consulta de perfil sem autenticação (HTTP 401). As seis tabelas do schema privado `fenys_global` têm RLS; o RPC de personagens permite execução apenas pelo backend `service_role`, sem acesso direto por `anon` ou `authenticated`. O provedor Google foi consultado e continua desativado em 12/10/2026.

## Correção 1.4.1

O launcher volta a abrir diretamente, sem login ou senha local. Iniciar, desligar e reiniciar os serviços não dependem de autenticação nem de o Metagame já estar ligado. Para criar convites, a API continua validando a chave administradora original.

As chaves dos perfis da versão anterior são recuperadas automaticamente como arquivos criptografados; os perfis e arquivos originais são preservados. Esse comportamento de acesso direto é mantido na versão 1.5.0. A rede global descrita abaixo é ativada separadamente pelo dono.

## Tailscale no launcher (1.4.2)

Abra **Conectar servidor → Conexão Tailscale**. O painel detecta a instalação e mostra conexão, IP e modo em segundo plano, com atualização automática enquanto a aba estiver aberta.

- **Instalar Tailscale:** no Windows, baixa o instalador oficial 1.104.1, verifica checksum e assinatura Authenticode do publicador e abre a instalação. Conclua o assistente e a permissão do Windows. No Linux, abre as instruções oficiais de instalação.
- **Conectar Tailscale:** usa a CLI instalada e abre o login oficial no navegador, quando necessário. Não pede senha do launcher, guarda senhas ou usa chaves de autenticação embutidas. Não redefine outras configurações da VPN.
- **Manter ligado em segundo plano:** no Windows, solicita a permissão do sistema para ativar `tailscale set --unattended=true` e confirma a preferência antes de informar sucesso. No Linux, a execução do cliente é feita pelo serviço `tailscaled`.
- **Compartilhar meu PC com um amigo:** abre o painel oficial de máquinas. O dono usa **Share**, compartilha apenas seu PC e o amigo aceita o convite na conta Tailscale dele. O código `FENYS1` não substitui esse compartilhamento.

A instalação e entrada na conta precisam da interação do usuário. O launcher não desliga a VPN ao fechar; somente encerra a CLI de autenticação se ainda estiver aguardando login. Para hospedar, o PC deve continuar ligado, sem suspensão, com o launcher e os serviços abertos.

Referências: [CLI Tailscale](https://tailscale.com/docs/reference/tailscale-cli), [modo em segundo plano](https://tailscale.com/docs/how-to/run-unattended), [instalador oficial](https://pkgs.tailscale.com/stable/).

## Validação e limitações

- Windows: launcher e botão JOGAR foram testados localmente na versão 1.0.0.
- Convites, cadastro e Tailscale: integração em desenvolvimento; teste ponta a ponta com jogadores externos ainda é necessário.
- Linux: AppImage/DEB e execução do cliente via Wine implementados. Partida real via Wine, Proton e hospedagem de processos de jogo no Linux ainda pendentes.
- Atualização automática do jogo e mods: ainda não implementada.

## Executar o código

Node.js 22 ou superior:

```bash
npm ci
npm start
```

Gerar instaladores:

```bash
npm run build:win
npm run build:linux
```

## Configurar o servidor (dono)

1. Instale e configure o [Tailscale](https://tailscale.com/) no computador que hospeda os serviços. Compartilhe **somente esse computador** com os amigos, cada um usando a própria conta Tailscale.
2. Abra **Conectar servidor**, escolha o IP Tailscale deste PC e clique em **Configurar acesso Tailscale**. O launcher mantém o Metagame e DeployServer no loopback, adiciona um listener autenticado do Metagame e relay do chat somente na VPN, configura `MY_IP` e `QOS_TARGET_URL`, e ativa convites. Faz backup das configurações e reverte se a compilação falhar.
3. Clique em **Usar meu servidor local** e **Iniciar serviços**. Nenhum login ou senha do launcher é necessário. Consulte a [documentação de hospedagem do Dauntless Revived](https://github.com/mixutin/dauntless-revived/blob/dauntless-revived/docs/setup/admin.md) para permitir as portas do jogo no firewall da interface Tailscale.
4. Tenha **uma conta administradora** no próprio Metagame. A API não promove contas automaticamente; a permissão `isAdmin` deve ser configurada pelo administrador no banco, conforme a documentação acima.
5. Selecione sua chave administradora em **Configurações**, se ela não foi recuperada automaticamente. A chave é validada no Metagame local ao gerar um convite.
6. Em **Conectar servidor**, clique em **Gerar código de conexão** e envie o código `FENYS1.…` ao usuário. Ele contém o endereço Tailscale e um convite de cadastro de uso único, nunca a chave administradora. Mantenha o launcher aberto. A entrada e saída dos jogadores aparece em **Atividades**, conforme os heartbeats reais do jogo (até 90 segundos para expirar uma sessão).

**Não exponha a porta TCP 61001**, pois o DeployServer não possui autenticação. Evite expor a 61000 à internet pública; o protocolo privado usa HTTP e chaves de conta, portanto limite o acesso à rede Tailscale. Abra apenas as portas necessárias ao jogo na interface Tailscale, conforme as instruções do projeto original.

## Configurar o computador de um amigo

1. Instale Tailscale e aceite o compartilhamento da máquina do dono. Confirme que ele consegue acessar o IP Tailscale do servidor.
2. Tenha uma cópia do **Dauntless 1.4.4 compatível** já instalada por meios autorizados.
3. No launcher, em **Conectar servidor**, cole o código recebido do dono, informe seu nome de jogador e clique em **Conectar ao servidor**. O endereço é configurado automaticamente; não é preciso criar senha.
4. Em **Configurações**, selecione o executável `Dauntless.exe` da pasta do jogo.
5. O launcher salva a chave exclusiva criptografada usando a proteção do sistema operacional (Windows DPAPI via Electron safeStorage); não a compartilhe. Se a proteção do sistema não estiver disponível, o cadastro será bloqueado. Clique em **JOGAR**.

Uma pessoa pode vincular uma chave existente em **Configurações** em vez de abrir outra conta. Para partidas remotas, o host deve manter Metagame, DeployServer e servidores de jogo disponíveis.

Na próxima vez, basta abrir o launcher e clicar em **Jogar Agora**. A conta e o endereço continuam salvos. Se já tem uma conta no destino, vincule essa chave antes de usar o código para preservar o personagem existente. No modo clássico FENYS1, personagens permanecem no servidor em que foram criados. Para compartilhar o mesmo progresso entre hosts, ative a rede global abaixo e use FENYSC2.

## Personagem global + Supabase (1.5.0-beta.1)

O launcher abre sem login e senha. Iniciar/desligar os serviços locais continua disponível mesmo quando o jogador está conectado ao servidor de outra pessoa. A chave nativa do Metagame identifica o jogador e fica protegida no PC; a chave administradora original continua necessária apenas para configurar a rede e emitir autorizações.

Esta implementação mantém **um Metagame/SQLite autoritativo no PC central**. Outros hosts de jogo encaminham as APIs de personagem, XP, níveis, inventário, loadouts, guildas, amigos e placares a ele. Não há um personagem separado em cada host integrado. **O PC central precisa ficar ligado e acessível pelo Tailscale durante as partidas.** O Supabase armazena cópias criptografadas completas desse SQLite e metadados de revisão; não executa o Metagame nem substitui seu banco por PostgreSQL em tempo real.

### Ativar no PC central

1. Atualize o launcher, inicie os serviços e mantenha todos os jogadores fora do jogo. Vincule sua chave administradora existente em Configurações.
2. Em **Conectar servidor → Meu personagem em vários servidores**, escolha **Meu PC central + Supabase** e o IP Tailscale deste PC.
3. Clique em **Selecionar autorização Supabase** e selecione o arquivo privado preparado para este projeto. Não o envie a outros jogadores. Clique em **Ativar rede global**.
4. Aguarde a primeira cópia confirmada. **Conferir cópia na nuvem** mostra erros reais; **Enviar dados agora** força uma cópia. O progresso existente é mantido, sem redefinir a conta admin.
5. Use **Gerar autorização para outro servidor** para integrar o host do usuário. Essa autorização de host e os códigos de jogador são diferentes.

### Integrar outro host e jogar

1. No launcher do outro host, inicie os serviços, mantenha todos fora do jogo e escolha **Meu servidor conectado ao PC central**. Cole a autorização de host e selecione seu próprio IP Tailscale.
2. **Ativar rede global** faz pré-validação e importa os dados antigos desse host preservando UID, personagem e chaves. Nomes/identidades incompatíveis são recusados. O banco original fica preservado e as contas importadas não ganham administração global.
3. Cada host usa **Gerar código de conexão** para emitir um convite FENYSC2 de jogador. Envie o código ao amigo. Antes da primeira conexão, quem já possui personagem vincula sua chave existente. Um jogador novo informa apenas o nome e recebe uma chave própria, sem senha.
4. Feche o jogo antes de mudar de host, aguarde a confirmação de saída e cole o novo código. A mesma chave abre o personagem atual; dados de jogo e sociais permanecem no banco central. A troca só é confirmada após persistência no Supabase. Hosts de redes diferentes ou servidores clássicos não compartilham automaticamente esses dados.

### Persistência e recuperação

- Cópias AES-256-GCM com identidade Ed25519, controle de revisão e escritor exclusivo de 75 segundos. A API recusa assinaturas inválidas, cópias antigas e outro escritor. As tabelas não são públicas; nenhuma chave service_role é enviada ao launcher.
- São conservadas as duas últimas gerações criptografadas, cada uma com limite de **16 MiB**. Alterações geram cópias periódicas (a partir de 30 segundos); a troca de host força confirmação. O limite é verificado antes do envio. Erros não são apresentados como sucesso e o banco local é conservado.
- Perder conexão impede novas operações de jogo após expirar a autorização de escrita; hosts não criam um banco alternativo. Saves locais ainda não enviados permanecem no PC central. Isto é persistência por cópias, sem garantia de upload instantâneo de cada save.
- Guarde a pasta `UndauntedMetagame/fenys/`, principalmente `supabase-authorization.json`, e a identidade do banco em local privado. O arquivo de ativação inicial sozinho não substitui a identidade já vinculada. A perda das chaves impede recuperar as cópias criptografadas.
- Para recuperar uma cópia confirmada, feche jogo, Metagame e DeployServer. No diretório `UndauntedMetagame`, com a configuração/identidade originais, execute:

```bash
node --env-file=.env fenys/fenys-supabase-restore.js --restore
```

A ferramenta verifica assinatura de acesso, digest, criptografia, integridade SQLite e identidade da rede. Conserva uma cópia `.before-supabase-….bak` do banco atual antes de restaurar. Faça isso apenas quando desejar recuperar a versão da nuvem: alterações locais ainda não enviadas ficam na cópia preservada. Inicie os serviços novamente ao concluir.

O projeto Supabase selecionado foi reativado e recebe apenas os objetos `fenys_global` e a Edge Function `fenys-global`; tabelas anteriores do projeto não são utilizadas pelo jogo. `supabase/schema.sql` documenta a instalação inicial. A função usa autenticação própria por assinatura (JWT Supabase desativado intencionalmente) e chama o RPC privado com credencial exclusiva do ambiente da Edge Function.

Testes automatizados cobrem dois hosts com o mesmo UID/personagem, progressão e relações sociais; o teste opt-in `test/integration-supabase.cjs` verifica cópia criptografada real e rejeição de requisições inválidas usando uma autorização de teste isolada. **A partida entre dois PCs Windows pelo Tailscale ainda precisa ser testada.**

## API já usada

| Função | Rota do Metagame | Autorização |
| --- | --- | --- |
| Conferir conta | `GET /undaunted/api/GetUserInfo` | Chave da conta |
| Conferir modo de cadastro | `GET /undaunted/api/RegistrationStatus` | Nenhuma |
| Gerar convite | `POST /undaunted/api/CreateInvite` | Conta administradora |
| Registrar amigo | `POST /undaunted/api/Register` | Código de convite |

O launcher restringe os endpoints HTTP configuráveis a localhost e endereços Tailscale (`100.64.0.0/10` e `*.ts.net`). Não devolve chaves de jogador à interface. As novas chaves cadastradas são criptografadas localmente via Electron safeStorage. Chaves importadas do friend-kit ou de backups podem estar em texto puro; proteja esses arquivos, não os publique nem os compartilhe.

## Segurança e atribuição

Não envie `.env`, tokens, chaves `UUK_`, banco SQLite ou arquivos do jogo ao GitHub. Conexões remotas ainda precisam de teste real de acesso e da configuração correta de firewall/Tailscale.

Código do Dauntless Launcher Ultimate e integrações derivadas de [Dauntless Revived](https://github.com/mixutin/dauntless-revived), baseado em [Undaunted](https://github.com/SyST3MDeV/Undaunted), conforme avisos do projeto original. Licença **AGPL-3.0-only**. Consulte o arquivo de licença e `NOTICE.md`. Projeto não afiliado à Phoenix Labs ou Epic Games.

