# Dauntless Fenys — 1.2.0 beta

Launcher independente para Dauntless Revived 1.4.4 (Windows), com login local, contas separadas por jogador, convites do Metagame e gerenciamento no computador hospedeiro. **Não distribui o jogo original.** Projeto não afiliado à Phoenix Labs ou Epic Games.

## Contas e senhas do Fenys

O launcher tem dois perfis: **Administrador** e **Jogador**.

- **Administrador**: para obter essa função, selecione **Importar conta** na tela de login e forneça a chave de uma conta que já tenha `IsAdmin=true` no Metagame. Só essa função libera as telas administrativas e os comandos internos `server:start`, `server:stop`, `server:restart`. Apenas a máquina hospedeira pode iniciar/parar serviços locais.
- **Jogador**: selecione **Criar conta**, informe endereço Tailscale do servidor, um nome de 3–16 caracteres, senha de pelo menos 10 caracteres e o código de convite de uso único. A conta gerada pertence a esse personagem.
- **Vários usuários em um PC**: cada um tem login e senha próprios. Use **Sair / Trocar perfil** antes de iniciar o jogo. Cada perfil usa a própria chave de jogo. No beta, **não há isolamento para executar duas instâncias simultâneas** com perfis distintos; feche o jogo antes de trocar de usuário.
- **Esqueci a senha**: forneça o código de recuperação único mostrado no momento do cadastro, junto com uma senha nova. Um novo código substitui o anterior após recuperação ou troca de senha. **Não existe recuperação automática por e-mail** neste beta. Sem código, não há restauração automática do login local.
- **Importar conta existente**: o jogador ou administrador que já possui uma chave `account.key` pode usá-la para criar login e senha Fenys, desde que o Metagame reconheça a chave. Não compartilhe sua chave secreta com ninguém.
- **Mesmo perfil em outro computador**: os logins/senhas Fenys desta versão são **locais ao Windows**; não são sincronizados com o servidor. Para outro PC, importe uma cópia segura de sua chave de jogo e configure um novo login local. A senha local **não substitui** a chave UUK do Dauntless Revived.

Senhas são guardadas como hashes de `scrypt` com sal. As chaves de jogo dos novos perfis são protegidas por `Electron safeStorage` (Windows DPAPI). Arquivos de perfis e cópias de banco não devem ir para o GitHub ou compartilhamentos públicos. Para isolamento de segurança forte entre moradores, também use contas diferentes do Windows.

## Convites e permanência no servidor

O administrador cria convites aleatórios diretamente pelo endpoint `POST /undaunted/api/CreateInvite`, com **1 utilização** por código, e configura `REGISTRATION_MODE=INVITECODE` no Metagame. O amigo usa o código somente no primeiro cadastro. Nas próximas entradas basta autenticar no Fenys, iniciar o cliente e conectar-se ao servidor ligado e alcançável pelo Tailscale.

O Metagame continua sendo a fonte de verdade das contas, da autenticação de jogo e do progresso; não há um segundo banco remoto duplicado de personagens no Fenys.

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
2. Configure o Metagame com `AUTH_MODE=APIKEY`, `NODE_ENV=production`, `REGISTRATION_MODE=INVITECODE` e endereço de escuta na interface Tailscale; configure `MY_IP` do DeployServer e `QOS_TARGET_URL` de acordo com o host.
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

Fenys é comunitário e independente. Consulte `LICENSE.txt` e `NOTICE.md`. As integrações seguem a documentação do projeto [Dauntless Revived](https://github.com/mixutin/dauntless-revived) e os termos aplicáveis de AGPL-3.0-only. Não publique `.env`, banco de dados, chaves `UUK_`, hashes de senha nem backups.
