# Dauntless Fenys

Launcher comunitário para **Dauntless Revived 1.4.4**, com controle local de serviços, conexão privada por Tailscale, cadastro individual de jogadores e convites de uso único do Metagame.

**Não inclui o cliente proprietário do Dauntless**, nem fornece downloads do jogo. O suporte à execução do jogo é **Windows**; os pacotes Linux abrem o launcher, mas a integração de Wine/Proton ainda está pendente.

## Status

- Windows: launcher e botão JOGAR foram testados localmente na versão 1.0.0.
- Convites, cadastro e Tailscale: integração em desenvolvimento; teste ponta a ponta com jogadores externos ainda é necessário.
- Linux: instaladores AppImage/DEB compilam. O jogo não é iniciado no Linux por esta versão.
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
2. Consulte a [documentação de hospedagem do Dauntless Revived](https://github.com/mixutin/dauntless-revived/blob/dauntless-revived/docs/setup/admin.md) para configurar `BIND_HOST` do Metagame e `MY_IP` do DeployServer com o **IP 100.x.y.z do Tailscale**, além de `QOS_TARGET_URL` e do firewall. `DEPLOYSERVER_URL` e `BIND_HOST` do DeployServer devem continuar locais.
3. No `.env` de `UndauntedMetagame`, use `AUTH_MODE=APIKEY`, `NODE_ENV=production` e `REGISTRATION_MODE=INVITECODE`. Reinicie o Metagame depois das mudanças.
4. Tenha **uma conta administradora** no próprio Metagame. A API não promove contas automaticamente; a permissão `isAdmin` deve ser configurada pelo administrador no banco, conforme a documentação acima.
5. Abra o Fenys, em **Configurações**, informe `100.x.y.z:61000`. Se já possui conta, clique em **Vincular conta existente** e selecione seu `account.key`; o aplicativo confere a chave com o servidor.
6. Selecione também o arquivo da **chave administradora**. Em **Convites**, clique em **Gerar convite** para receber um código válido para um cadastro.

**Não exponha a porta TCP 61001**, pois o DeployServer não possui autenticação. Evite expor a 61000 à internet pública; o protocolo privado usa HTTP e chaves de conta, portanto limite o acesso à rede Tailscale. Abra apenas as portas necessárias ao jogo na interface Tailscale, conforme as instruções do projeto original.

## Configurar o computador de um amigo

1. Instale Tailscale e aceite o compartilhamento da máquina do dono. Confirme que ele consegue acessar o IP Tailscale do servidor.
2. Tenha uma cópia do **Dauntless 1.4.4 compatível** já instalada por meios autorizados.
3. No Fenys, em **Configurações**, informe o IP Tailscale do dono e selecione o executável `Dauntless.exe` da pasta do jogo.
4. Abra **Convites**, informe um nome de jogador (3–16 caracteres, letras, números ou `_`) e o código recebido. Clique em **Criar minha conta**.
5. O Fenys salva uma chave exclusiva em seu diretório de dados do aplicativo; não a compartilhe. Clique em **JOGAR**.

Uma pessoa pode vincular uma chave existente em **Configurações** em vez de abrir outra conta. Para partidas remotas, o host deve manter Metagame, DeployServer e servidores de jogo disponíveis.

## API já usada

| Função | Rota do Metagame | Autorização |
| --- | --- | --- |
| Conferir conta | `GET /undaunted/api/GetUserInfo` | Chave da conta |
| Conferir modo de cadastro | `GET /undaunted/api/RegistrationStatus` | Nenhuma |
| Gerar convite | `POST /undaunted/api/CreateInvite` | Conta administradora |
| Registrar amigo | `POST /undaunted/api/Register` | Código de convite |

O Fenys restringe os endpoints HTTP configuráveis a localhost e endereços Tailscale (`100.64.0.0/10` e `*.ts.net`). Não devolve chaves de jogador à interface. No protótipo atual, as chaves cadastradas ficam em arquivos locais do perfil do sistema: proteja seus backups e não publique os arquivos.

## Segurança e atribuição

Não envie `.env`, tokens, chaves `UUK_`, banco SQLite ou arquivos do jogo ao GitHub. Conexões remotas ainda precisam de teste real de acesso e da configuração correta de firewall/Tailscale.

Código do launcher Fenys e integrações derivadas de [Dauntless Revived](https://github.com/mixutin/dauntless-revived), baseado em [Undaunted](https://github.com/SyST3MDeV/Undaunted), conforme avisos do projeto original. Licença **AGPL-3.0-only**. Consulte o arquivo de licença e `NOTICE.md`. Projeto não afiliado à Phoenix Labs ou Epic Games.
