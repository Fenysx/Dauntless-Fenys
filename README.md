# Dauntless Fenys — 1.3.0 beta

Launcher independente para Dauntless Revived 1.4.4 (Windows), com login local, contas separadas por jogador, convites do Metagame e gerenciamento no computador hospedeiro. **Não distribui o jogo original.** Projeto não afiliado à Phoenix Labs ou Epic Games.

## Contas e senhas do Fenys

O launcher tem dois perfis: **Administrador** e **Jogador**.

- **Administrador**: para obter essa função, selecione **Importar conta** na tela de login e forneça a chave de uma conta que já tenha `IsAdmin=true` no Metagame. Só essa função libera as telas administrativas e os comandos internos `server:start`, `server:stop`, `server:restart`. Apenas a máquina hospedeira pode iniciar/parar serviços locais.
- **Jogador**: selecione **Criar conta**, informe endereço Tailscale do servidor, um nome de 3–16 caracteres, senha de pelo menos 10 caracteres e o código de convite de uso único. A conta gerada pertence a esse personagem.
- **Vários usuários em um PC**: cada um tem login e senha próprios. Use **Sair / Trocar perfil** antes de iniciar o jogo. Cada perfil usa a própria chave de jogo. O launcher permite uma única instância por computador; feche o jogo antes de trocar de usuário.
- **Esqueci a senha**: forneça o código de recuperação único mostrado no momento do cadastro, junto com uma senha nova. Um novo código substitui o anterior após recuperação ou troca de senha. **Não existe recuperação automática por e-mail** neste beta. Sem código, não há restauração automática do login local.
- **Importar conta existente**: o jogador ou administrador que já possui uma chave `account.key` pode usá-la para criar login e senha Fenys, desde que o Metagame reconheça a chave. Não compartilhe sua chave secreta com ninguém.
- **Mesmo perfil em outro computador**: os logins/senhas Fenys desta versão são **locais ao Windows**; não são sincronizados com o servidor. Antes de ativar o personagem portátil, outro PC pode importar uma chave de jogo e configurar um login local. Após ativação, a identidade portátil pertence ao perfil original e não pode ser recriada importando a chave; preserve os dados protegidos desse perfil. A senha local **não substitui** a chave UUK do Dauntless Revived.

Senhas são guardadas como hashes de `scrypt` com sal. As chaves de jogo dos novos perfis são protegidas por `Electron safeStorage` (Windows DPAPI). Arquivos de perfis e cópias de banco não devem ir para o GitHub ou compartilhamentos públicos. Para isolamento de segurança forte entre moradores, também use contas diferentes do Windows.

## Convites e permanência no servidor

O administrador cria convites aleatórios diretamente pelo endpoint `POST /undaunted/api/CreateInvite`, com **1 utilização** por código, e configura `REGISTRATION_MODE=INVITECODE` no Metagame. O amigo usa o código somente no primeiro cadastro. Nas próximas entradas basta autenticar no Fenys, iniciar o cliente e conectar-se ao servidor ligado e alcançável pelo Tailscale.

Durante o jogo, o Metagame conectado guarda o progresso. A API Fenys transfere uma versão consistente para o próximo host por intermédio do passaporte protegido do perfil, bloqueando a cópia anterior. Não há serviço central de nuvem.

## Conexão por código com personagem único

Os dois hosts precisam ativar a API Fenys sobre o Metagame compatível (base validada: `mixutin/dauntless-revived@29477558148a9db66cd1134a5c3df8bea7f9bea5`). A ativação salva cópias dos fontes/configurações, instala os módulos e compila o Metagame com o TypeScript já instalado no host. Se a compilação falhar, restaura os arquivos anteriores. Não reinstala o jogo ou cria contas administradoras.

1. O dono abre **Conectar servidor**, gera um código e o envia ao amigo. O código inclui o endereço VPN e uma autorização aleatória, vale por **15 minutos** e permite **uma entrada**.
2. O amigo entra em seu perfil existente, cola o código e usa **Entrar no servidor**. Sua conta não é cadastrada novamente. O UID, IDs dos personagens, inventário, equipamentos/loadouts, XP/mastery/Hunt Pass, objetivos, bounties, cooldowns, entitlements e escalation são transferidos juntos, em uma transação SQLite.
3. O hospedeiro recebe a mensagem **“Ygor entrou no seu servidor”**. A presença no launcher usa heartbeats; a aba Jogadores online continua mostrando a presença real dentro do jogo. **Entrar no servidor** conecta o launcher; **Jogar Agora** abre o jogo.
4. Para voltar, feche o jogo e use **Voltar ao meu servidor**. O último progresso vai com você. Para outro host, use o novo código. O retorno ao servidor original dispensa convite.

A API recusa personagem em jogo (até 90 segundos para o heartbeat expirar), esquema/modos de progressão incompatíveis, nomes de outro jogador no destino, sessões paralelas, IDs estrangeiros e versões antigas. As chaves de jogo de visitantes são temporárias. O perfil administrador só mantém privilégios no seu servidor original.

O passaporte Ed25519 e as transferências pendentes são protegidos com `safeStorage`, persistidos antes da requisição e recuperáveis com o mesmo ID de operação. Se a rede cair, o launcher bloqueia o jogo/troca enquanto a transferência estiver pendente; use **Recuperar sincronização** com o host novamente online. Um destino indisponível não autoriza jogar uma cópia antiga em outro servidor. Fechar o launcher não apaga a sessão; reabrir o mesmo perfil retoma o vínculo.

