# Instalação do zero

## 1. Escolha o que você vai executar

**Jogador remoto:** precisa do launcher, cliente Dauntless 1.4.4 com as DLLs compatíveis, convite e acesso pela rede escolhida (Tailscale, LAN ou HTTPS público). Não precisa compilar Metagame nem criar um Supabase.

**Dono do servidor:** prepara Metagame, DeployServer, jogo e configurações no computador que vai hospedar. Este tutorial usa Windows para os processos de partida. É possível desenvolver/testar as APIs em Linux; isso não significa que a hospedagem nativa das partidas no Linux esteja implementada no nosso launcher.

**Réplica independente:** além do host, siga [NUVEM.md](NUVEM.md) para ter seu próprio banco e OAuth. Se estiver adicionando um host à nossa rede, use uma autorização do dono existente; não crie outro banco.

## 2. Pré-requisitos e cópia do projeto

Instale Git, Node.js 24 com npm e, no Windows do jogo, o runtime Microsoft Visual C++ x64 necessário à DLL. A compilação das dependências nativas pode exigir ferramentas C++ se não houver binário pronto para seu ambiente. Use um diretório de trabalho fora do OneDrive e execute os comandos em um terminal comum.

```bash
git clone https://github.com/Fenysx/Dauntless-Fenys.git
cd Dauntless-Fenys
npm ci
npm test
npm run server:prepare
```

O repositório pode exigir autenticação GitHub enquanto for privado. Não é necessário `--recursive`: o servidor é uma cópia versionada, não um submódulo.

Ao terminar, devem existir:

- `runtime/server/UndauntedMetagame/dist/server.js`;
- `runtime/server/UndauntedDeployServer/dist/server.js`;
- dependências próprias em cada serviço.

Você também pode escolher outra **pasta nova**:

```bash
npm run server:prepare -- C:/DauntlessRuntime
```

Se `npm ci` falhar, a cópia parcial é preservada. Corrija a dependência, entre no diretório do serviço e execute `npm ci` e `npm run build`; não apague uma instalação que já tenha dados para tentar de novo.

## 3. Cliente 1.4.4 e DLLs

O jogo não é baixado por esses comandos. Use uma cópia legítima compatível. A versão esperada é `dauntless_rel-1.4.4_Shipping_2020-10-28_20-11-15_239827`; 2.1.1 não é compatível com essa base.

As duas DLLs de integração preservadas em `server/upstream/UndauntedLauncher/assets` correspondem aos hashes do nosso launcher. Devem ficar ao lado de `Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe` na instalação do jogo.

| Arquivo | SHA-256 aceito |
|---|---|
| Dauntless-Win64-Shipping.exe | `d3d41e614908d2befd518b27046d9822d6130ef12ba3504babbdb786bef9cff4` |
| dxgi.dll | `9a431d7b6fd20c43fa92bebd91c3bc023ec7a3fcbc52871c41f4df293d4b0d1f` |
| UndauntedInternalServer.dll | `a090e8b25044647ce409b313525501da578d632d3fcb9eb351f020ca94fa64fb` |

No PowerShell, confira com `Get-FileHash -Algorithm SHA256 'CAMINHO_DO_ARQUIVO'`. Faça backup das DLLs existentes antes de substituí-las. Algumas páginas históricas da base citam uma DLL mais antiga; os valores acima refletem `src/main.js` e os binários da revisão fixada.

## 4. Configuração inicial do Metagame

Os caminhos abaixo são exemplos. Substitua `C:/Dauntless-Fenys` pela pasta onde clonou o projeto. Os serviços leem `.env` do **próprio diretório**, não da raiz do launcher.

1. Crie `runtime/data` para os dados privados.
2. Copie `runtime/server/UndauntedMetagame/.env.example` para `.env` no mesmo diretório.
3. Edite estes valores, mantendo o serviço em loopback durante a preparação:

```dotenv
PORT=61000
BIND_HOST=127.0.0.1
AUTH_MODE=APIKEY
REGISTRATION_MODE=OPEN
DB_FILENAME=C:/Dauntless-Fenys/runtime/data/undaunted.db
MATCHMAKING_MODE=DEPLOYSERVER
DEPLOYSERVER_URL=127.0.0.1:61001
QOS_TARGET_URL=http://127.0.0.1:61000/QoS
TARGET_CHANGELIST=239827
NODE_ENV=production
```

4. Gere um par RSA próprio. Na pasta do Metagame, o comando abaixo substitui apenas as duas linhas vazias do exemplo, sem imprimir chaves. Execute uma única vez, antes da primeira inicialização:

```powershell
node -e "const f=require('fs'),c=require('crypto'),p='.env',s=f.readFileSync(p,'utf8');if(!/^AUTH_SIGNING_PRIVKEY_B64=\r?$/m.test(s)||!/^AUTH_SIGNING_PUBKEY_B64=\r?$/m.test(s))throw Error('Chaves existentes ou linhas ausentes: preserve o arquivo');const k=c.generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});f.writeFileSync(p,s.replace(/^AUTH_SIGNING_PRIVKEY_B64=\r?$/m,'AUTH_SIGNING_PRIVKEY_B64='+Buffer.from(k.privateKey).toString('base64')).replace(/^AUTH_SIGNING_PUBKEY_B64=\r?$/m,'AUTH_SIGNING_PUBKEY_B64='+Buffer.from(k.publicKey).toString('base64')));"
```

5. Execute `npm start` nessa pasta. O Metagame cria/migra seu banco. Mantenha esse terminal aberto durante o cadastro inicial.

**Não use um banco de jogadores reais para desenvolvimento.** A primeira inicialização pode aplicar migrações; faça backup antes de atualizar uma instalação existente.

