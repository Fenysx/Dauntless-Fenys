# Dauntless Fenys

Launcher comunitário para **Dauntless Revived 1.4.4**, com controle local de serviços, conexão privada por Tailscale, cadastro individual de jogadores e convites de uso único do Metagame.

**Não inclui o cliente proprietário do Dauntless**, nem fornece downloads do jogo. O suporte à execução do jogo é **Windows**; os pacotes Linux abrem o launcher, mas a integração de Wine/Proton ainda está pendente.

## Correção 1.4.1

O launcher volta a abrir diretamente, sem login ou senha local. Iniciar, desligar e reiniciar os serviços não dependem de autenticação nem de o Metagame já estar ligado. Para criar convites, a API continua validando a chave administradora original.

As chaves dos perfis da versão anterior são recuperadas automaticamente como arquivos criptografados; os perfis e arquivos originais são preservados. Esta versão não ativa a rede de dados globais nem modifica personagens, banco SQLite ou configuração do Google Drive.

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
2. Abra **Conectar servidor**, escolha o IP Tailscale deste PC e clique em **Configurar acesso Tailscale**. O Fenys mantém o Metagame e DeployServer no loopback, adiciona um listener autenticado do Metagame e relay do chat somente na VPN, configura `MY_IP` e `QOS_TARGET_URL`, e ativa convites. Faz backup das configurações e reverte se a compilação falhar.
3. Clique em **Usar meu servidor local** e **Iniciar serviços**. Nenhum login ou senha do launcher é necessário. Consulte a [documentação de hospedagem do Dauntless Revived](https://github.com/mixutin/dauntless-revived/blob/dauntless-revived/docs/setup/admin.md) para permitir as portas do jogo no firewall da interface Tailscale.
4. Tenha **uma conta administradora** no próprio Metagame. A API não promove contas automaticamente; a permissão `isAdmin` deve ser configurada pelo administrador no banco, conforme a documentação acima.
5. Selecione sua chave administradora em **Configurações**, se ela não foi recuperada automaticamente. A chave é validada no Metagame local ao gerar um convite.
6. Em **Conectar servidor**, clique em **Gerar código de conexão** e envie o código `FENYS1.…` ao Ygor. Ele contém o endereço Tailscale e um convite de cadastro de uso único, nunca a chave administradora. Mantenha o launcher aberto. A entrada e saída dos jogadores aparece em **Atividades**, conforme os heartbeats reais do jogo (até 90 segundos para expirar uma sessão).

**Não exponha a porta TCP 61001**, pois o DeployServer não possui autenticação. Evite expor a 61000 à internet pública; o protocolo privado usa HTTP e chaves de conta, portanto limite o acesso à rede Tailscale. Abra apenas as portas necessárias ao jogo na interface Tailscale, conforme as instruções do projeto original.

## Configurar o computador de um amigo

1. Instale Tailscale e aceite o compartilhamento da máquina do dono. Confirme que ele consegue acessar o IP Tailscale do servidor.
2. Tenha uma cópia do **Dauntless 1.4.4 compatível** já instalada por meios autorizados.
3. No Fenys, em **Conectar servidor**, cole o código recebido do dono, informe seu nome de jogador e clique em **Conectar ao servidor**. O endereço é configurado automaticamente; não é preciso criar senha.
4. Em **Configurações**, selecione o executável `Dauntless.exe` da pasta do jogo.
5. O Fenys salva a chave exclusiva criptografada usando a proteção do sistema operacional (Windows DPAPI via Electron safeStorage); não a compartilhe. Se a proteção do sistema não estiver disponível, o cadastro será bloqueado. Clique em **JOGAR**.

Uma pessoa pode vincular uma chave existente em **Configurações** em vez de abrir outra conta. Para partidas remotas, o host deve manter Metagame, DeployServer e servidores de jogo disponíveis.

Na próxima vez, basta abrir o launcher e clicar em **Jogar Agora**. A conta e o endereço continuam salvos. Se já tem uma conta no destino, vincule essa chave antes de usar o código para preservar o personagem existente. Personagens permanecem no servidor em que foram criados; esta correção não transfere saves entre servidores.

## API já usada

| Função | Rota do Metagame | Autorização |
| --- | --- | --- |
| Conferir conta | `GET /undaunted/api/GetUserInfo` | Chave da conta |
| Conferir modo de cadastro | `GET /undaunted/api/RegistrationStatus` | Nenhuma |
| Gerar convite | `POST /undaunted/api/CreateInvite` | Conta administradora |
| Registrar amigo | `POST /undaunted/api/Register` | Código de convite |

O Fenys restringe os endpoints HTTP configuráveis a localhost e endereços Tailscale (`100.64.0.0/10` e `*.ts.net`). Não devolve chaves de jogador à interface. As novas chaves cadastradas são criptografadas localmente via Electron safeStorage. Chaves importadas do friend-kit ou de backups podem estar em texto puro; proteja esses arquivos, não os publique nem os compartilhe.

## Segurança e atribuição

Não envie `.env`, tokens, chaves `UUK_`, banco SQLite ou arquivos do jogo ao GitHub. Conexões remotas ainda precisam de teste real de acesso e da configuração correta de firewall/Tailscale.

Código do launcher Fenys e integrações derivadas de [Dauntless Revived](https://github.com/mixutin/dauntless-revived), baseado em [Undaunted](https://github.com/SyST3MDeV/Undaunted), conforme avisos do projeto original. Licença **AGPL-3.0-only**. Consulte o arquivo de licença e `NOTICE.md`. Projeto não afiliado à Phoenix Labs ou Epic Games.