**Escopo da portabilidade:** dados individuais de jogo das 21 tabelas listadas em `fenys-roaming-host.js`. Guildas, amizades, Slayer Links, placares coletivos, registros de auditoria e moderação continuam pertencendo a cada comunidade; não são fundidos entre bancos independentes. O host é confiável como autoridade de jogo: esta rede privada não implementa verificação anti-cheat de saves nem federação entre cópias deliberadamente clonadas do passaporte.

**Preservação:** não apague o perfil/diretório de dados do Fenys nem copie um passaporte ativo para rodar em paralelo. É o ponto de recuperação do personagem entre hosts. A interface impede apagar um perfil portátil. Não há recuperação remota se esse passaporte for perdido. O banco de cada host continua mantendo as linhas anteriores e o último snapshot de saída até o próximo retorno.

### API de transferência

A API roda dentro do Metagame, na porta **61000**, antes dos logs de corpos. Não usa a porta de conteúdo 61002. As rotas são `/fenys/v1/status`, `/invite`, `/checkout`, `/join`, `/leave`, `/pulse`, `/events` e `/inspect`. As operações de personagem exigem envelope assinado pelo passaporte; `/invite` exige administrador e conexão direta local. Códigos são armazenados somente como SHA-256; passaportes privados e chaves de jogo não são enviados ao renderer. Metagame/XP/inventário são manipulados pelo mesmo writer SQLite, após drenar requisições existentes. Requests da cópia inativa são bloqueados e o epoch JWT é incrementado; sessões de chat também recebem a revogação.

A configuração preserva o acesso local de game servers e acrescenta apenas o IP Tailscale informado. O chat autenticado é encaminhado do IP VPN para o XMPP local. O Tailscale deve estar conectado ao reiniciar o host; firewall/ACL precisam permitir TCP 61000/61099 e UDP 8770–8777 entre os amigos. Não há administração da conta Tailscale ou alteração automática das ACLs.

## Administração: remover sem banir

A seção **Convites / Jogadores cadastrados** lista as contas reais via `GET /undaunted/api/DashboardAccounts`. No **computador hospedeiro**, o administrador autenticado pode executar **Remover acesso** com uma confirmação digitando o nome do jogador.

Essa operação:
1. Salva um backup SQLite do Metagame no diretório privado de dados do Fenys.
2. Remove apenas a chave de autenticação (`userapikeys`) e qualquer chave pendente (`userapikeystoregister`) daquela conta.
3. Incrementa `authepochs` para invalidar tokens autenticados; preserva as linhas de usuário, personagem e progressão.
4. Não cria `account_bans` e não apaga inventários ou personagens.

**Atenção:** não use essa operação só para encerrar uma sessão. É uma remoção de acesso persistente, indicada para emergências; a conta precisará receber **uma nova chave emitida com segurança** para ser reativada com o mesmo personagem. A reemissão guiada ainda não foi implementada. O encerramento de uma sessão de jogo já conectada pode não ocorrer imediatamente. Não altere o banco diretamente em caso de falha; preserve o backup e os logs.

A rotina exige o projeto `UndauntedMetagame` instalado, seu `.env` local com `DB_FILENAME` e a dependência `better-sqlite3` instalada no host. Essa funcionalidade depende do esquema atual de `dauntless-revived`; teste em um banco de **desenvolvimento** antes de usar dados de jogadores reais.

## Rede Tailscale e servidor

1. No computador hospedeiro, instale o Tailscale, compartilhe **a máquina** com o amigo e limite as portas no firewall.
2. Com o perfil administrador e serviços iniciados pelo launcher, abra **Conectar servidor**, selecione seu IP Tailscale e use **Ativar API e configurar servidor**. A ativação configura `REGISTRATION_MODE=INVITECODE`, `QOS_TARGET_URL`, `MY_IP` e um listener adicional na interface VPN. O listener original continua no loopback; a porta 61001 fica local. `AUTH_MODE=APIKEY` já deve estar configurado.
3. Mantenha `DEPLOYSERVER_URL` e a porta `61001` **somente locais**; nunca os exponha à internet. O protocolo HTTP do Metagame precisa ficar restrito à rede privada protegida pelo Tailscale.
4. A conta administradora deve existir no banco do Metagame e já ter `isAdmin=1`. O launcher **não cria um administrador automaticamente**.
5. Cada amigo instala o launcher, conecta-se ao Tailscale e configura o executável compatível `Dauntless.exe` / `Dauntless-Win64-Shipping.exe`.

Documentação upstream: https://github.com/mixutin/dauntless-revived/blob/dauntless-revived/docs/setup/admin.md

## Compilar e testar

```bash
npm ci
npm test
npm start
```

Para gerar instaladores: `npm run build:win` (Windows) ou `npm run build:linux` (Linux).

**Limitações:** a compilação Linux do launcher não implementa execução de Dauntless por Proton/Wine. Nenhum download de arquivos proprietários do jogo ou atualização automática de mods foi implementado nesta beta. O acesso remoto e a remoção real devem ser testados em máquina/banco de desenvolvimento antes da produção. A compilação bem-sucedida não substitui testes de contas reais.

## Licença e créditos

Fenys é comunitário e independente. Consulte `LICENSE` e `NOTICE.md`. As integrações seguem a documentação do projeto [Dauntless Revived](https://github.com/mixutin/dauntless-revived) e os termos aplicáveis de AGPL-3.0-only. Não publique `.env`, banco de dados, chaves `UUK_`, hashes de senha nem backups.