## 5. Conta administradora e chave dos processos de partida

A base fornece os procedimentos exatos nas seções [9 — Metagame](../server/upstream/docs/setup/host.md#metagame) e [10 — conta administradora](../server/upstream/docs/setup/host.md#admin-account). Adapte os caminhos `C:/dr/data` para `runtime/data` e `C:/dr/undaunted` para `runtime/server`.

A sequência obrigatória é:

1. Com o Metagame local ligado, cadastre o dono por `POST http://127.0.0.1:61000/undaunted/api/Register`, JSON `{ "Username": "SeuNome" }`. O retorno `UUK` é privado: salve em `runtime/data/owner.key` sem publicá-lo.
2. Consulte `/undaunted/api/GetUserInfo` com o cabeçalho `x-undaunted-user-api-key` contendo essa chave. Guarde o `UserId` retornado.
3. No banco **local do seu host**, promova esse usuário com `UPDATE users SET isAdmin = 1 WHERE userId = ?`, usando parâmetro SQL. O exemplo Node da seção 10 faz cadastro, salvamento da chave e promoção.
4. Gere outra chave aleatória de 24 bytes em hexadecimal para os processos de partida; salve em `runtime/data/gameserver.key`. Insira-a na tabela `gameserverapikeystoregister(key)` como no exemplo da seção 9. Reinicie o Metagame: ele registra o hash e consome a fila.
5. Após criar o dono, altere `REGISTRATION_MODE=INVITECODE` no `.env` e reinicie. O modo `OPEN` é apenas para a preparação em loopback.

Essas tarefas são administração inicial do host. Os jogadores do modo Google não precisam executar SQL nem guardar uma chave manualmente.

## 6. DeployServer e configuração do jogo no host

Copie `runtime/server/UndauntedDeployServer/.env.example` para `.env`. Configure:

```dotenv
PORT=61001
BIND_HOST=127.0.0.1
MY_IP=127.0.0.1
PORT_RANGE_BEGIN=8770
PORT_RANGE_END=8777
GAMESERVER_BINARY_PATH=C:/D144/Dauntless/Archon/Binaries/Win64/Dauntless-Win64-Shipping.exe
METAGAME_API_KEY=COLOQUE_A_CHAVE_DE_GAMESERVER_GERADA_NO_PASSO_5
SECONDS_TO_WAIT_BETWEEN_GAMESERVER_STARTUP=10
NODE_ENV=production
```

Mantenha as demais opções do exemplo da revisão fixada. Não coloque a chave do dono em `METAGAME_API_KEY`: são credenciais diferentes. O DeployServer deve permanecer em loopback.

No host Windows, configure os endpoints de backend do processo de partida em `%LOCALAPPDATA%/Archon/Saved/Config/WindowsClient/Game.ini`. Siga a seção [8 — gerar Game.ini](../server/upstream/docs/setup/host.md#game-ini): o script extrai os endpoints de `runtime/server/UndauntedInternalServer/dllmain.cpp` e escreve URLs **entre aspas**, apontando para `127.0.0.1:61000`. Faça backup do arquivo existente antes de executar o gerador. Não publique esse arquivo de execução.

Execute launcher e serviços com o mesmo usuário Windows, para compartilharem essa pasta de configuração. O launcher configura o chat do cliente ao jogar; isso não substitui o `Game.ini` exigido pelos processos de partida do host.

## 7. Abrir nosso launcher e ativar a rede

Na raiz do projeto, execute `npm start`. Em **Configurações**:

1. Selecione a pasta `runtime/server`, que contém `UndauntedMetagame` e `UndauntedDeployServer` — não a pasta interna de um deles.
2. Selecione o executável do jogo.
3. Selecione `runtime/data/owner.key` como chave administradora.
4. Se iniciou os serviços manualmente, encerre-os antes de pedir ao launcher que os gerencie.
5. Use **Usar meu servidor local** e **Iniciar serviços**; confira a aba Atividades.

Escolha a conexão em **Servidor com personagens Google** conforme [REDES.md](REDES.md). Os parágrafos abaixo descrevem a opção privada Tailscale.

Para essa opção, instale e entre no Tailscale no host e nos PCs dos jogadores. Compartilhe o computador do host com cada amigo, ou autorize-os na mesma rede conforme sua administração Tailscale. O código do jogo não concede acesso à VPN.

Em **Conectar servidor**, selecione o IP Tailscale deste computador. Para o modo Google, prepare a nuvem conforme [NUVEM.md](NUVEM.md), escolha **Servidor com personagens Google** e ative com a autorização inicial ou com o código de outro host autorizado. O launcher aplica nossos módulos e recompila a cópia de trabalho. A interface pode exigir encerrar os serviços antes da alteração; siga o estado apresentado.

Permita aos jogadores autorizados acesso às portas de [OPERACAO.md](OPERACAO.md) via Tailscale. Não exponha o DeployServer à internet.

## 8. Conectar jogadores e conferir o progresso

O dono gera um código de conexão. No outro PC: conecte a rede escolhida (Tailscale somente se esse for o modo), abra o launcher, entre com Google, cole o código e jogue. Para um personagem antigo, faça primeiro o vínculo no servidor que possui seu save, usando a prova de acesso original.

Validação prática: crie/recupere o personagem, anote nível e inventário, faça uma atividade, feche o jogo e confirme a sincronização. Entre em outro host autorizado com o mesmo Google e confira UID/progresso. Não formate o PC nem apague chaves antigas antes dessa conferência.

No Linux, siga a seção Wine do [guia do launcher](GUIA-LAUNCHER.md). A execução real do jogo por Wine continua experimental; os testes das APIs não a substituem.
